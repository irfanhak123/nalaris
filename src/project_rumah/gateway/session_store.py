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
                CREATE TABLE IF NOT EXISTS users (
                    user_id      TEXT PRIMARY KEY,
                    name         TEXT NOT NULL,
                    avatar_color TEXT NOT NULL DEFAULT '#000000',
                    avatar_emoji TEXT DEFAULT NULL,
                    onboarded    INTEGER NOT NULL DEFAULT 0,
                    preferences  TEXT NOT NULL DEFAULT '{}',
                    created_at   REAL NOT NULL,
                    updated_at   REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    session_id   TEXT PRIMARY KEY,
                    user_id      TEXT DEFAULT NULL,
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
            # Migrate: add user_id column to sessions if missing
            cols = {r[1] for r in self._conn.execute("PRAGMA table_info(sessions)").fetchall()}
            if "user_id" not in cols:
                self._conn.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT DEFAULT NULL")
            self._conn.commit()

    # ── Sessions ──

    def create_session(
        self,
        session_id: str,
        workspace: str = "",
        profile: str = "default",
        title: str = "Untitled",
        user_id: str = None,
    ) -> dict:
        now = time.time()
        with self._lock:
            self._conn.execute(
                """INSERT OR IGNORE INTO sessions
                   (session_id, user_id, title, workspace, profile, created_at, updated_at, last_message_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (session_id, user_id, title, workspace, profile, now, now, now),
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

    # ── Users ──

    def create_user(
        self,
        user_id: str,
        name: str,
        avatar_color: str = "#000000",
        avatar_emoji: str = None,
        preferences: dict = None,
    ) -> dict:
        now = time.time()
        with self._lock:
            self._conn.execute(
                """INSERT INTO users
                   (user_id, name, avatar_color, avatar_emoji, preferences, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (user_id, name, avatar_color, avatar_emoji,
                 json.dumps(preferences or {}), now, now),
            )
            self._conn.commit()
        return self.get_user(user_id)  # type: ignore

    def get_user(self, user_id: str) -> Optional[dict]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM users WHERE user_id = ?", (user_id,)
            ).fetchone()
        if not row:
            return None
        return self._row_to_user(row)

    def list_users(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM users ORDER BY created_at"
            ).fetchall()
        return [self._row_to_user(r) for r in rows]

    def update_user(self, user_id: str, **fields) -> Optional[dict]:
        allowed = {"name", "avatar_color", "avatar_emoji", "onboarded", "preferences"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return self.get_user(user_id)
        now = time.time()
        sets = []
        vals = []
        for k, v in updates.items():
            if k == "preferences" and isinstance(v, dict):
                v = json.dumps(v)
            if k == "onboarded":
                v = int(v)
            sets.append(f"{k} = ?")
            vals.append(v)
        sets.append("updated_at = ?")
        vals.append(now)
        vals.append(user_id)
        with self._lock:
            self._conn.execute(
                f"UPDATE users SET {', '.join(sets)} WHERE user_id = ?",
                vals,
            )
            self._conn.commit()
        return self.get_user(user_id)

    def delete_user(self, user_id: str) -> bool:
        with self._lock:
            self._conn.execute("DELETE FROM messages WHERE session_id IN (SELECT session_id FROM sessions WHERE user_id = ?)", (user_id,))
            self._conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            cursor = self._conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
            self._conn.commit()
            return cursor.rowcount > 0

    # ── Single-user model ──
    #
    # Project Rumah has one user (the owner). Multi-user management was
    # removed; the `users` table is treated as a single row holding that
    # user's identity + alignment. These helpers keep the rest of the
    # codebase from having to think about user_id selection.

    SINGLE_USER_ID = "me"

    def get_or_create_single_user(self, name: str = "you") -> dict:
        """Return the one user, creating it if none exists.

        If multiple legacy users exist (from the old multi-user era), keep
        the oldest as the single user and reassign every orphan session
        (those with NULL user_id, or belonging to the other users) to it.
        The extra user rows are left in place but unused.
        """
        with self._lock:
            users = self._conn.execute(
                "SELECT * FROM users ORDER BY created_at ASC"
            ).fetchall()

            if users:
                single = self._row_to_user(users[0])
                single_id = single["user_id"]
                # Reassign orphan + foreign-user sessions to the single user.
                self._conn.execute(
                    "UPDATE sessions SET user_id = ? WHERE user_id IS NULL OR user_id != ?",
                    (single_id, single_id),
                )
                self._conn.commit()
                return single

            # None exist yet — create the single user.
            now = time.time()
            self._conn.execute(
                """INSERT INTO users
                   (user_id, name, avatar_color, avatar_emoji, preferences, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (self.SINGLE_USER_ID, name, "#4A90D9", None, "{}", now, now),
            )
            self._conn.commit()
        # Read back OUTSIDE the lock — get_user acquires self._lock, and
        # threading.Lock is not reentrant, so calling it under the lock deadlocks.
        return self.get_user(self.SINGLE_USER_ID)  # type: ignore

    def get_single_user(self) -> Optional[dict]:
        """The single user, or None if the table is empty."""
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM users ORDER BY created_at ASC LIMIT 1"
            ).fetchone()
        return self._row_to_user(row) if row else None

    def get_alignment(self, user_id: str) -> dict:
        """The user's alignment findings (goals/habits/situation), or {}."""
        user = self.get_user(user_id)
        if not user:
            return {}
        return user.get("preferences", {}).get("alignment", {}) or {}

    def set_alignment(self, user_id: str, alignment: dict) -> Optional[dict]:
        """Merge `alignment` into the user's preferences.alignment and persist.

        Top-level keys present in `alignment` overwrite prior values; nested
        lists (goals/habits) are replaced wholesale when provided.
        """
        user = self.get_user(user_id)
        if not user:
            return None
        prefs = dict(user.get("preferences", {}) or {})
        current = dict(prefs.get("alignment", {}) or {})
        current.update(alignment)
        prefs["alignment"] = current
        return self.update_user(user_id, preferences=prefs)

    def get_user_sessions(self, user_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM sessions WHERE user_id = ? ORDER BY last_message_at DESC",
                (user_id,),
            ).fetchall()
        return [self._row_to_session(r) for r in rows]

    def _row_to_user(self, row) -> dict:
        prefs = {}
        try:
            if row[5]:
                prefs = json.loads(row[5])
        except (json.JSONDecodeError, TypeError):
            pass
        return {
            "user_id": row[0],
            "name": row[1],
            "avatar_color": row[2],
            "avatar_emoji": row[3] or None,
            "onboarded": bool(row[4]),
            "preferences": prefs,
            "created_at": row[6],
            "updated_at": row[7],
        }

    # ── Row converters ──

    def _row_to_session(self, row) -> dict:
        return {
            "session_id": row[0],
            "user_id": row[1],
            "title": row[2],
            "workspace": row[3],
            "profile": row[4],
            "model": row[5],
            "pinned": bool(row[6]),
            "archived": bool(row[7]),
            "draft": row[8],
            "created_at": row[9],
            "updated_at": row[10],
            "last_message_at": row[11],
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
