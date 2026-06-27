"""
gateway/server.py — Custom HTTP gateway for Project Rumah.

Replaces hermes-webui. Owns all API routes panel-v2 needs.
Runs on port 8790 (same as old FastAPI, absorbed into this).

Usage:
    python -m gateway.server              # foreground
    python gateway/server.py --port 8790  # custom port
"""

import asyncio
import json
import logging
import os
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlsplit, unquote as _unquote

from . import paths

# ── Setup ──

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("gateway")

# Ignore SIGPIPE (POSIX only)
_SIGPIPE = getattr(signal, "SIGPIPE", None)
if _SIGPIPE is not None:
    signal.signal(_SIGPIPE, signal.SIG_IGN)

# ── Globals (initialized in main) ──

store = None      # SessionStore
bridge = None     # AgentBridge
HOST = "0.0.0.0"
PORT = 8790


# ── Import legacy modules (from old FastAPI) ──

def _import_legacy():
    """Import the old project-rumah modules for /state, /blocks, etc."""
    legacy_src = Path("/mnt/d/project-rumah/src")
    if str(legacy_src) not in sys.path:
        sys.path.insert(0, str(legacy_src))


# ── JSON response helper ──

def json_response(handler: BaseHTTPRequestHandler, data: Any, status: int = 200, extra_headers: dict = None) -> bool:
    """Send a JSON response."""
    body = json.dumps(data, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    if extra_headers:
        for k, v in extra_headers.items():
            handler.send_header(k, v)
    # CORS
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)
    return True


def _annotate_streaming(session: dict) -> dict:
    """Merge live stream state into a session dict so the panel can tell
    whether a turn is in flight and which stream to re-attach to."""
    if not isinstance(session, dict) or bridge is None:
        return session
    sid = session.get("session_id")
    if not sid:
        return session
    session["is_streaming"] = bridge.is_session_streaming(sid)
    session["active_stream_id"] = bridge.active_stream_id_for(sid)
    return session


def sse_response(handler: BaseHTTPRequestHandler, generator) -> bool:
    """Send an SSE streaming response."""
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("Connection", "keep-alive")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def _run():
            async for chunk in generator:
                handler.wfile.write(chunk.encode("utf-8"))
                handler.wfile.flush()

        loop.run_until_complete(_run())
    except (BrokenPipeError, ConnectionResetError):
        pass
    except Exception as e:
        logger.warning("SSE error: %s", e)
    finally:
        loop.close()
    return True


# ── Request Handler ──

