"""
gateway/session_store.py — SQLite-backed session + message store.

Persists sessions and messages so they survive restarts.
Schema is intentionally simple — we own this, not bound to Hermes state.db.
"""

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

_DB_PATH = Path("/mnt/d/project-rumah/data/gateway.db")


class SessionStore:
    """Thread-safe SQLite store for sessions and messages."""

    def __init__(self, db_path: str | Path = _DB_PATH):
        self._path = Path(db_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._lock = threading.Lock()
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id   TEXT PRIMARY KEY,
                    title        TEXT NOT NULL DEFAULT 'Untitled',
                    workspace    TEXT NOT NULL DEFAULT '',
                    profile      TEXT NOT NULL DEFAULT 'default',
                    model        TEXT NOT NULL DEFAULT '',
                    pinned       INTEGER NOT NULL DEFAULT 0,
                    archived     INTEGER NOT NULL DEFAULT 0,
                    draft        TEXT NOT NULL DEFAULT '',
                    created_at   REAL NOT NULL,
                    updated_at   REAL NOT NULL,
                    last_message_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id   TEXT NOT NULL REFERENCES sessions(session_id),
                    role         TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
                    content      TEXT NOT NULL DEFAULT '',
                    timestamp    REAL NOT NULL,
                    reasoning    TEXT DEFAULT NULL,
                    tool_calls   TEXT DEFAULT NULL,   -- JSON array
                    ui_blocks    TEXT DEFAULT NULL,    -- JSON array
                    finish_reason TEXT DEFAULT NULL,
                    client_msg_id TEXT DEFAULT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_messages_session
                    ON messages(session_id, id);
            """)
            self._conn.commit()

    # ── Sessions ──

    def create_session(
        self,
        session_id: str,
        workspace: str = "",
        profile: str = "default",
        title: str = "Untitled",
    ) -> dict:
        now = time.time()
        with self._lock:
            self._conn.execute(
                """INSERT OR IGNORE INTO sessions
                   (session_id, title, workspace, profile, created_at, updated_at, last_message_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (session_id, title, workspace, profile, now, now, now),
            )
            self._conn.commit()
        return self.get_session(session_id)  # type: ignore

    def get_session(self, session_id: str, include_messages: bool = False) -> Optional[dict]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
            ).fetchone()
        if not row:
            return None
        session = self._row_to_session(row)
        if include_messages:
            session["messages"] = self.get_messages(session_id)
            session["message_count"] = len(session["messages"])
        else:
            session["message_count"] = self._count_messages(session_id)
        return session

    def clear_session(self, session_id: str) -> Optional[dict]:
        with self._lock:
            self._conn.execute(
                "DELETE FROM messages WHERE session_id = ?", (session_id,)
            )
            self._conn.execute(
                "UPDATE sessions SET updated_at = ? WHERE session_id = ?",
                (time.time(), session_id),
            )
            self._conn.commit()
        return self.get_session(session_id, include_messages=True)

    def save_draft(self, session_id: str, text: str) -> bool:
        with self._lock:
            cursor = self._conn.execute(
                "UPDATE sessions SET draft = ?, updated_at = ? WHERE session_id = ?",
                (text, time.time(), session_id),
            )
            self._conn.commit()
            return cursor.rowcount > 0

    # ── Messages ──

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        *,
        reasoning: str = None,
        tool_calls: list = None,
        ui_blocks: list = None,
        finish_reason: str = None,
        client_msg_id: str = None,
    ) -> dict:
        now = time.time()
        with self._lock:
            cursor = self._conn.execute(
                """INSERT INTO messages
                   (session_id, role, content, timestamp, reasoning, tool_calls,
                    ui_blocks, finish_reason, client_msg_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    session_id, role, content, now,
                    reasoning,
                    json.dumps(tool_calls) if tool_calls else None,
                    json.dumps(ui_blocks) if ui_blocks else None,
                    finish_reason, client_msg_id,
                ),
            )
            self._conn.execute(
                "UPDATE sessions SET updated_at = ?, last_message_at = ? WHERE session_id = ?",
                (now, now, session_id),
            )
            self._conn.commit()
            msg_id = cursor.lastrowid
        return {
            "id": msg_id, "role": role, "content": content, "timestamp": now,
            "reasoning": reasoning, "tool_calls": tool_calls or [],
            "ui_blocks": ui_blocks or [], "finish_reason": finish_reason,
        }

    def get_messages(self, session_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM messages WHERE session_id = ? ORDER BY id",
                (session_id,),
            ).fetchall()
        return [self._row_to_message(r) for r in rows]

    def _count_messages(self, session_id: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) FROM messages WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        return row[0] if row else 0

    # ── Row converters ──

    def _row_to_session(self, row) -> dict:
        return {
            "session_id": row[0],
            "title": row[1],
            "workspace": row[2],
            "profile": row[3],
            "model": row[4],
            "pinned": bool(row[5]),
            "archived": bool(row[6]),
            "draft": row[7],
            "created_at": row[8],
            "updated_at": row[9],
            "last_message_at": row[10],
        }

    def _row_to_message(self, row) -> dict:
        tool_calls = None
        ui_blocks = None
        try:
            if row[6]:
                tool_calls = json.loads(row[6])
        except (json.JSONDecodeError, TypeError):
            pass
        try:
            if row[7]:
                ui_blocks = json.loads(row[7])
        except (json.JSONDecodeError, TypeError):
            pass
        return {
            "id": row[0],
            "role": row[2],
            "content": row[3],
            "timestamp": row[4],
            "reasoning": row[5] or None,
            "tool_calls": tool_calls or [],
            "ui_blocks": ui_blocks or [],
            "finish_reason": row[8] or None,
            "client_msg_id": row[9] or None,
        }

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass
