1|"""
2|gateway/agent_bridge.py — Bridge to the Hermes AIAgent.
3|
4|Creates agents, submits prompts, streams responses via callbacks.
5|Must run from the hermes-agent venv (or have it on PYTHONPATH).
6|"""
7|
8|import asyncio
9|import logging
10|import os
11|import sys
12|import threading
13|import time
14|import uuid
15|from pathlib import Path
16|from typing import Any, Callable, Optional
17|
18|logger = logging.getLogger(__name__)
19|
20|# Ensure hermes-agent is importable
21|HERMES_ROOT = Path("/home/laptophp/.hermes/hermes-agent")
22|if str(HERMES_ROOT) not in sys.path:
23|    sys.path.insert(0, str(HERMES_ROOT))
24|
25|
26|class StreamHandle:
27|    """Represents an active SSE stream for a chat turn."""
28|
29|    def __init__(self, stream_id: str, session_id: str):
30|        self.stream_id = stream_id
31|        self.session_id = session_id
32|        self.queue: asyncio.Queue[Optional[dict]] = asyncio.Queue()
33|        self.cancelled = False
34|        self.done = False
35|        self.started_at = time.time()
36|        self._agent: Any = None
37|
38|    def push(self, event_type: str, data: dict) -> None:
39|        """Push an SSE event. Thread-safe via asyncio.Queue.put_nowait."""
40|        if self.cancelled or self.done:
41|            return
42|        try:
43|            self.queue.put_nowait({"type": event_type, "data": data})
44|        except asyncio.QueueFull:
45|            logger.warning("Stream %s queue full, dropping event %s", self.stream_id, event_type)
46|
47|    def finish(self) -> None:
48|        """Signal stream completion."""
49|        self.done = True
50|        try:
51|            self.queue.put_nowait(None)  # sentinel
52|        except asyncio.QueueFull:
53|            pass
54|
55|    def cancel(self) -> None:
56|        """Cancel the stream."""
57|        self.cancelled = True
58|        self.done = True
59|        try:
60|            self.queue.put_nowait(None)
61|        except asyncio.QueueFull:
62|            pass
63|
64|
65|class AgentBridge:
66|    """
67|    Manages AIAgent lifecycle for the custom gateway.
68|
69|    Each chat turn creates (or reuses) an AIAgent instance.
70|    Tokens stream back via StreamHandle queues.
71|    """
72|
73|    def __init__(self):
74|        self._streams: dict[str, StreamHandle] = {}
75|        self._agents: dict[str, Any] = {}  # session_id -> agent
76|        self._lock = threading.Lock()
77|
78|    def get_stream(self, stream_id: str) -> Optional[StreamHandle]:
79|        return self._streams.get(stream_id)
80|
81|    def cancel_stream(self, stream_id: str) -> bool:
82|        handle = self._streams.get(stream_id)
83|        if handle and not handle.done:
84|            handle.cancel()
85|            return True
86|        return False
87|
88|    def start_chat(
89|        self,
90|        session_id: str,
91|        message: str,
92|        workspace: str = "",
93|        profile: str = "default",
94|        *,
95|        store: Any = None,  # SessionStore instance
96|    ) -> dict:
97|        """
98|        Start a chat turn. Returns stream info.
99|
100|        Runs the agent in a background thread. Tokens flow through
101|        the StreamHandle's queue.
102|        """
103|        stream_id = f"st-{uuid.uuid4().hex[:12]}"
104|        handle = StreamHandle(stream_id, session_id)
105|
106|        with self._lock:
107|            self._streams[stream_id] = handle
108|
109|        # Ensure session exists
110|        if store:
111|            existing = store.get_session(session_id)
112|            if not existing:
113|                store.create_session(session_id, workspace, profile)
114|            store.add_message(session_id, "user", message)
115|
116|        # Run agent in background thread
117|        thread = threading.Thread(
118|            target=self._run_agent,
119|            args=(handle, session_id, message, workspace, profile, store),
120|            daemon=True,
121|            name=f"agent-{stream_id}",
122|        )
123|        thread.start()
124|
125|        return {
126|            "stream_id": stream_id,
127|            "session_id": session_id,
128|            "turn_id": f"t-{uuid.uuid4().hex[:8]}",
129|        }
130|
131|    def _run_agent(
132|        self,
133|        handle: StreamHandle,
134|        session_id: str,
135|        message: str,
136|        workspace: str,
137|        profile: str,
138|        store: Any,
139|    ) -> None:
140|        """Run the AIAgent in a background thread."""
141|        try:
142|            from run_agent import AIAgent
143|
144|            # Project Rumah model config — override global hermes config
145|            model = os.environ.get("RUMAH_MODEL", "mimo-v2.5-pro")
146|            provider = os.environ.get("RUMAH_PROVIDER", "xiaomi")
147|            base_url = os.environ.get("RUMAH_BASE_URL", "")
148|            api_key = os.environ.get("RUMAH_API_KEY", "")
149|
150|            # Create a new event loop for this thread
151|            loop = asyncio.new_event_loop()
152|            asyncio.set_event_loop(loop)
153|
154|            # Build stream callbacks
155|            def on_token(text: str):
156|                handle.push("token", {"text": text})
157|
158|            def on_reasoning(text: str):
159|                handle.push("reasoning", {"text": text})
160|
161|            def on_tool_start(name: str, args: Any = None):
162|                handle.push("tool", {"name": name, "args": args or {}})
163|
164|            def on_tool_complete(name: str, result: Any = None):
165|                handle.push("tool_complete", {"name": name, "result": result})
166|
167|            # Create agent with project rumah model config (no stream_delta_callback)
168|            agent_kwargs = {}
169|            if provider:
170|                agent_kwargs["provider"] = provider
171|            if base_url:
172|                agent_kwargs["base_url"] = base_url
173|            if api_key:
174|                agent_kwargs["api_key"] = api_key
175|
176|            agent = AIAgent(
177|                model=model,
178|                tool_start_callback=on_tool_start,
179|                tool_complete_callback=on_tool_complete,
180|                **agent_kwargs,
181|            )
182|            handle._agent = agent
183|
184|            # Emit context_status
185|            handle.push("context_status", {"session_id": session_id})
186|
187|            # Load conversation history for context
188|            history = []
189|            if store:
190|                messages = store.get_messages(session_id)
191|                for msg in messages[:-1]:  # exclude the user message we just added
192|                    history.append({"role": msg["role"], "content": msg["content"]})
193|
194|            # Run the agent with stream_callback for token delivery
195|            result = agent.run_conversation(
196|                user_message=message,
197|                conversation_history=history if history else None,
198|                stream_callback=on_token,
199|            )
200|
201|            # Extract response text
202|            # AIAgent.run_conversation() returns {"final_response": ..., "last_reasoning": ..., "messages": [...]}
203|            response_text = ""
204|            if isinstance(result, dict):
205|                response_text = (
206|                    result.get("final_response", "")
207|                    or result.get("content", "")
208|                    or result.get("text", "")
209|                    or ""
210|                )
211|            elif isinstance(result, str):
212|                response_text = result
213|            else:
214|                response_text = str(result) if result else ""
215|
216|            # Emit done event
217|            handle.push("done", {"finish_reason": "stop"})
218|
219|            # Persist assistant message
220|            if store and response_text:
221|                store.add_message(session_id, "assistant", response_text)
222|
223|            # Generate title from first message if session title is default
224|            if store:
225|                session = store.get_session(session_id)
226|                if session and session.get("title") in ("Untitled", ""):
227|                    short = message[:60].strip()
228|                    if short:
229|                        store._conn.execute(
230|                            "UPDATE sessions SET title = ? WHERE session_id = ?",
231|                            (short, session_id),
232|                        )
233|                        store._conn.commit()
234|                        handle.push("title", {"title": short})
235|
236|        except Exception as e:
237|            logger.exception("Agent error for stream %s", handle.stream_id)
238|            handle.push("error", {"error": str(e)})
239|        finally:
240|            handle.finish()
241|            # Clean up stream after a delay
242|            def cleanup():
243|                time.sleep(300)  # keep for 5 min
244|                self._streams.pop(handle.stream_id, None)
245|
246|            threading.Thread(target=cleanup, daemon=True).start()
247|
248|    def shutdown(self) -> None:
249|        """Cancel all active streams."""
250|        for handle in self._streams.values():
251|            handle.cancel()
252|