class GatewayHandler(BaseHTTPRequestHandler):
    """HTTP request handler with route dispatch."""

    def log_message(self, format, *args):
        """Override to use our logger."""
        logger.debug(format, *args)

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlsplit(self.path)
        handled = self._handle_get(parsed)
        if not handled:
            json_response(self, {"error": "Not found"}, 404)

    def do_POST(self):
        parsed = urlsplit(self.path)
        handled = self._handle_post(parsed)
        if not handled:
            json_response(self, {"error": "Not found"}, 404)

    def _read_json_body(self) -> dict:
        """Read and parse JSON request body."""
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        body = self.rfile.read(content_length)
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}

    # ── Static file serving ──

    def _serve_static(self, path: str) -> bool:
        """Serve bundled panel static files; fall back to index.html for SPA routes."""
        static = paths.static_dir()
        if not static.exists():
            return json_response(self, {"error": "Panel files not found"}, 404)

        if path == "/":
            target = static / "index.html"
        else:
            # Strip leading slash and resolve safely within static dir
            relative = path.lstrip("/")
            target = (static / relative).resolve()
            # Prevent directory traversal outside static dir
            try:
                target.relative_to(static.resolve())
            except ValueError:
                return json_response(self, {"error": "Not found"}, 404)
            if not target.exists() or target.is_dir():
                target = static / "index.html"

        if not target.exists():
            return json_response(self, {"error": "Not found"}, 404)

        try:
            data = target.read_bytes()
        except OSError as e:
            logger.warning("Static read error for %s: %s", target, e)
            return json_response(self, {"error": str(e)}, 500)

        content_type = self._guess_content_type(target.suffix)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        return True

    def _guess_content_type(self, suffix: str) -> str:
        mapping = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".mjs": "application/javascript",
            ".json": "application/json",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".ico": "image/x-icon",
            ".woff2": "font/woff2",
            ".woff": "font/woff",
            ".ttf": "font/ttf",
        }
        return mapping.get(suffix.lower(), "application/octet-stream")

    # ── GET routes ──

    def _handle_get(self, parsed) -> bool:
        path = parsed.path
        qs = parse_qs(parsed.query)

        # Static panel files (SPA fallback)
        if path == "/" or path == "/index.html" or "." in path.split("/")[-1]:
            return self._serve_static(path)

        # Health check
        if path == "/health":
            return json_response(self, {
                "status": "ok",
                "sessions": 0,
                "active_streams": len(bridge._streams) if bridge else 0,
            })

        # ── User API ──

        # GET /api/me — the single user (with alignment findings)
        if path == "/api/me":
            user = store.get_single_user()
            if not user:
                user = store.get_or_create_single_user()
            return json_response(self, {"user": user})

        # GET /api/users — list all users
        if path == "/api/users":
            users = store.list_users()
            return json_response(self, {"users": users})

        # GET /api/users/:id — get a single user
        import re as _re
        m = _re.match(r"^/api/users/([^/]+)$", path)
        if m:
            uid = _unquote(m.group(1))
            user = store.get_user(uid)
            if not user:
                return json_response(self, {"error": "User not found"}, 404)
            return json_response(self, {"user": user})

        # GET /api/users/:id/sessions — list user sessions
        m = _re.match(r"^/api/users/([^/]+)/sessions$", path)
        if m:
            uid = _unquote(m.group(1))
            sessions = store.get_user_sessions(uid)
            return json_response(self, {"sessions": [_annotate_streaming(s) for s in sessions]})

        # Read session
        if path == "/api/session":
            session_id = qs.get("session_id", [""])[0]
            include_messages = qs.get("messages", ["0"])[0] == "1"
            if not session_id:
                return json_response(self, {"error": "session_id required"}, 400)
            session = store.get_session(session_id, include_messages=include_messages)
            if not session:
                return json_response(self, {"error": "Session not found"}, 404)
            return json_response(self, {"session": _annotate_streaming(session)})

        # SSE stream
        if path == "/api/chat/stream":
            stream_id = qs.get("stream_id", [""])[0]
            if not stream_id:
                return json_response(self, {"error": "stream_id required"}, 400)
            handle = bridge.get_stream(stream_id)
            if not handle:
                return json_response(self, {"error": "Stream not found"}, 404)
            from .sse import stream_from_queue
            return sse_response(self, stream_from_queue(handle.queue))

        # Stream status (panel-v2 checks this)
        if path == "/api/chat/stream/status":
            stream_id = qs.get("stream_id", [""])[0]
            handle = bridge.get_stream(stream_id) if stream_id else None
            return json_response(self, {
                "active": handle is not None and not handle.done,
                "stream_id": stream_id,
            })

        # ── Legacy endpoints (from old FastAPI) ──

        if path == "/state":
            return self._handle_state()

        if path == "/blocks":
            chat_tail = qs.get("chat_tail", [""])[0]
            return self._handle_blocks(chat_tail)

        if path == "/panel-session":
            return self._handle_get_panel_session()

        return False

    # ── POST routes ──

    def _handle_post(self, parsed) -> bool:
        path = parsed.path

        # ── User API ──

        import re as _re

        # POST /api/users — create a new user
        if path == "/api/users":
            body = self._read_json_body()
            name = body.get("name", "").strip()
            if not name:
                return json_response(self, {"error": "name required"}, 400)
            user_id = f"u-{int(time.time()*1000):x}"
            user = store.create_user(
                user_id,
                name,
                avatar_color=body.get("avatar_color", "#000000"),
                avatar_emoji=body.get("avatar_emoji"),
                preferences=body.get("preferences"),
            )
            return json_response(self, {"user": user})

        # POST /api/users/:id — update a user
        m = _re.match(r"^/api/users/([^/]+)$", path)
        if m:
            uid = _unquote(m.group(1))
            body = self._read_json_body()
            user = store.update_user(uid, **body)
            if not user:
                return json_response(self, {"error": "User not found"}, 404)
            return json_response(self, {"user": user})

        # POST /api/users/:id/onboard — mark user as onboarded
        m = _re.match(r"^/api/users/([^/]+)/onboard$", path)
        if m:
            uid = _unquote(m.group(1))
            user = store.update_user(uid, onboarded=True)
            if not user:
                return json_response(self, {"error": "User not found"}, 404)
            return json_response(self, {"user": user})

        # POST /api/users/:id/delete — delete a user
        m = _re.match(r"^/api/users/([^/]+)/delete$", path)
        if m:
            uid = _unquote(m.group(1))
            ok = store.delete_user(uid)
            return json_response(self, {"ok": ok})

        # ── Session API ──

        # POST /api/align — start an on-demand alignment conversation
        if path == "/api/align":
            try:
                body = self._read_json_body()
                session_id = body.get("session_id", "")
                workspace = body.get("workspace", "")
                profile = body.get("profile", "default")
                if not session_id:
                    return json_response(self, {"error": "session_id required"}, 400)
                result = bridge.start_alignment(
                    session_id, store=store, workspace=workspace, profile=profile,
                )
                if result.get("busy"):
                    return json_response(self, {
                        "error": "session is busy",
                        "active_stream_id": result.get("active_stream_id"),
                    }, 409)
                return json_response(self, result)
            except Exception as e:
                logger.exception("align error")
                return json_response(self, {"error": str(e)}, 500)

        # Create new session
        if path == "/api/session/new":
            body = self._read_json_body()
            session_id = body.get("session_id") or f"s-{int(time.time()*1000):x}"
            workspace = body.get("workspace", "")
            profile = body.get("profile", "default")
            title = body.get("title", "Untitled")
            user_id = body.get("user_id")
            session = store.create_session(session_id, workspace, profile, title, user_id=user_id)
            return json_response(self, {"session": session})

        # Save draft
        if path == "/api/session/draft":
            body = self._read_json_body()
            session_id = body.get("session_id", "")
            text = body.get("text", "")
            if not session_id:
                return json_response(self, {"error": "session_id required"}, 400)
            store.save_draft(session_id, text)
            return json_response(self, {"ok": True})

        # Clear session
        if path == "/api/session/clear":
            body = self._read_json_body()
            session_id = body.get("session_id", "")
            if not session_id:
                return json_response(self, {"error": "session_id required"}, 400)
            session = store.clear_session(session_id)
            if not session:
                return json_response(self, {"error": "Session not found"}, 404)
            return json_response(self, {"ok": True, "session": session})

        # Start chat turn
        if path == "/api/chat/start":
            try:
                body = self._read_json_body()
                session_id = body.get("session_id", "")
                message = body.get("message", "")
                workspace = body.get("workspace", "")
                profile = body.get("profile", "default")
                client_msg_id = body.get("client_msg_id") or None
                if not session_id or not message:
                    return json_response(self, {"error": "session_id and message required"}, 400)
                result = bridge.start_chat(
                    session_id, message, workspace, profile,
                    store=store, client_msg_id=client_msg_id,
                )
                if result.get("busy"):
                    return json_response(self, {
                        "error": "session is busy",
                        "active_stream_id": result.get("active_stream_id"),
                    }, 409)
                return json_response(self, result)
            except Exception as e:
                logger.exception("chat/start error")
                return json_response(self, {"error": str(e)}, 500)

        # Cancel stream
        if path == "/api/chat/cancel":
            body = self._read_json_body()
            stream_id = body.get("stream_id", "")
            if not stream_id:
                return json_response(self, {"error": "stream_id required"}, 400)
            cancelled = bridge.cancel_stream(stream_id)
            return json_response(self, {"ok": cancelled})

        # ── Legacy endpoints ──

        if path == "/panel-session":
            return self._handle_set_panel_session()

        if path == "/chat":
            return self._handle_legacy_chat()

        return False

    # ── Legacy handlers (absorbed from old FastAPI) ──

    def _handle_state(self) -> bool:
        """GET /state — vault + calendar + memory state."""
        try:
            _import_legacy()
            from project_rumah import state
            s = state.read_state()
            return json_response(self, s)
        except Exception as e:
            logger.warning("Legacy /state error: %s", e)
            return json_response(self, {"error": str(e)}, 500)

    def _handle_blocks(self, chat_tail: str = "") -> bool:
        """GET /blocks — composed blocks array."""
        try:
            _import_legacy()
            from project_rumah import state, compose
            raw = state.read_state()
            tail = []
            if chat_tail:
                try:
                    tail = json.loads(chat_tail)
                except json.JSONDecodeError:
                    pass
            blocks = compose.compose(raw, chat_tail=tail)
            return json_response(self, {
                "blocks": blocks,
                "raw": raw,
                "_meta": {"block_count": len(blocks)},
            })
        except Exception as e:
            logger.warning("Legacy /blocks error: %s", e)
            return json_response(self, {"error": str(e)}, 500)

    def _handle_get_panel_session(self) -> bool:
        """GET /panel-session — read cron bridge session ID."""
        panel_session_file = paths.panel_session_file()
        if panel_session_file.exists():
            sid = panel_session_file.read_text().strip()
            return json_response(self, {"ok": True, "session_id": sid})
        return json_response(self, {"ok": False, "session_id": None})

    def _handle_set_panel_session(self) -> bool:
        """POST /panel-session — write cron bridge session ID."""
        body = self._read_json_body()
        session_id = body.get("session_id", "")
        if not session_id:
            return json_response(self, {"error": "session_id required"}, 400)
        try:
            paths.panel_session_file().write_text(session_id)
            return json_response(self, {"ok": True, "session_id": session_id})
        except OSError as e:
            return json_response(self, {"ok": False, "error": str(e)}, 500)

    def _handle_legacy_chat(self) -> bool:
        """POST /chat — legacy block action handler."""
        body = self._read_json_body()
        try:
            _import_legacy()
            from project_rumah import state as state_mod, chat
            s = state_mod.read_state()
            result = chat.handle_action(body, s)
            return json_response(self, result)
        except Exception as e:
            logger.warning("Legacy /chat error: %s", e)
            return json_response(self, {"ok": False, "error": str(e)}, 500)


# ── Server lifecycle ──

def run_server(host: str = HOST, port: int = PORT):
    """Start the gateway server."""
    global store, bridge

    from .session_store import SessionStore
    from .agent_bridge import AgentBridge

    store = SessionStore()
    bridge = AgentBridge()

    # Project Rumah is single-user. Ensure the one user exists and that any
    # orphan legacy sessions are reassigned to it.
    me = store.get_or_create_single_user()
    logger.info("Single user: %s (%s)", me.get("name"), me.get("user_id"))

    server = ThreadingHTTPServer((host, port), GatewayHandler, bind_and_activate=False)
    server.allow_reuse_address = True
    server.server_bind()
    server.server_activate()
    logger.info("Gateway listening on http://%s:%d", host, port)
    logger.info("Panel static dir: %s", paths.static_dir())
    logger.info("Data dir: %s", paths.data_dir())

    def shutdown(signum, frame):
        logger.info("Shutting down...")
        bridge.shutdown()
        store.close()
        server.shutdown()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        bridge.shutdown()
        store.close()
        server.server_close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Project Rumah Gateway")
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()

    run_server(args.host, args.port)
