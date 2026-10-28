import json
from pathlib import Path


class AgentLoader:
    def __init__(self, agents_dir: Path):
        self.agents_dir = agents_dir
        self._configs: dict[str, dict] = {}
        self._claude_mds: dict[str, str] = {}
        self._base_claude_md: str = ""

    def load_all(self):
        base_md = self.agents_dir / "_base" / "CLAUDE.md"
        if base_md.exists():
            self._base_claude_md = base_md.read_text(encoding="utf-8")

        for agent_dir in self.agents_dir.iterdir():
            if agent_dir.name.startswith("_") or not agent_dir.is_dir():
                continue

            config_file = agent_dir / "config.json"
            if config_file.exists():
                try:
                    self._configs[agent_dir.name] = json.loads(config_file.read_text(encoding="utf-8-sig"))
                except Exception:
                    self._configs[agent_dir.name] = {}

            md_file = agent_dir / "CLAUDE.md"
            if md_file.exists():
                self._claude_mds[agent_dir.name] = md_file.read_text(encoding="utf-8-sig")
            else:
                self._claude_mds[agent_dir.name] = ""

        print(f"[loader] Loaded {len(self._configs)} agents")

    def agent_ids(self) -> list[str]:
        return sorted(self._configs.keys())

    def all_configs(self) -> list[dict]:
        return [{"id": k, **v} for k, v in self._configs.items()]

    def get_config(self, agent_id: str) -> dict | None:
        return self._configs.get(agent_id)

    def get_claude_md(self, agent_id: str) -> str:
        agent_md = self._claude_mds.get(agent_id, "")
        if self._base_claude_md and agent_md:
            return f"{self._base_claude_md}\n\n---\n\n{agent_md}"
        return self._base_claude_md + agent_md
