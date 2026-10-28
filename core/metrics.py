import sqlite3
from pathlib import Path


class MetricsManager:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def init_db(self):
        with self._conn() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS agent_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT,
                agent_id TEXT,
                tokens_used INTEGER DEFAULT 0,
                quality_score REAL DEFAULT 0,
                retries INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
            """)

    def record_agent_run(self, project_id: str, agent_id: str, tokens: int, quality: float, retries: int = 0):
        with self._conn() as c:
            c.execute(
                "INSERT INTO agent_runs (project_id, agent_id, tokens_used, quality_score, retries) VALUES (?,?,?,?,?)",
                (project_id, agent_id, tokens, quality, retries)
            )

    def agent_summary(self) -> list:
        with self._conn() as c:
            cur = c.execute("""
                SELECT agent_id,
                       COUNT(*) as runs,
                       SUM(tokens_used) as total_tokens,
                       AVG(quality_score) as avg_quality,
                       SUM(retries) as total_retries
                FROM agent_runs
                GROUP BY agent_id
                ORDER BY total_tokens DESC
            """)
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in rows]

    def project_summary(self) -> list:
        with self._conn() as c:
            cur = c.execute("""
                SELECT project_id,
                       COUNT(DISTINCT agent_id) as agents_used,
                       SUM(tokens_used) as total_tokens,
                       AVG(quality_score) as avg_quality,
                       MAX(created_at) as last_run
                FROM agent_runs
                GROUP BY project_id
                ORDER BY last_run DESC
            """)
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in rows]
