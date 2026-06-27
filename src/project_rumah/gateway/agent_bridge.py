"""
gateway/agent_bridge.py — Bridge to the Hermes AIAgent.

Creates agents, submits prompts, streams responses via callbacks.
Must run from the hermes-agent venv (or have it on PYTHONPATH).
"""

import asyncio
import json
import logging
import os
import queue as _queue
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


# ── Alignment ──
#
# "Onboarding" is not a static form. It is a conversation the agent drives
# to align itself with the one user: what they want to achieve, habits they
# want to develop, and what's going on in their life right now. The user can
# trigger it at any time (POST /api/align), not only on first launch.
#
# Findings are persisted in the user's preferences.alignment and fed back to
# the agent as `system_message` on every turn, so the agent stays aligned.
# The agent emits a machine-readable [[block:alignment-profile:{...}]] fence
# to hand structured findings to the gateway; the gateway strips that fence
# from the stored message and saves the findings.

ALIGNMENT_DIRECTIVE = """[ALIGNMENT MODE]
You are aligning with {name}, the one person you work with. This is not a phase or a checklist — it is who you are: genuinely curious about the people you help. Right now curiosity leads.

Your goal: understand this person deeply enough to be genuinely useful. Not through an interview — through real conversation.

CONVERSATION ARC (adapt naturally, do not march through it):
1. Greet them by name. Ask what brought them here — what do they hope a personal assistant could help with?
2. Their life right now — what does a typical day look like? Work, school, both?
3. What they're working toward — goals, projects, things they care about. Ask WHY each one matters.
4. Habits and routines — what do they already do? What do they want to start? What's been hard to stick with?
5. What's hard right now — stress, time wasters, things they keep forgetting, friction in their day.
6. How they like to communicate — short and direct or detailed? Proactive assistant or wait-to-be-asked?

RULES:
- ONE question per turn. Listen fully before moving on.
- Follow up on interesting answers. If they mention a goal, dig into why. If they mention a struggle, ask what they've tried.
- Use blocks to capture structured data (goals, habits, routines) so they see what you've learned.
- After 4-6 exchanges, summarize what you know and ask what's missing.
- Be genuinely warm but not performative. Real curiosity, not a checklist.
- No emoji. No em-dash. No curly quotes.
- 2-4 sentences max per turn during alignment.

PERSISTING WHAT YOU LEARN:
Every time you learn something concrete about {name}, emit a machine-readable fence on its own line so the system can save it:
[[block:alignment-profile:{{"goals": ["..."], "habits": ["..."], "situation": "...", "summary": "..."}}]]
Include only the keys you have evidence for. This fence is invisible to {name} — also write a warm, human-readable summary in plain text (and visible blocks) for them to read. Update the fence as your understanding deepens across turns.

This curiosity does not end after alignment. You will always be learning about them — feelings, thoughts, plans, struggles. Every conversation is data."""


def _build_user_context(name: str, alignment: dict) -> str:
    """Render the user's alignment findings as a system_message context block.

    Returns '' when there is nothing to share, so the caller can pass None
    and let hermes use its default system prompt.
    """
    if not alignment:
        return ""
    lines = ["[USER CONTEXT]", f"Name: {name or 'the user'}"]
    goals = alignment.get("goals")
    if goals:
        lines.append("What they're working toward: " + "; ".join(goals) if isinstance(goals, list) else str(goals))
    habits = alignment.get("habits")
    if habits:
        lines.append("Habits they're building: " + "; ".join(habits) if isinstance(habits, list) else str(habits))
    situation = alignment.get("situation")
    if situation:
        lines.append(f"What's going on right now: {situation}")
    summary = alignment.get("summary")
    if summary:
        lines.append(f"Summary: {summary}")
    # Free-form notes the agent may have recorded.
    notes = alignment.get("notes")
    if notes:
        lines.append(f"Notes: {notes}")
    return "\n".join(lines)


def _extract_alignment_profile(text: str) -> tuple[dict, str]:
    """Pull the first [[block:alignment-profile:{json}]] fence out of `text`.

    Returns (findings, cleaned_text). findings is {} if no fence was found.
    The fence is removed from cleaned_text so the user never sees raw JSON.
    Uses a bracket-depth scan because the JSON body can contain nested ]].
    """
    marker = "[[block:alignment-profile:"
    start = text.find(marker)
    if start == -1:
        return {}, text
    body_start = start + len(marker)
    end = _find_fence_end(text, body_start)
    if end == -1:
        return {}, text
    inner = text[body_start:end]
    # inner is `{json}` followed by `]]` — strip a trailing `]]` if present
    inner = inner.rstrip()
    if inner.endswith("]]"):
        inner = inner[:-2].rstrip()
    try:
        data = json.loads(inner)
        if isinstance(data, dict):
            cleaned = text[:start] + text[end + 2:]
            return data, cleaned.strip()
    except json.JSONDecodeError:
        pass
    return {}, text


