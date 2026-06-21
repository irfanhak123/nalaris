"""
gateway/agent_bridge.py — Bridge to the Hermes AIAgent.

Creates agents, submits prompts, streams responses via callbacks.
Must run from the hermes-agent venv (or have it on PYTHONPATH).
"""

import asyncio
import logging
import os
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# Ensure hermes-agent is importable
HERMES_ROOT = Path("/home/laptophp/.hermes/hermes-agent")
if str(HERMES_ROOT) not in sys.path:
    sys.path.insert(0, str(HERMES_ROOT))


class StreamHandle:
    """Represents an active SSE stream for a chat turn."""

    def __init__(self, stream_id: str, session_id: str):
        self.stream_id = stream_id
        self.session_id = session_id
        self.queue: asyncio.Queue[Optional[dict]] = asyncio.Queue()
        self.cancelled = False
        self.done = False
        self.started_at = time.time()
        self._agent: Any = None

    def push(self, event_type: str, data: dict) -> None:
        """Push an SSE event. Thread-safe via asyncio.Queue.put_nowait."""
        if self.cancelled or self.done:
            return
        try:
            self.queue.put_nowait({"type": event_type, "data": data})
        except asyncio.QueueFull:
            logger.warning("Stream %s queue full, dropping event %s", self.stream_id, event_type)

    def finish(self) -> None:
        """Signal stream completion."""
        self.done = True
        try:
            self.queue.put_nowait(None)  # sentinel
        except asyncio.QueueFull:
            pass

    def cancel(self) -> None:
        """Cancel the stream."""
        self.cancelled = True
        self.done = True
        try:
            self.queue.put_nowait(None)
        except asyncio.QueueFull:
            pass


class AgentBridge:
    """
    Manages AIAgent lifecycle for the custom gateway.

    Each chat turn creates (or reuses) an AIAgent instance.
    Tokens stream back via StreamHandle queues.
    """

    def __init__(self):
        self._streams: dict[str, StreamHandle] = {}
        self._agents: dict[str, Any] = {}  # session_id -> agent
        self._lock = threading.Lock()

    def get_stream(self, stream_id: str) -> Optional[StreamHandle]:
        return self._streams.get(stream_id)

    def cancel_stream(self, stream_id: str) -> bool:
        handle = self._streams.get(stream_id)
        if handle and not handle.done:
            handle.cancel()
            return True
        return False

    def start_chat(
        self,
        session_id: str,
        message: str,
        workspace: str = "",
        profile: str = "default",
        *,
        store: Any = None,  # SessionStore instance
    ) -> dict:
        """
        Start a chat turn. Returns stream info.

        Runs the agent in a background thread. Tokens flow through
        the StreamHandle's queue.
        """
        stream_id = f"st-{uuid.uuid4().hex[:12]}"
        handle = StreamHandle(stream_id, session_id)

        with self._lock:
            self._streams[stream_id] = handle

        # Ensure session exists
        if store:
            existing = store.get_session(session_id)
            if not existing:
                store.create_session(session_id, workspace, profile)
            store.add_message(session_id, "user", message)

        # Run agent in background thread
        thread = threading.Thread(
            target=self._run_agent,
            args=(handle, session_id, message, workspace, profile, store),
            daemon=True,
            name=f"agent-{stream_id}",
        )
        thread.start()

        return {
            "stream_id": stream_id,
            "session_id": session_id,
            "turn_id": f"t-{uuid.uuid4().hex[:8]}",
        }

    def _run_agent(
        self,
        handle: StreamHandle,
        session_id: str,
        message: str,
        workspace: str,
        profile: str,
        store: Any,
    ) -> None:
        """Run the AIAgent in a background thread."""
        try:
            from run_agent import AIAgent

            # Project Rumah model config — override global hermes config
            model = os.environ.get("RUMAH_MODEL", "mimo-v2.5-pro")
            provider = os.environ.get("RUMAH_PROVIDER", "xiaomi")
            base_url = os.environ.get("RUMAH_BASE_URL", "")
            api_key = os.environ.get("RUMAH_API_KEY", "")

            # Create a new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            # Build stream callbacks
            def on_token(text: str):
                handle.push("token", {"text": text})

            def on_reasoning(text: str):
                handle.push("reasoning", {"text": text})

            def on_tool_start(name: str, args: Any = None):
                handle.push("tool", {"name": name, "args": args or {}})

            def on_tool_complete(name: str, result: Any = None):
                handle.push("tool_complete", {"name": name, "result": result})

            # Create agent with project rumah model config (no stream_delta_callback)
            agent_kwargs = {}
            if provider:
                agent_kwargs["provider"] = provider
            if base_url:
                agent_kwargs["base_url"] = base_url
            if api_key:
                agent_kwargs["api_key"] = api_key

            agent = AIAgent(
                model=model,
                tool_start_callback=on_tool_start,
                tool_complete_callback=on_tool_complete,
                **agent_kwargs,
            )
            handle._agent = agent

            # Emit context_status
            handle.push("context_status", {"session_id": session_id})

            # Load conversation history for context
            history = []
            if store:
                messages = store.get_messages(session_id)
                for msg in messages[:-1]:  # exclude the user message we just added
                    history.append({"role": msg["role"], "content": msg["content"]})

            # Run the agent with stream_callback for token delivery
            result = agent.run_conversation(
                user_message=message,
                conversation_history=history if history else None,
                stream_callback=on_token,
            )

            # Extract response text
            # AIAgent.run_conversation() returns {"final_response": ..., "last_reasoning": ..., "messages": [...]}
            response_text = ""
            if isinstance(result, dict):
                response_text = (
                    result.get("final_response", "")
                    or result.get("content", "")
                    or result.get("text", "")
                    or ""
                )
            elif isinstance(result, str):
                response_text = result
            else:
                response_text = str(result) if result else ""

            # Emit done event
            handle.push("done", {"finish_reason": "stop"})

            # Persist assistant message
            if store and response_text:
                store.add_message(session_id, "assistant", response_text)

            # Generate title from first message if session title is default
            if store:
                session = store.get_session(session_id)
                if session and session.get("title") in ("Untitled", ""):
                    short = message[:60].strip()
                    if short:
                        store._conn.execute(
                            "UPDATE sessions SET title = ? WHERE session_id = ?",
                            (short, session_id),
                        )
                        store._conn.commit()
                        handle.push("title", {"title": short})

        except Exception as e:
            logger.exception("Agent error for stream %s", handle.stream_id)
            handle.push("error", {"error": str(e)})
        finally:
            handle.finish()
            # Clean up stream after a delay
            def cleanup():
                time.sleep(300)  # keep for 5 min
                self._streams.pop(handle.stream_id, None)

            threading.Thread(target=cleanup, daemon=True).start()

    def shutdown(self) -> None:
        """Cancel all active streams."""
        for handle in self._streams.values():
            handle.cancel()
