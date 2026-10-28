import json
import os
import subprocess
import tempfile
from pathlib import Path

EXTENSIONS = {
  '.py': 'Python', '.js': 'JavaScript', '.ts': 'TypeScript',
  '.tsx': 'TypeScript', '.jsx': 'JavaScript', '.go': 'Go',
  '.rs': 'Rust', '.java': 'Java', '.cs': 'C#', '.cpp': 'C++',
  '.c': 'C', '.php': 'PHP', '.rb': 'Ruby', '.swift': 'Swift',
  '.kt': 'Kotlin', '.dart': 'Dart', '.vue': 'Vue', '.svelte': 'Svelte',
}

STACK_SIGNALS = {
  'package.json':      ['Node.js'],
  'requirements.txt':  ['Python'],
  'Pipfile':           ['Python'],
  'pyproject.toml':    ['Python'],
  'go.mod':            ['Go'],
  'Cargo.toml':        ['Rust'],
  'pom.xml':           ['Java', 'Maven'],
  'build.gradle':      ['Java', 'Gradle'],
  'Gemfile':           ['Ruby'],
  'composer.json':     ['PHP'],
  'pubspec.yaml':      ['Dart', 'Flutter'],
  'Dockerfile':        ['Docker'],
  'docker-compose.yml':['Docker Compose'],
  '.github':           ['GitHub Actions'],
}


class RepoAnalyzer:
    def analyze(self, source: str) -> dict:
        source = source.strip()
        is_url = source.startswith('http://') or source.startswith('https://') or source.startswith('git@')

        if is_url:
            path = self._clone(source)
            name = source.rstrip('/').split('/')[-1].replace('.git', '')
        else:
            path = Path(source)
            name = path.name

        if not path or not path.exists():
            return {"error": f"Не удалось получить репозиторий: {source}"}

        scan = self._scan(path)
        analysis = self._analyze_with_claude(path, scan)

        return {
            "name": name,
            "source": source,
            "file_count": scan["file_count"],
            "size_kb": scan["size_kb"],
            "primary_language": scan["primary_language"],
            "license": scan.get("license"),
            **analysis,
        }

    def _clone(self, url: str) -> Path | None:
        tmp = Path(tempfile.mkdtemp(prefix="codeos-repo-"))
        result = subprocess.run(
            ["git", "clone", "--depth", "1", url, str(tmp)],
            capture_output=True, timeout=60
        )
        return tmp if result.returncode == 0 else None

    def _scan(self, path: Path) -> dict:
        file_count = 0
        total_bytes = 0
        lang_counts: dict[str, int] = {}
        stack = set()
        license_file = None

        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next'}]
            for f in files:
                fp = Path(root) / f
                try:
                    sz = fp.stat().st_size
                    total_bytes += sz
                    file_count += 1
                except OSError:
                    continue

                ext = fp.suffix.lower()
                if ext in EXTENSIONS:
                    lang = EXTENSIONS[ext]
                    lang_counts[lang] = lang_counts.get(lang, 0) + 1

                if f.lower().startswith('license') or f.lower() == 'licence':
                    try: license_file = fp.read_text(encoding='utf-8', errors='ignore')[:80]
                    except: pass

            rel = Path(root).relative_to(path)
            for sig, tags in STACK_SIGNALS.items():
                if (path / rel / sig).exists() or (path / sig).exists():
                    stack.update(tags)

        primary = max(lang_counts, key=lang_counts.get) if lang_counts else 'Unknown'
        all_langs = sorted(lang_counts, key=lang_counts.get, reverse=True)[:5]
        stack.update(all_langs[:3])

        license_str = None
        if license_file:
            if 'MIT' in license_file: license_str = 'MIT'
            elif 'Apache' in license_file: license_str = 'Apache 2.0'
            elif 'GPL' in license_file: license_str = 'GPL'
            else: license_str = 'Custom'

        return {
            "file_count": file_count,
            "size_kb": round(total_bytes / 1024, 1),
            "primary_language": primary,
            "stack_signals": list(stack),
            "license": license_str,
        }

    def _analyze_with_claude(self, path: Path, scan: dict) -> dict:
        readme = self._read_readme(path)
        tree = self._build_tree(path, max_files=30)

        stack_str = ', '.join(scan['stack_signals']) if scan['stack_signals'] else scan['primary_language']

        prompt = f"""You are a code analyst. Analyze this repository and return ONLY a JSON object, no markdown, no explanation.

File tree:
{tree}

README excerpt:
{readme[:2000] if readme else 'none'}

Detected stack: {stack_str}
Primary language: {scan['primary_language']}
File count: {scan['file_count']}

Return ONLY this JSON (no ```json wrapper, no text before or after):
{{"description":"Подробное описание на русском: что делает проект, его основное назначение, ключевые возможности и архитектура (4-6 предложений)","tags":["tag1","tag2"],"stack":["tech1","tech2"],"install_steps":[{{"label":"Step description","cmd":"command or null"}}],"entry_points":[{{"path":"file/path","desc":"what it is"}}],"suggested_agents":["developer","tester"]}}"""

        import time
        transient = ("403", "request not allowed", "failed to authenticate",
                     "rate limit", "overloaded", "429", "503", "econnreset")
        raw = ""
        for attempt in range(3):
            result = subprocess.run(
                ["claude", "-p", "-", "--model", "claude-sonnet-4-6", "--output-format", "text",
                 "--dangerously-skip-permissions"],
                input=prompt.encode("utf-8"),
                capture_output=True,
                timeout=90
            )
            raw = result.stdout.decode("utf-8", errors="replace").strip()
            low = raw.lower()
            is_transient = any(m in low for m in transient) or (result.returncode != 0 and not raw)
            if not is_transient:
                break
            print(f"[repo_analyzer] transient error (attempt {attempt+1}/3): {raw[:120]!r}")
            time.sleep(2 * (attempt + 1))
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        try:
            start, end = raw.find('{'), raw.rfind('}') + 1
            if start >= 0 and end > start:
                parsed = json.loads(raw[start:end])
                # Ensure required fields exist
                if not parsed.get("description"):
                    parsed["description"] = f"Проект на {scan['primary_language']}"
                return parsed
        except Exception:
            pass

        # Fallback: build basic info from scan data
        return {
            "description": f"Проект на {scan['primary_language']} — {stack_str}",
            "tags": list(set(scan['stack_signals']))[:5],
            "stack": list(set(scan['stack_signals'])),
            "install_steps": [],
            "entry_points": [],
            "suggested_agents": ["developer", "tester"],
        }

    def _read_readme(self, path: Path) -> str:
        for name in ['README.md', 'readme.md', 'README.txt', 'README']:
            f = path / name
            if f.exists():
                try: return f.read_text(encoding='utf-8', errors='ignore')
                except: pass
        return ''

    def _build_tree(self, path: Path, max_files: int = 30) -> str:
        lines = []
        count = 0
        for root, dirs, files in os.walk(path):
            dirs[:] = sorted([d for d in dirs if d not in {'.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build'}])[:6]
            depth = len(Path(root).relative_to(path).parts)
            if depth > 3: continue
            indent = '  ' * depth
            folder = Path(root).name if depth > 0 else '.'
            lines.append(f"{indent}{folder}/")
            for f in sorted(files)[:8]:
                lines.append(f"{indent}  {f}")
                count += 1
                if count >= max_files:
                    lines.append('  ...')
                    return '\n'.join(lines)
        return '\n'.join(lines)
