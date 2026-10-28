import json
import sqlite3
from pathlib import Path


class KnowledgeBase:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def init_db(self):
        with self._conn() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT,
                tz_summary TEXT,
                agents_used TEXT,
                outcome TEXT,
                quality_avg REAL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT,
                agent_chain TEXT,
                notes TEXT
            );
            """)

    def find_similar(self, tz_text: str) -> list:
        words = set(tz_text.lower().split())
        with self._conn() as c:
            rows = c.execute("SELECT id, name, tz_summary, agents_used FROM projects ORDER BY created_at DESC LIMIT 20").fetchall()

        results = []
        for row in rows:
            summary = (row[2] or "").lower()
            match_count = sum(1 for w in words if w in summary and len(w) > 4)
            if match_count > 0:
                results.append({
                    "id": row[0],
                    "name": row[1],
                    "agents": row[3],
                    "score": match_count
                })

        return sorted(results, key=lambda x: x["score"], reverse=True)[:5]

    def record_project(self, project_id: str, name: str, tz_summary: str, agents_used: list, quality_avg: float):
        with self._conn() as c:
            c.execute(
                """INSERT OR REPLACE INTO projects (id, name, tz_summary, agents_used, quality_avg)
                   VALUES (?,?,?,?,?)""",
                (project_id, name, tz_summary, json.dumps(agents_used), quality_avg)
            )