def _find_fence_end(text: str, body_start: int) -> int:
    """Index of the first `]` of the `]]` terminator that closes the fence."""
    pos = body_start
    in_string = False
    escape = False
    depth = 0
    while pos < len(text):
        ch = text[pos]
        if escape:
            escape = False
            pos += 1
            continue
        if ch == "\\" and in_string:
            escape = True
            pos += 1
            continue
        if ch == '"':
            in_string = not in_string
            pos += 1
            continue
        if in_string:
            pos += 1
            continue
        if ch == "{" or ch == "[":
            depth += 1
            pos += 1
            continue
        if ch == "}" or ch == "]":
            if ch == "]" and pos + 1 < len(text) and text[pos + 1] == "]" and depth <= 0:
                return pos
            depth -= 1
            pos += 1
            continue
        pos += 1
    return -1


class StreamHandle:
    """Represents an active SSE stream for a chat turn."""

    def __init__(self, stream_id: str, session_id: str):
        self.stream_id = stream_id
        self.session_id = session_id
        # Thread-safe queue: the agent runs in a background thread and pushes
        # events here, while the SSE consumer drains it from an asyncio loop.
        # An asyncio.Queue would NOT wake a getter on a different loop from
        # another thread (call_soon vs call_soon_threadsafe), so the consumer
        # would block forever and no event would ever reach the client.
        self.queue: "_queue.Queue[Optional[dict]]" = _queue.Queue()
        self.cancelled = False
        self.done = False
        self.started_at = time.time()
        self._agent: Any = None

    def push(self, event_type: str, data: dict) -> None:
        """Push an SSE event. Thread-safe via queue.Queue.put."""
        if self.cancelled or self.done:
            return
        try:
            self.queue.put({"type": event_type, "data": data}, timeout=5.0)
        except _queue.Full:
            logger.warning("Stream %s queue full, dropping event %s", self.stream_id, event_type)

    def finish(self) -> None:
        """Signal stream completion."""
        self.done = True
        try:
            self.queue.put(None, timeout=5.0)  # sentinel
        except _queue.Full:
            pass

    def cancel(self) -> None:
        """Cancel the stream."""
        self.cancelled = True
        self.done = True
        try:
            self.queue.put(None, timeout=5.0)
        except _queue.Full:
            pass


