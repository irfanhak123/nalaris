1|"""
2|gateway/session_store.py — SQLite-backed session + message store.
3|
4|Persists sessions and messages so they survive restarts.
5|Schema is intentionally simple — we own this, not bound to Hermes state.db.
6|"""
7|
8|import json
9|import sqlite3
10|import threading
11|import time
12|from pathlib import Path
13|from typing import Any, Optional
14|
15|_DB_PATH = Path("/mnt/d/project-rumah/data/gateway.db")
16|
17|
18|class SessionStore:
19|    """Thread-safe SQLite store for sessions and messages."""
20|
21|    def __init__(self, db_path: str | Path = _DB_PATH):
22|        self._path = Path(db_path)
23|        self._path.parent.mkdir(parents=True, exist_ok=True)
24|        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
25|        self._conn.execute("PRAGMA journal_mode=WAL")
26|        self._conn.execute("PRAGMA foreign_keys=ON")
27|        self._lock = threading.Lock()
28|        self._init_schema()
29|
30|    def _init_schema(self) -> None:
31|        with self._lock:
32|            self._conn.executescript("""
33|                CREATE TABLE IF NOT EXISTS sessions (
34|                    session_id   TEXT PRIMARY KEY,
35|                    title        TEXT NOT NULL DEFAULT 'Untitled',
36|                    workspace    TEXT NOT NULL DEFAULT '',
37|                    profile      TEXT NOT NULL DEFAULT 'default',
38|                    model        TEXT NOT NULL DEFAULT '',
39|                    pinned       INTEGER NOT NULL DEFAULT 0,
40|                    archived     INTEGER NOT NULL DEFAULT 0,
41|                    draft        TEXT NOT NULL DEFAULT '',
42|                    created_at   REAL NOT NULL,
43|                    updated_at   REAL NOT NULL,
44|                    last_message_at REAL NOT NULL
45|                );
46|
47|                CREATE TABLE IF NOT EXISTS messages (
48|                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
49|                    session_id   TEXT NOT NULL REFERENCES sessions(session_id),
50|                    role         TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
51|                    content      TEXT NOT NULL DEFAULT '',
52|                    timestamp    REAL NOT NULL,
53|                    reasoning    TEXT DEFAULT NULL,
54|                    tool_calls   TEXT DEFAULT NULL,   -- JSON array
55|                    ui_blocks    TEXT DEFAULT NULL,    -- JSON array
56|                    finish_reason TEXT DEFAULT NULL,
57|                    client_msg_id TEXT DEFAULT NULL
58|                );
59|
60|                CREATE INDEX IF NOT EXISTS idx_messages_session
61|                    ON messages(session_id, id);
62|            """)
63|            self._conn.commit()
64|
65|    # ── Sessions ──
66|
67|    def create_session(
68|        self,
69|        session_id: str,
70|        workspace: str = "",
71|        profile: str = "default",
72|        title: str = "Untitled",
73|    ) -> dict:
74|        now = time.time()
75|        with self._lock:
76|            self._conn.execute(
77|                """INSERT OR IGNORE INTO sessions
78|                   (session_id, title, workspace, profile, created_at, updated_at, last_message_at)
79|                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
80|                (session_id, title, workspace, profile, now, now, now),
81|            )
82|            self._conn.commit()
83|        return self.get_session(session_id)  # type: ignore
84|
85|    def get_session(self, session_id: str, include_messages: bool = False) -> Optional[dict]:
86|        with self._lock:
87|            row = self._conn.execute(
88|                "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
89|            ).fetchone()
90|        if not row:
91|            return None
92|        session = self._row_to_session(row)
93|        if include_messages:
94|            session["messages"] = self.get_messages(session_id)
95|            session["message_count"] = len(session["messages"])
96|        else:
97|            session["message_count"] = self._count_messages(session_id)
98|        return session
99|
100|    def clear_session(self, session_id: str) -> Optional[dict]:
101|        with self._lock:
102|            self._conn.execute(
103|                "DELETE FROM messages WHERE session_id = ?", (session_id,)
104|            )
105|            self._conn.execute(
106|                "UPDATE sessions SET updated_at = ? WHERE session_id = ?",
107|                (time.time(), session_id),
108|            )
109|            self._conn.commit()
110|        return self.get_session(session_id, include_messages=True)
111|
112|    def save_draft(self, session_id: str, text: str) -> bool:
113|        with self._lock:
114|            cursor = self._conn.execute(
115|                "UPDATE sessions SET draft = ?, updated_at = ? WHERE session_id = ?",
116|                (text, time.time(), session_id),
117|            )
118|            self._conn.commit()
119|            return cursor.rowcount > 0
120|
121|    # ── Messages ──
122|
123|    def add_message(
124|        self,
125|        session_id: str,
126|        role: str,
127|        content: str,
128|        *,
129|        reasoning: str = None,
130|        tool_calls: list = None,
131|        ui_blocks: list = None,
132|        finish_reason: str = None,
133|        client_msg_id: str = None,
134|    ) -> dict:
135|        now = time.time()
136|        with self._lock:
137|            cursor = self._conn.execute(
138|                """INSERT INTO messages
139|                   (session_id, role, content, timestamp, reasoning, tool_calls,
140|                    ui_blocks, finish_reason, client_msg_id)
141|                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
142|                (
143|                    session_id, role, content, now,
144|                    reasoning,
145|                    json.dumps(tool_calls) if tool_calls else None,
146|                    json.dumps(ui_blocks) if ui_blocks else None,
147|                    finish_reason, client_msg_id,
148|                ),
149|            )
150|            self._conn.execute(
151|                "UPDATE sessions SET updated_at = ?, last_message_at = ? WHERE session_id = ?",
152|                (now, now, session_id),
153|            )
154|            self._conn.commit()
155|            msg_id = cursor.lastrowid
156|        return {
157|            "id": msg_id, "role": role, "content": content, "timestamp": now,
158|            "reasoning": reasoning, "tool_calls": tool_calls or [],
159|            "ui_blocks": ui_blocks or [], "finish_reason": finish_reason,
160|        }
161|
162|    def get_messages(self, session_id: str) -> list[dict]:
163|        with self._lock:
164|            rows = self._conn.execute(
165|                "SELECT * FROM messages WHERE session_id = ? ORDER BY id",
166|                (session_id,),
167|            ).fetchall()
168|        return [self._row_to_message(r) for r in rows]
169|
170|    def _count_messages(self, session_id: str) -> int:
171|        with self._lock:
172|            row = self._conn.execute(
173|                "SELECT COUNT(*) FROM messages WHERE session_id = ?",
174|                (session_id,),
175|            ).fetchone()
176|        return row[0] if row else 0
177|
178|    # ── Row converters ──
179|
180|    def _row_to_session(self, row) -> dict:
181|        return {
182|            "session_id": row[0],
183|            "title": row[1],
184|            "workspace": row[2],
185|            "profile": row[3],
186|            "model": row[4],
187|            "pinned": bool(row[5]),
188|            "archived": bool(row[6]),
189|            "draft": row[7],
190|            "created_at": row[8],
191|            "updated_at": row[9],
192|            "last_message_at": row[10],
193|        }
194|
195|    def _row_to_message(self, row) -> dict:
196|        tool_calls = None
197|        ui_blocks = None
198|        try:
199|            if row[6]:
200|                tool_calls = json.loads(row[6])
201|        except (json.JSONDecodeError, TypeError):
202|            pass
203|        try:
204|            if row[7]:
205|                ui_blocks = json.loads(row[7])
206|        except (json.JSONDecodeError, TypeError):
207|            pass
208|        return {
209|            "id": row[0],
210|            "role": row[2],
211|            "content": row[3],
212|            "timestamp": row[4],
213|            "reasoning": row[5] or None,
214|            "tool_calls": tool_calls or [],
215|            "ui_blocks": ui_blocks or [],
216|            "finish_reason": row[8] or None,
217|            "client_msg_id": row[9] or None,
218|        }
219|
220|    def close(self) -> None:
221|        try:
222|            self._conn.close()
223|        except Exception:
224|            pass
225|