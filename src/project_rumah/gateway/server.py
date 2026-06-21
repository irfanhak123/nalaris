1|"""
2|gateway/server.py — Custom HTTP gateway for Project Rumah.
3|
4|Replaces hermes-webui. Owns all API routes panel-v2 needs.
5|Runs on port 8790 (same as old FastAPI, absorbed into this).
6|
7|Usage:
8|    python -m gateway.server              # foreground
9|    python gateway/server.py --port 8790  # custom port
10|"""
11|
12|import asyncio
13|import json
14|import logging
15|import os
16|import signal
17|import sys
18|import threading
19|import time
20|from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
21|from pathlib import Path
22|from typing import Any, Optional
23|from urllib.parse import parse_qs, urlsplit

from . import paths
24|
25|# ── Setup ──
26|
27|logging.basicConfig(
28|    level=logging.INFO,
29|    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
30|    datefmt="%H:%M:%S",
31|)
32|logger = logging.getLogger("gateway")
33|
34|# Ignore SIGPIPE (POSIX only)
35|_SIGPIPE = getattr(signal, "SIGPIPE", None)
36|if _SIGPIPE is not None:
37|    signal.signal(_SIGPIPE, signal.SIG_IGN)
38|
39|# ── Globals (initialized in main) ──
40|
41|store = None      # SessionStore
42|bridge = None     # AgentBridge
43|HOST = "0.0.0.0"
44|PORT = 8790
45|
46|
47|# ── Import legacy modules (from old FastAPI) ──
48|
49|def _import_legacy():
50|    """Import the old project-rumah modules for /state, /blocks, etc."""
51|    legacy_src = Path("/mnt/d/project-rumah/src")
52|    if str(legacy_src) not in sys.path:
53|        sys.path.insert(0, str(legacy_src))
54|
55|
56|# ── JSON response helper ──
57|
58|def json_response(handler: BaseHTTPRequestHandler, data: Any, status: int = 200, extra_headers: dict = None) -> bool:
59|    """Send a JSON response."""
60|    body = json.dumps(data, default=str).encode("utf-8")
61|    handler.send_response(status)
62|    handler.send_header("Content-Type", "application/json")
63|    handler.send_header("Content-Length", str(len(body)))
64|    if extra_headers:
65|        for k, v in extra_headers.items():
66|            handler.send_header(k, v)
67|    # CORS
68|    handler.send_header("Access-Control-Allow-Origin", "*")
69|    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
70|    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
71|    handler.end_headers()
72|    handler.wfile.write(body)
73|    return True
74|
75|
76|def sse_response(handler: BaseHTTPRequestHandler, generator) -> bool:
77|    """Send an SSE streaming response."""
78|    handler.send_response(200)
79|    handler.send_header("Content-Type", "text/event-stream")
80|    handler.send_header("Cache-Control", "no-cache")
81|    handler.send_header("Connection", "keep-alive")
82|    handler.send_header("Access-Control-Allow-Origin", "*")
83|    handler.end_headers()
84|
85|    try:
86|        loop = asyncio.new_event_loop()
87|        asyncio.set_event_loop(loop)
88|
89|        async def _run():
90|            async for chunk in generator:
91|                handler.wfile.write(chunk.encode("utf-8"))
92|                handler.wfile.flush()
93|
94|        loop.run_until_complete(_run())
95|    except (BrokenPipeError, ConnectionResetError):
96|        pass
97|    except Exception as e:
98|        logger.warning("SSE error: %s", e)
99|    finally:
100|        loop.close()
101|    return True
102|
103|
104|# ── Request Handler ──
105|
106|class GatewayHandler(BaseHTTPRequestHandler):
107|    """HTTP request handler with route dispatch."""
108|
109|    def log_message(self, format, *args):
110|        """Override to use our logger."""
111|        logger.debug(format, *args)
112|
113|    def do_OPTIONS(self):
114|        """Handle CORS preflight."""
115|        self.send_response(200)
116|        self.send_header("Access-Control-Allow-Origin", "*")
117|        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
118|        self.send_header("Access-Control-Allow-Headers", "Content-Type")
119|        self.end_headers()
120|
121|    def do_GET(self):
122|        parsed = urlsplit(self.path)
123|        handled = self._handle_get(parsed)
124|        if not handled:
125|            json_response(self, {"error": "Not found"}, 404)
126|
127|    def do_POST(self):
128|        parsed = urlsplit(self.path)
129|        handled = self._handle_post(parsed)
130|        if not handled:
131|            json_response(self, {"error": "Not found"}, 404)
132|
133|    def _read_json_body(self) -> dict:
134|        """Read and parse JSON request body."""
135|        content_length = int(self.headers.get("Content-Length", 0))
136|        if content_length == 0:
137|            return {}
138|        body = self.rfile.read(content_length)
139|        try:
140|            return json.loads(body)
141|        except json.JSONDecodeError:
142|            return {}
143|
144|    # ── GET routes ──
145|
146|    def _handle_get(self, parsed) -> bool:
147|        path = parsed.path
148|        qs = parse_qs(parsed.query)
149|
150|        # Health check
151|        if path == "/health":
152|            return json_response(self, {
153|                "status": "ok",
154|                "sessions": 0,
155|                "active_streams": len(bridge._streams) if bridge else 0,
156|            })
157|
158|        # Read session
159|        if path == "/api/session":
160|            session_id = qs.get("session_id", [""])[0]
161|            include_messages = qs.get("messages", ["0"])[0] == "1"
162|            if not session_id:
163|                return json_response(self, {"error": "session_id required"}, 400)
164|            session = store.get_session(session_id, include_messages=include_messages)
165|            if not session:
166|                return json_response(self, {"error": "Session not found"}, 404)
167|            return json_response(self, {"session": session})
168|
169|        # SSE stream
170|        if path == "/api/chat/stream":
171|            stream_id = qs.get("stream_id", [""])[0]
172|            if not stream_id:
173|                return json_response(self, {"error": "stream_id required"}, 400)
174|            handle = bridge.get_stream(stream_id)
175|            if not handle:
176|                return json_response(self, {"error": "Stream not found"}, 404)
177|            from gateway.sse import stream_from_queue
178|            return sse_response(self, stream_from_queue(handle.queue))
179|
180|        # Stream status (panel-v2 checks this)
181|        if path == "/api/chat/stream/status":
182|            stream_id = qs.get("stream_id", [""])[0]
183|            handle = bridge.get_stream(stream_id) if stream_id else None
184|            return json_response(self, {
185|                "active": handle is not None and not handle.done,
186|                "stream_id": stream_id,
187|            })
188|
189|        # ── Legacy endpoints (from old FastAPI) ──
190|
191|        if path == "/state":
192|            return self._handle_state()
193|
194|        if path == "/blocks":
195|            chat_tail = qs.get("chat_tail", [""])[0]
196|            return self._handle_blocks(chat_tail)
197|
198|        if path == "/panel-session":
199|            return self._handle_get_panel_session()
200|
201|        return False
202|
203|    # ── POST routes ──
204|
205|    def _handle_post(self, parsed) -> bool:
206|        path = parsed.path
207|
208|        # Create new session
209|        if path == "/api/session/new":
210|            body = self._read_json_body()
211|            session_id = body.get("session_id") or f"s-{int(time.time()*1000):x}"
212|            workspace = body.get("workspace", "")
213|            profile = body.get("profile", "default")
214|            title = body.get("title", "Untitled")
215|            session = store.create_session(session_id, workspace, profile, title)
216|            return json_response(self, {"session": session})
217|
218|        # Save draft
219|        if path == "/api/session/draft":
220|            body = self._read_json_body()
221|            session_id = body.get("session_id", "")
222|            text = body.get("text", "")
223|            if not session_id:
224|                return json_response(self, {"error": "session_id required"}, 400)
225|            store.save_draft(session_id, text)
226|            return json_response(self, {"ok": True})
227|
228|        # Clear session
229|        if path == "/api/session/clear":
230|            body = self._read_json_body()
231|            session_id = body.get("session_id", "")
232|            if not session_id:
233|                return json_response(self, {"error": "session_id required"}, 400)
234|            session = store.clear_session(session_id)
235|            if not session:
236|                return json_response(self, {"error": "Session not found"}, 404)
237|            return json_response(self, {"ok": True, "session": session})
238|
239|        # Start chat turn
240|        if path == "/api/chat/start":
241|            try:
242|                body = self._read_json_body()
243|                session_id = body.get("session_id", "")
244|                message = body.get("message", "")
245|                workspace = body.get("workspace", "")
246|                profile = body.get("profile", "default")
247|                if not session_id or not message:
248|                    return json_response(self, {"error": "session_id and message required"}, 400)
249|                result = bridge.start_chat(session_id, message, workspace, profile, store=store)
250|                return json_response(self, result)
251|            except Exception as e:
252|                logger.exception("chat/start error")
253|                return json_response(self, {"error": str(e)}, 500)
254|
255|        # Cancel stream
256|        if path == "/api/chat/cancel":
257|            body = self._read_json_body()
258|            stream_id = body.get("stream_id", "")
259|            if not stream_id:
260|                return json_response(self, {"error": "stream_id required"}, 400)
261|            cancelled = bridge.cancel_stream(stream_id)
262|            return json_response(self, {"ok": cancelled})
263|
264|        # ── Legacy endpoints ──
265|
266|        if path == "/panel-session":
267|            return self._handle_set_panel_session()
268|
269|        if path == "/chat":
270|            return self._handle_legacy_chat()
271|
272|        return False
273|
274|    # ── Legacy handlers (absorbed from old FastAPI) ──
275|
276|    def _handle_state(self) -> bool:
277|        """GET /state — vault + calendar + memory state."""
278|        try:
279|            _import_legacy()
280|            from project_rumah import state
281|            s = state.read_state()
282|            return json_response(self, s)
283|        except Exception as e:
284|            logger.warning("Legacy /state error: %s", e)
285|            return json_response(self, {"error": str(e)}, 500)
286|
287|    def _handle_blocks(self, chat_tail: str = "") -> bool:
288|        """GET /blocks — composed blocks array."""
289|        try:
290|            _import_legacy()
291|            from project_rumah import state, compose
292|            raw = state.read_state()
293|            tail = []
294|            if chat_tail:
295|                try:
296|                    tail = json.loads(chat_tail)
297|                except json.JSONDecodeError:
298|                    pass
299|            blocks = compose.compose(raw, chat_tail=tail)
300|            return json_response(self, {
301|                "blocks": blocks,
302|                "raw": raw,
303|                "_meta": {"block_count": len(blocks)},
304|            })
305|        except Exception as e:
306|            logger.warning("Legacy /blocks error: %s", e)
307|            return json_response(self, {"error": str(e)}, 500)
308|
309|    def _handle_get_panel_session(self) -> bool:
310|        """GET /panel-session — read cron bridge session ID."""
311|        panel_session_file = paths.panel_session_file()
312|        if panel_session_file.exists():
313|            sid = panel_session_file.read_text().strip()
314|            return json_response(self, {"ok": True, "session_id": sid})
315|        return json_response(self, {"ok": False, "session_id": None})
316|
317|    def _handle_set_panel_session(self) -> bool:
318|        """POST /panel-session — write cron bridge session ID."""
319|        body = self._read_json_body()
320|        session_id = body.get("session_id", "")
321|        if not session_id:
322|            return json_response(self, {"error": "session_id required"}, 400)
323|        try:
324|            paths.panel_session_file().write_text(session_id)
325|            return json_response(self, {"ok": True, "session_id": session_id})
326|        except OSError as e:
327|            return json_response(self, {"ok": False, "error": str(e)}, 500)
328|
329|    def _handle_legacy_chat(self) -> bool:
330|        """POST /chat — legacy block action handler."""
331|        body = self._read_json_body()
332|        try:
333|            _import_legacy()
334|            from project_rumah import state as state_mod, chat
335|            s = state_mod.read_state()
336|            result = chat.handle_action(body, s)
337|            return json_response(self, result)
338|        except Exception as e:
339|            logger.warning("Legacy /chat error: %s", e)
340|            return json_response(self, {"ok": False, "error": str(e)}, 500)
341|
342|
343|# ── Server lifecycle ──
344|
345|def run_server(host: str = HOST, port: int = PORT):
346|    """Start the gateway server."""
347|    global store, bridge
348|
349|    from gateway.session_store import SessionStore
350|    from gateway.agent_bridge import AgentBridge
351|
352|    store = SessionStore()
353|    bridge = AgentBridge()
354|
355|    server = ThreadingHTTPServer((host, port), GatewayHandler)
356|    logger.info("Gateway listening on http://%s:%d", host, port)
    logger.info("Panel static dir: %s", paths.static_dir())
    logger.info("Data dir: %s", paths.data_dir())
357|
358|    def shutdown(signum, frame):
359|        logger.info("Shutting down...")
360|        bridge.shutdown()
361|        store.close()
362|        server.shutdown()
363|
364|    signal.signal(signal.SIGINT, shutdown)
365|    signal.signal(signal.SIGTERM, shutdown)
366|
367|    try:
368|        server.serve_forever()
369|    except KeyboardInterrupt:
370|        pass
371|    finally:
372|        bridge.shutdown()
373|        store.close()
374|        server.server_close()
375|
376|
377|if __name__ == "__main__":
378|    import argparse
379|
380|    parser = argparse.ArgumentParser(description="Project Rumah Gateway")
381|    parser.add_argument("--host", default=HOST)
382|    parser.add_argument("--port", type=int, default=PORT)
383|    args = parser.parse_args()
384|
385|    run_server(args.host, args.port)
386|