class StreamBusyError(Exception):
    """Raised when a session already has an active (non-done) stream.

    Carries the in-flight stream_id so the client can attach to it instead
    of starting a duplicate turn.
    """

    def __init__(self, active_stream_id: str):
        super().__init__("session is busy")
        self.active_stream_id = active_stream_id


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

    def _register_stream(self, handle: "StreamHandle") -> None:
        """Atomically reject a second concurrent turn on the same session and
        register the new handle. Raises StreamBusyError if the session already
        has an active (non-done) stream — this is what prevents duplicate
        responses when the client double-fires (React StrictMode remount,
        double-click, two tabs, etc.).
        """
        with self._lock:
            for h in self._streams.values():
                if h.session_id == handle.session_id and not h.done:
                    raise StreamBusyError(h.stream_id)
            self._streams[handle.stream_id] = handle

    def is_session_streaming(self, session_id: str) -> bool:
        """True if any non-done stream is running for this session."""
        with self._lock:
            for handle in self._streams.values():
                if handle.session_id == session_id and not handle.done:
                    return True
        return False

    def active_stream_id_for(self, session_id: str) -> Optional[str]:
        """The stream_id of the active (non-done) stream for a session, if any."""
        with self._lock:
            for handle in self._streams.values():
                if handle.session_id == session_id and not handle.done:
                    return handle.stream_id
        return None

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
        client_msg_id: str = None,
    ) -> dict:
        """
        Start a chat turn. Returns stream info.

        Runs the agent in a background thread. Tokens flow through
        the StreamHandle's queue.
        """
        stream_id = f"st-{uuid.uuid4().hex[:12]}"
        handle = StreamHandle(stream_id, session_id)

        try:
            self._register_stream(handle)
        except StreamBusyError as e:
            return {
                "stream_id": e.active_stream_id,
                "session_id": session_id,
                "turn_id": None,
                "active_stream_id": e.active_stream_id,
                "busy": True,
            }

        # Ensure session exists
        if store:
            existing = store.get_session(session_id)
            if not existing:
                store.create_session(session_id, workspace, profile)
            # Persist the client_msg_id so the frontend can dedup its
            # optimistic user bubble against the server-stored copy.
            store.add_message(
                session_id, "user", message, client_msg_id=client_msg_id
            )

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

    def start_alignment(
        self,
        session_id: str,
        *,
        store: Any = None,
        workspace: str = "",
        profile: str = "default",
    ) -> dict:
        """Kick off an on-demand alignment conversation.

        The agent opens with its first question — no synthetic user bubble is
        stored, so the thread stays clean. The alignment directive is passed
        as the turn's system_message; findings the agent emits are persisted
        by _run_agent.
        """
        stream_id = f"st-{uuid.uuid4().hex[:12]}"
        handle = StreamHandle(stream_id, session_id)

        try:
            self._register_stream(handle)
        except StreamBusyError as e:
            # Already aligning/chatting — don't start a duplicate turn.
            return {
                "stream_id": e.active_stream_id,
                "session_id": session_id,
                "turn_id": None,
                "active_stream_id": e.active_stream_id,
                "alignment": True,
                "busy": True,
            }

        if store:
            existing = store.get_session(session_id)
            if not existing:
                store.create_session(session_id, workspace, profile)

        # Internal cue for the agent only — NOT persisted as a user message,
        # so the panel never shows a synthetic bubble. The alignment directive
        # lives in the system_message, set inside _run_agent.
        cue = "Let's get aligned. Greet me by name and ask your first question."

        thread = threading.Thread(
            target=self._run_agent,
            args=(handle, session_id, cue, workspace, profile, store),
            kwargs={"alignment_mode": True},
            daemon=True,
            name=f"align-{stream_id}",
        )
        thread.start()

        return {
            "stream_id": stream_id,
            "session_id": session_id,
            "turn_id": f"t-{uuid.uuid4().hex[:8]}",
            "alignment": True,
        }

    def _run_agent(
        self,
        handle: StreamHandle,
        session_id: str,
        message: str,
        workspace: str,
        profile: str,
        store: Any,
        *,
        alignment_mode: bool = False,
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
            reasoning_buf: list[str] = []
            tool_calls_log: list[dict] = []

            def on_token(text: str):
                handle.push("token", {"text": text})

            def on_reasoning(text: str):
                # Stream to the client and accumulate for persistence.
                if text:
                    reasoning_buf.append(text)
                handle.push("reasoning", {"text": text})

            def on_tool_start(name: str, args: Any = None):
                tool_calls_log.append({
                    "name": name,
                    "args": args or {},
                    "pending": True,
                    "startedAt": time.time(),
                })
                handle.push("tool", {"name": name, "args": args or {}})

            def on_tool_complete(name: str, result: Any = None):
                for tc in tool_calls_log:
                    if tc["name"] == name and tc.get("pending"):
                        tc["result"] = result
                        tc["pending"] = False
                        tc["completedAt"] = time.time()
                        break
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
                reasoning_callback=on_reasoning,
                thinking_callback=on_reasoning,
                **agent_kwargs,
            )
            handle._agent = agent

            # Emit context_status
            handle.push("context_status", {"session_id": session_id})

            # Load the single user's alignment so the agent stays aligned
            # every turn. In alignment mode the directive is the system
            # message; otherwise the findings are the system message.
            user_name = "the user"
            alignment = {}
            if store:
                single = store.get_single_user()
                if single:
                    user_name = single.get("name") or user_name
                    alignment = store.get_alignment(single["user_id"]) or {}
            if alignment_mode:
                system_message = ALIGNMENT_DIRECTIVE.format(name=user_name)
                ctx = _build_user_context(user_name, alignment)
                if ctx:
                    system_message += "\n\n" + ctx
            else:
                system_message = _build_user_context(user_name, alignment) or None

            # Load conversation history for context
            history = []
            if store:
                messages = store.get_messages(session_id)
                # In normal chat the last stored message is the user turn we
                # just persisted (passed as `message`), so exclude it. In
                # alignment mode we did NOT persist a user message, so keep
                # the full history.
                prior = messages[:-1] if not alignment_mode else messages
                for msg in prior:
                    history.append({"role": msg["role"], "content": msg["content"]})

            # Run the agent with stream_callback for token delivery
            result = agent.run_conversation(
                user_message=message,
                system_message=system_message,
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

            # The agent may emit a [[block:alignment-profile:{...}]] fence to
            # hand structured findings to us. Strip it from the stored message
            # (so the user never sees raw JSON) and persist the findings.
            findings = {}
            if response_text:
                findings, response_text = _extract_alignment_profile(response_text)
            if findings and store:
                single = store.get_single_user()
                if single:
                    store.set_alignment(single["user_id"], findings)
                    handle.push("alignment", {"alignment": store.get_alignment(single["user_id"])})

            # Persist the assistant message BEFORE emitting `done`, so a
            # client that reconciles immediately on `done` sees the final
            # message instead of an empty bubble. Carry reasoning + tool
            # calls so the post-turn inspector survives a refresh.
            reasoning_text = "".join(reasoning_buf).strip() or None
            if store and response_text:
                store.add_message(
                    session_id,
                    "assistant",
                    response_text,
                    reasoning=reasoning_text,
                    tool_calls=tool_calls_log or None,
                    finish_reason="stop",
                )

            # Emit done event after persistence
            handle.push("done", {"finish_reason": "stop"})

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
