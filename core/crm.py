import sqlite3
import uuid
from pathlib import Path


class CRMManager:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def init_db(self):
        with self._conn() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                telegram TEXT,
                email TEXT,
                notes TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS proposals (
                id TEXT PRIMARY KEY,
                client_id TEXT,
                project_id TEXT,
                content TEXT,
                status TEXT DEFAULT 'draft',
                created_at TEXT DEFAULT (datetime('now'))
            );
            """)

    def create_client(self, data: dict) -> dict:
        client_id = str(uuid.uuid4())[:8]
        with self._conn() as c:
            c.execute(
                "INSERT INTO clients (id, name, telegram, email, notes) VALUES (?,?,?,?,?)",
                (client_id, data["name"], data.get("telegram"), data.get("email"), data.get("notes"))
            )
        return {**data, "id": client_id}

    def list_clients(self) -> list:
        with self._conn() as c:
            cur = c.execute("SELECT * FROM clients ORDER BY created_at DESC")
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in rows]

    def get_client(self, client_id: str) -> dict | None:
        with self._conn() as c:
            cur = c.execute("SELECT * FROM clients WHERE id=?", (client_id,))
            row = cur.fetchone()
            if not row:
                return None
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))

    def save_proposal(self, client_id: str, project_id: str, content: str) -> str:
        proposal_id = str(uuid.uuid4())[:8]
        with self._conn() as c:
            c.execute(
                "INSERT INTO proposals (id, client_id, project_id, content) VALUES (?,?,?,?)",
                (proposal_id, client_id, project_id, content)
            )
        return proposal_id

    def delete_client(self, client_id: str):
        with self._conn() as c:
            c.execute("DELETE FROM clients WHERE id=?", (client_id,))

    def clear_clients(self):
        with self._conn() as c:
            c.execute("DELETE FROM clients")

    def list_proposals(self, client_id: str) -> list:
        with self._conn() as c:
            cur = c.execute(
                "SELECT * FROM proposals WHERE client_id=? ORDER BY created_at DESC", (client_id,)
            )
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in rows]
