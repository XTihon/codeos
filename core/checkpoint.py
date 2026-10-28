import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class CheckpointManager:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path, timeout=5)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_db(self):
        with self._conn() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT,
                tz_path TEXT,
                client_id TEXT,
                template_id TEXT,
                status TEXT DEFAULT 'pending',
                plan_json TEXT,
                final_path TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );""")
            # Миграция для существующих БД без final_path
            try:
                c.execute("ALTER TABLE projects ADD COLUMN final_path TEXT")
            except Exception:
                pass
            c.executescript("""
            CREATE TABLE IF NOT EXISTS checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT,
                agent_id TEXT,
                status TEXT,
                state_json TEXT,
                tokens_used INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
            """)

    def create_project(self, project_id, name, tz_path, client_id=None, template_id=None):
        with self._conn() as c:
            c.execute(
                "INSERT INTO projects (id, name, tz_path, client_id, template_id) VALUES (?,?,?,?,?)",
                (project_id, name, tz_path, client_id, template_id)
            )

    def get_project(self, project_id: str) -> dict | None:
        with self._conn() as c:
            cur = c.execute("SELECT * FROM projects WHERE id=?", (project_id,))
            row = cur.fetchone()
            if not row:
                return None
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))

    def save_plan(self, project_id: str, plan: dict):
        with self._conn() as c:
            c.execute(
                "UPDATE projects SET plan_json=?, status='planned' WHERE id=?",
                (json.dumps(plan, ensure_ascii=False), project_id)
            )

    def get_plan(self, project_id: str) -> dict | None:
        with self._conn() as c:
            row = c.execute("SELECT plan_json FROM projects WHERE id=?", (project_id,)).fetchone()
            if row and row[0]:
                return json.loads(row[0])
            return None

    def save_checkpoint(self, project_id: str, agent_id: str, status: str, state: dict):
        with self._conn() as c:
            c.execute(
                "INSERT INTO checkpoints (project_id, agent_id, status, state_json, tokens_used) VALUES (?,?,?,?,?)",
                (project_id, agent_id, status, json.dumps(state), state.get("tokens", 0))
            )
            if status == "completed":
                c.execute("UPDATE projects SET status='running' WHERE id=?", (project_id,))

    def last_checkpoint(self, project_id: str, agent_id: str) -> dict | None:
        with self._conn() as c:
            cur = c.execute(
                "SELECT * FROM checkpoints WHERE project_id=? AND agent_id=? ORDER BY id DESC LIMIT 1",
                (project_id, agent_id)
            )
            row = cur.fetchone()
            if not row:
                return None
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))

    def all_checkpoints(self, project_id: str) -> list:
        with self._conn() as c:
            cur = c.execute(
                "SELECT * FROM checkpoints WHERE project_id=? ORDER BY id",
                (project_id,)
            )
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in rows]

    def set_final_path(self, project_id: str, final_path: str):
        with self._conn() as c:
            c.execute("UPDATE projects SET final_path=? WHERE id=?", (final_path, project_id))

    def mark_done(self, project_id: str):
        with self._conn() as c:
            c.execute("UPDATE projects SET status='done' WHERE id=?", (project_id,))
