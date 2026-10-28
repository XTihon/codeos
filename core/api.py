import asyncio
import json
import os
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from checkpoint import CheckpointManager
from crm import CRMManager
from knowledge_base import KnowledgeBase
from loader import AgentLoader
from metrics import MetricsManager
from orchestrator import Orchestrator
from repo_analyzer import RepoAnalyzer

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
WORKSPACE_DIR = BASE_DIR / "workspace"
AGENTS_DIR = BASE_DIR / "agents"
PROJECTS_DIR = BASE_DIR / "projects"  # Чистые готовые проекты

loader = AgentLoader(AGENTS_DIR)
crm = CRMManager(DATA_DIR / "crm.db")
knowledge = KnowledgeBase(DATA_DIR / "knowledge.db")
metrics = MetricsManager(DATA_DIR / "metrics.db")


@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(exist_ok=True)
    WORKSPACE_DIR.mkdir(exist_ok=True)
    PROJECTS_DIR.mkdir(exist_ok=True)
    loader.load_all()
    crm.init_db()
    knowledge.init_db()
    metrics.init_db()
    yield


app = FastAPI(title="FreelanceOS API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

active_connections: dict[str, WebSocket] = {}


# ── Health / Version ────────────────────────────────────────────────────────────

STARTUP_TIME = time.strftime("%Y-%m-%d %H:%M:%S")


def _code_version() -> str:
    """Время последней модификации ключевых модулей — чтобы видеть, свежий ли код в бэкенде."""
    latest = 0.0
    for fname in ("api.py", "orchestrator.py", "repo_analyzer.py", "checkpoint.py"):
        p = Path(__file__).parent / fname
        if p.exists():
            latest = max(latest, p.stat().st_mtime)
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(latest)) if latest else "unknown"


@app.get("/health")
def health():
    return {"status": "ok", "agents": loader.agent_ids()}


@app.get("/version")
def version():
    return {
        "pid": os.getpid(),
        "startup": STARTUP_TIME,
        "code_version": _code_version(),
    }


# ── Agents ────────────────────────────────────────────────────────────────────

@app.get("/agents")
def list_agents():
    return loader.all_configs()


# ── Projects ──────────────────────────────────────────────────────────────────

class NewProjectRequest(BaseModel):
    name: str
    tz: str
    client_id: str | None = None
    template_id: str | None = None


@app.post("/projects")
def create_project(req: NewProjectRequest):
    project_id = str(uuid.uuid4())[:8]
    project_dir = WORKSPACE_DIR / project_id
    for sub in ["tz", "context", "output"]:
        (project_dir / sub).mkdir(parents=True, exist_ok=True)

    tz_path = project_dir / "tz" / "tz.md"
    tz_path.write_text(req.tz, encoding="utf-8")

    cp = CheckpointManager(project_dir / "state.db")
    cp.init_db()
    cp.create_project(project_id, req.name, str(tz_path), req.client_id, req.template_id)

    return {"project_id": project_id, "tz_path": str(tz_path)}


@app.get("/projects")
def list_projects():
    projects = []
    for d in WORKSPACE_DIR.iterdir():
        if d.is_dir():
            db = d / "state.db"
            if db.exists():
                cp = CheckpointManager(db)
                projects.append(cp.get_project(d.name))
    return [p for p in projects if p]


@app.get("/projects/{project_id}")
def get_project(project_id: str):
    cp = CheckpointManager(WORKSPACE_DIR / project_id / "state.db")
    return cp.get_project(project_id)


@app.get("/projects/{project_id}/checkpoints")
def get_checkpoints(project_id: str):
    cp = CheckpointManager(WORKSPACE_DIR / project_id / "state.db")
    rows = cp.all_checkpoints(project_id)
    completed = [r["agent_id"] for r in rows if r["status"] == "completed"]
    project = cp.get_project(project_id)
    return {
        "completed": completed,
        "final_path": project.get("final_path") if project else None,
    }


@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    import shutil, gc
    from fastapi import HTTPException
    project_dir = WORKSPACE_DIR / project_id
    if project_dir.exists():
        gc.collect()  # close any lingering SQLite connections
        try:
            shutil.rmtree(project_dir)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Не удалось удалить: {e}")
    return {"deleted": project_id}


@app.delete("/projects")
def clear_projects():
    import shutil, gc
    gc.collect()
    count = 0
    errors = []
    if WORKSPACE_DIR.exists():
        for d in WORKSPACE_DIR.iterdir():
            if d.is_dir():
                try:
                    shutil.rmtree(d)
                    count += 1
                except Exception as e:
                    errors.append(str(e))
    return {"deleted": count, "errors": errors}


# ── Plan ──────────────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    project_id: str


@app.post("/plan")
async def build_plan(req: PlanRequest):
    import traceback
    from doc_reader import expand_file_refs
    from fastapi import HTTPException
    project_dir = WORKSPACE_DIR / req.project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail=f"Project {req.project_id} not found")
    tz_path = project_dir / "tz" / "tz.md"
    if not tz_path.exists():
        raise HTTPException(status_code=404, detail="TZ file not found")
    try:
        tz_text = tz_path.read_text(encoding="utf-8")
        cp = CheckpointManager(project_dir / "state.db")
        effective_tz = _tz_with_name(cp, req.project_id, tz_text)
        tz_expanded = expand_file_refs(effective_tz)
        (project_dir / "tz" / "tz_expanded.md").write_text(tz_expanded, encoding="utf-8")
        orch = Orchestrator(loader, knowledge)
        plan = await orch.build_plan(req.project_id, tz_expanded)
        cp.save_plan(req.project_id, plan)
        return plan
    except Exception as e:
        print(f"[plan] ERROR: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


def _tz_with_name(cp: CheckpointManager, project_id: str, tz_text: str) -> str:
    """Добавляет название проекта в ТЗ, если его там ещё нет. Короткое ТЗ («на пайтоне»)
    часто опирается на название («калькулятор») — без него оркестратор не понимает задачу."""
    try:
        proj = cp.get_project(project_id)
        name = (proj or {}).get("name", "").strip()
    except Exception:
        name = ""
    if name and name.lower() not in tz_text.lower():
        return f"Название проекта: {name}\n\n{tz_text}"
    return tz_text


class ClarifyAnswer(BaseModel):
    question: str
    answer: str


class ClarifyRequest(BaseModel):
    project_id: str
    answers: list[ClarifyAnswer]


@app.post("/plan/clarify")
async def clarify_plan(req: ClarifyRequest):
    """Дописывает ответы на уточняющие вопросы в ТЗ и перестраивает план — теперь
    оркестратор строит детальный план на основе обогащённого ТЗ."""
    import traceback
    from doc_reader import expand_file_refs
    from fastapi import HTTPException
    project_dir = WORKSPACE_DIR / req.project_id
    tz_path = project_dir / "tz" / "tz.md"
    if not tz_path.exists():
        raise HTTPException(status_code=404, detail="TZ file not found")
    try:
        tz_text = tz_path.read_text(encoding="utf-8")
        # Собираем блок уточнений (только заполненные ответы)
        filled = [a for a in req.answers if a.answer.strip()]
        if filled:
            block = "\n\n## Уточнения к ТЗ\n" + "\n".join(
                f"**{a.question.strip()}**\n{a.answer.strip()}" for a in filled
            )
            tz_text = tz_text.rstrip() + block
            tz_path.write_text(tz_text, encoding="utf-8")

        cp = CheckpointManager(project_dir / "state.db")
        effective_tz = _tz_with_name(cp, req.project_id, tz_text)
        tz_expanded = expand_file_refs(effective_tz)
        (project_dir / "tz" / "tz_expanded.md").write_text(tz_expanded, encoding="utf-8")
        orch = Orchestrator(loader, knowledge)
        plan = await orch.build_plan(req.project_id, tz_expanded)
        cp.save_plan(req.project_id, plan)
        return plan
    except Exception as e:
        print(f"[clarify] ERROR: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Run ───────────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    project_id: str


@app.post("/run/{project_id}")
async def run_project(project_id: str):
    project_dir = WORKSPACE_DIR / project_id
    cp = CheckpointManager(project_dir / "state.db")
    plan = cp.get_plan(project_id)
    if not plan:
        return {"error": "no plan found"}

    asyncio.create_task(_run_chain(project_id, plan, cp))
    return {"status": "started"}


async def _finalize_project(project_id: str, project_name: str, plan: dict) -> str:
    """Собирает файлы всех агентов в чистую папку проекта + генерирует README."""
    import shutil, re
    from datetime import datetime

    output_dir = WORKSPACE_DIR / project_id / "output"
    safe_name = re.sub(r'[^\w\-]', '_', project_name.strip())[:40]
    final_dir = PROJECTS_DIR / f"{safe_name}_{project_id[:6]}"
    final_dir.mkdir(parents=True, exist_ok=True)

    # Копируем файлы всех агентов, избегая конфликтов имён
    copied: list[str] = []
    for agent_dir in sorted(output_dir.iterdir()):
        if not agent_dir.is_dir():
            continue
        for src in sorted(agent_dir.rglob("*")):
            if not src.is_file():
                continue
            rel = src.relative_to(agent_dir)
            dst = final_dir / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            # Если файл уже есть от другого агента — не перезаписываем
            if not dst.exists():
                shutil.copy2(src, dst)
                copied.append(str(rel))

    # Структура проекта для README
    def _tree(path: Path, prefix="") -> str:
        lines = []
        items = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name))
        for i, item in enumerate(items):
            connector = "└── " if i == len(items) - 1 else "├── "
            lines.append(f"{prefix}{connector}{item.name}")
            if item.is_dir():
                ext = "    " if i == len(items) - 1 else "│   "
                lines.extend(_tree(item, prefix + ext).splitlines())
        return "\n".join(lines)

    tree = _tree(final_dir)
    chain_lines = "\n".join(
        f"- **{s['agent_id']}** — {s['task'][:90]}"
        for s in plan.get("chain", [])
    )

    readme = f"""# {project_name}

> Создано [CodeOS](https://github.com) · {datetime.now().strftime('%d.%m.%Y %H:%M')}

## Структура проекта

```
{tree}
```

## Цепочка агентов

{chain_lines}

## Оценка

| Параметр | Значение |
|---|---|
| Агентов | {len(plan.get('chain', []))} |
| Время | ~{plan.get('estimated_time_min', '?')} мин |
| Токены | ~{plan.get('estimated_tokens_k', '?')}k |

---
*Сгенерировано автоматически · CodeOS*
"""
    (final_dir / "README.md").write_text(readme, encoding="utf-8")
    return str(final_dir)


CRITICAL_MARKERS = (
    "❌", "🔴", "не работает", "критичн", "не запускается",
    "баг", "fails", "failed", "ошибка соединения", "broken",
)


async def _maybe_fix_pass(project_id: str, plan: dict, cp: CheckpointManager, runner):
    """Если проверяющий агент (tester/code-reviewer) нашёл критичные проблемы —
    один раз перезапускаем developer, чтобы он их исправил. Иначе линейная цепочка
    только репортит баги, но не чинит их."""
    chain_agents = [s["agent_id"] for s in plan.get("chain", [])]
    coder = "developer" if "developer" in chain_agents else None
    reviewer = next((a for a in ("tester", "code-reviewer") if a in chain_agents), None)
    if not coder or not reviewer:
        return

    report_file = WORKSPACE_DIR / project_id / "context" / f"{reviewer}.md"
    if not report_file.exists():
        return
    report = report_file.read_text(encoding="utf-8", errors="ignore")
    if not any(m in report.lower() for m in CRITICAL_MARKERS):
        return  # критичных проблем нет — чинить нечего

    fix_task = (
        f"Проверяющий агент ({reviewer}) нашёл критичные проблемы в текущем результате. "
        f"Его отчёт:\n\n{report[:3000]}\n\n"
        "Исправь ВСЕ критичные проблемы (🔴/❌). Убедись, что продукт реально работает: "
        "прогони основной сценарий и краевые случаи через bash/node/python и покажи правильный "
        "результат в логе. Клиентская логика считается на клиенте, без запросов к несуществующему серверу."
    )

    cp.save_checkpoint(project_id, coder, "started", {})

    async def on_line(line: str, _aid=coder):
        current_ws = active_connections.get(project_id)
        if current_ws:
            try:
                await current_ws.send_json({"type": "log", "agent": _aid, "line": "[фикс] " + line})
            except Exception:
                active_connections.pop(project_id, None)

    result = await runner.run(coder, fix_task, on_line)
    cp.save_checkpoint(project_id, coder, "completed", result)
    metrics.record_agent_run(project_id, coder, result.get("tokens", 0), result.get("quality", 0))


async def _run_chain(project_id: str, plan: dict, cp: CheckpointManager):
    from agent_runner import AgentRunner
    project_dir = WORKSPACE_DIR / project_id
    runner = AgentRunner(project_dir, loader, metrics)

    for step in plan["chain"]:
        agent_id = step["agent_id"]
        last_cp = cp.last_checkpoint(project_id, agent_id)
        if last_cp and last_cp["status"] == "completed":
            continue

        cp.save_checkpoint(project_id, agent_id, "started", {})

        async def on_line(line: str, _aid=agent_id):
            current_ws = active_connections.get(project_id)
            if current_ws:
                try:
                    await current_ws.send_json({"type": "log", "agent": _aid, "line": line})
                except Exception:
                    active_connections.pop(project_id, None)

        result = await runner.run(agent_id, step["task"], on_line)
        cp.save_checkpoint(project_id, agent_id, "completed", result)
        metrics.record_agent_run(project_id, agent_id, result.get("tokens", 0), result.get("quality", 0))

        done_ws = active_connections.get(project_id)
        if done_ws:
            try:
                await done_ws.send_json({"type": "agent_done", "agent": agent_id})
            except Exception:
                active_connections.pop(project_id, None)

    # Проход исправлений: если проверяющий нашёл критичные баги — developer чинит их (1 раз)
    await _maybe_fix_pass(project_id, plan, cp, runner)

    cp.mark_done(project_id)

    # Собираем чистый проект + README
    project_info = cp.get_project(project_id)
    project_name = project_info.get("name", project_id) if project_info else project_id
    try:
        final_path = await _finalize_project(project_id, project_name, plan)
        cp.set_final_path(project_id, final_path)
    except Exception as e:
        print(f"[finalize] ERROR: {e}")
        final_path = None

    if project_id in active_connections:
        try:
            await active_connections[project_id].send_json({
                "type": "project_done",
                "project_id": project_id,
                "final_path": final_path,
            })
        except Exception:
            pass


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    await websocket.accept()
    active_connections[project_id] = websocket
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.pop(project_id, None)


# ── CRM ───────────────────────────────────────────────────────────────────────

class ClientModel(BaseModel):
    name: str
    telegram: str | None = None
    email: str | None = None
    notes: str | None = None

    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    def model_post_init(self, __context):
        if not self.name or not self.name.strip():
            from pydantic import ValidationError
            raise ValueError("name cannot be empty")


@app.get("/clients")
def list_clients():
    return crm.list_clients()


@app.post("/clients")
def create_client(client: ClientModel):
    return crm.create_client(client.model_dump())


@app.get("/clients/{client_id}")
def get_client(client_id: str):
    return crm.get_client(client_id)


@app.delete("/clients/{client_id}")
def delete_client(client_id: str):
    crm.delete_client(client_id)
    return {"deleted": client_id}


@app.delete("/clients")
def clear_clients():
    crm.clear_clients()
    return {"deleted": "all"}


# ── Templates ─────────────────────────────────────────────────────────────────

TEMPLATES_DIR = BASE_DIR / "templates"

@app.get("/templates")
def list_templates():
    result = []
    if TEMPLATES_DIR.exists():
        for d in sorted(TEMPLATES_DIR.iterdir()):
            if d.is_dir():
                tf = d / "template.json"
                if tf.exists():
                    try:
                        result.append(json.loads(tf.read_text(encoding="utf-8-sig")))
                    except Exception:
                        pass
    return result


# ── Repo ──────────────────────────────────────────────────────────────────────

class RepoRequest(BaseModel):
    source: str

@app.post("/repo/analyze")
async def analyze_repo(req: RepoRequest):
    analyzer = RepoAnalyzer()
    return analyzer.analyze(req.source)


class RepoAddRequest(BaseModel):
    source: str
    name: str
    suggested_agents: list[str]
    purpose: str
    detail: str
    tags: list[str]

@app.post("/repo/add")
def add_repo(req: RepoAddRequest):
    import shutil, subprocess as sp
    dev_repos = Path("C:/Dev/repos")
    dev_repos.mkdir(parents=True, exist_ok=True)
    target = dev_repos / req.name

    # 1. Клонируем или копируем в C:\Dev\repos\[name]
    already_existed = target.exists()
    if not already_existed:
        is_url = req.source.startswith("http") or req.source.startswith("git@")
        if is_url:
            r = sp.run(["git", "clone", "--depth", "1", req.source, str(target)],
                       capture_output=True, timeout=120)
            if r.returncode != 0:
                return {"error": f"git clone failed: {r.stderr.decode(errors='ignore')}"}
        else:
            src = Path(req.source)
            if not src.exists():
                return {"error": f"Путь не найден: {req.source}"}
            shutil.copytree(str(src), str(target), ignore=shutil.ignore_patterns('.git'))

    # 2. Сохраняем описание в data/repo_catalog.json
    catalog_file = DATA_DIR / "repo_catalog.json"
    catalog: dict = {}
    if catalog_file.exists():
        try:
            catalog = json.loads(catalog_file.read_text(encoding="utf-8-sig"))
        except Exception:
            catalog = {}
    catalog[req.name] = {
        "purpose": req.purpose,
        "detail":  req.detail,
        "tags":    req.tags,
    }
    catalog_file.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")

    # 3. Прописываем репозиторий в конфиги нужных агентов
    repo_path_str = str(target)
    connected: list[str] = []
    for agent_id in req.suggested_agents:
        cfg_file = AGENTS_DIR / agent_id / "config.json"
        if not cfg_file.exists():
            continue
        try:
            cfg = json.loads(cfg_file.read_text(encoding="utf-8-sig"))
            repos = cfg.get("repos", [])
            if repo_path_str not in repos:
                repos.append(repo_path_str)
                cfg["repos"] = repos
                cfg_file.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
                connected.append(agent_id)
        except Exception:
            continue

    # 4. Перезагружаем конфиги агентов в памяти
    loader.load_all()

    return {
        "success": True,
        "name": req.name,
        "path": repo_path_str,
        "already_existed": already_existed,
        "connected_agents": connected,
    }


# ── System info ───────────────────────────────────────────────────────────────

MCP_REGISTRY = {
    "filesystem": {"desc": "Чтение и запись файлов на диске", "icon": "📁"},
    "bash":       {"desc": "Выполнение команд в терминале (PowerShell/bash)", "icon": "⚡"},
    "git":        {"desc": "Работа с git: коммиты, diff, история", "icon": "🌿"},
    "browser":    {"desc": "Управление браузером, скриншоты, клики", "icon": "🌐"},
    "sqlite":     {"desc": "Запросы к SQLite-базам данных", "icon": "🗄️"},
    "fetch":      {"desc": "HTTP-запросы к внешним API", "icon": "🔌"},
    "figma":      {"desc": "Чтение макетов из Figma", "icon": "🎨"},
    "puppeteer":  {"desc": "Автоматизация браузера через Puppeteer", "icon": "🤖"},
}

REPO_CATALOG = {
    "gitignore": {
        "purpose": "Шаблоны .gitignore для всех языков и фреймворков",
        "detail": "GitHub-репо с 550+ готовыми шаблонами .gitignore: Python, Node, Java, Go, C++, Unity, JetBrains и др. Агент-разработчик использует их чтобы не коммитить лишнее.",
        "tags": ["git", "шаблоны", "dev"],
    },
    "QA_bible": {
        "purpose": "Библия QA на русском",
        "detail": "Полная методология тестирования ПО на русском: виды тестов, чеклисты, баг-репорты, тест-кейсы, пирамида тестирования, нагрузочное и UI-тестирование. Агент-тестировщик читает её как базу знаний.",
        "tags": ["QA", "тестирование", "методология"],
    },
    "public-apis": {
        "purpose": "Каталог 1500+ бесплатных публичных API",
        "detail": "Структурированный список бесплатных REST API по категориям: погода, финансы, картинки, машинное обучение, геолокация, игры и ещё десятки ниш. Агент business-analyst использует для подбора готовых интеграций.",
        "tags": ["API", "интеграции", "справочник"],
    },
    "crawl4ai": {
        "purpose": "Веб-скрейпер для LLM (AI-friendly парсинг)",
        "detail": "Быстрый асинхронный Python-фреймворк для скрейпинга, который возвращает контент в Markdown вместо сырого HTML — специально под контекст LLM. Поддерживает JS-рендеринг, извлечение схемы, массовый краулинг.",
        "tags": ["парсинг", "Python", "LLM", "автоматизация"],
    },
    "free-claude-code": {
        "purpose": "Бесплатные трюки и хаки для Claude Code",
        "detail": "Коллекция промптов, настроек CLAUDE.md и хаков для максимальной эффективности Claude Code: лимиты токенов, кастомные агенты, управление контекстом, MCP конфиги.",
        "tags": ["Claude", "промпты", "конфиги"],
    },
    "lvlpro-git": {
        "purpose": "Исходник проекта lvlpro.net",
        "detail": "Репозиторий сайта lvlpro.net: EJS-шаблоны, Webpack-сборка, адаптивная вёрстка. Используется агентом ui-designer как референс проекта.",
        "tags": ["EJS", "Webpack", "вёрстка"],
    },
}

@app.get("/system/info")
def system_info():
    repos_dir = BASE_DIR / "data"
    dev_repos = Path("C:/Dev/repos")

    # Собираем все MCP из конфигов агентов
    mcp_to_agents: dict[str, list[str]] = {}
    repo_to_agents: dict[str, list[str]] = {}
    agents_detail = []

    for cfg in loader.all_configs():
        agent_id = cfg.get("id", "")
        for mcp in cfg.get("mcp", []):
            mcp_to_agents.setdefault(mcp, []).append(agent_id)
        for repo in cfg.get("repos", []):
            repo_name = Path(repo).name
            repo_to_agents.setdefault(repo_name, []).append(agent_id)
        agents_detail.append({
            "id": agent_id,
            "name": cfg.get("name", agent_id),
            "model": cfg.get("model"),
            "mcp": cfg.get("mcp", []),
            "repos": [Path(r).name for r in cfg.get("repos", [])],
            "skills": cfg.get("skills", []),
            "icon": cfg.get("icon", "🤖"),
            "department": cfg.get("department"),
        })

    # MCP с описаниями
    mcp_list = []
    for mcp_id, agents in mcp_to_agents.items():
        info = MCP_REGISTRY.get(mcp_id, {"desc": "MCP инструмент", "icon": "🔧"})
        mcp_list.append({
            "id": mcp_id,
            "icon": info["icon"],
            "desc": info["desc"],
            "agents": agents,
        })

    # Репо с описаниями (статический каталог + пользовательский из data/repo_catalog.json)
    user_catalog: dict = {}
    user_catalog_file = DATA_DIR / "repo_catalog.json"
    if user_catalog_file.exists():
        try:
            user_catalog = json.loads(user_catalog_file.read_text(encoding="utf-8-sig"))
        except Exception:
            pass
    merged_catalog = {**REPO_CATALOG, **user_catalog}

    repos_list = []
    if dev_repos.exists():
        for repo_dir in sorted(dev_repos.iterdir()):
            if repo_dir.is_dir() and not repo_dir.name.startswith('.'):
                catalog = merged_catalog.get(repo_dir.name, {})
                size_mb = sum(
                    f.stat().st_size for f in repo_dir.rglob('*')
                    if f.is_file() and '.git' not in f.parts
                ) / 1024 / 1024
                repos_list.append({
                    "name": repo_dir.name,
                    "path": str(repo_dir),
                    "purpose": catalog.get("purpose", "Репозиторий"),
                    "detail": catalog.get("detail", ""),
                    "tags": catalog.get("tags", []),
                    "size_mb": round(size_mb, 1),
                    "agents": repo_to_agents.get(repo_dir.name, []),
                })

    return {
        "mcp": mcp_list,
        "repos": repos_list,
        "agents": agents_detail,
    }


# ── Metrics ───────────────────────────────────────────────────────────────────

@app.get("/metrics/agents")
def agent_metrics():
    return metrics.agent_summary()


@app.get("/metrics/projects")
def project_metrics():
    return metrics.project_summary()


def _free_port(port: int):
    """Убивает процесс, уже занявший порт — гарантия что свежий backend с новым кодом победит
    даже если предыдущий python осиротел (orphan) и продолжает висеть на порту."""
    import subprocess
    my_pid = os.getpid()
    try:
        out = subprocess.run(["netstat", "-ano"], capture_output=True,
                             text=True, timeout=10).stdout
    except Exception:
        return
    stale_pids = set()
    for line in out.splitlines():
        if f":{port}" in line and "LISTENING" in line.upper():
            parts = line.split()
            if parts:
                pid = parts[-1]
                if pid.isdigit() and int(pid) != my_pid:
                    stale_pids.add(pid)
    for pid in stale_pids:
        try:
            subprocess.run(["taskkill", "/f", "/pid", pid], capture_output=True, timeout=10)
            print(f"[api] freed port {port}: killed stale backend PID {pid}", flush=True)
        except Exception:
            pass
    if stale_pids:
        time.sleep(1.0)  # дать ОС освободить порт


if __name__ == "__main__":
    _free_port(7432)
    print(f"[api] CodeOS backend starting  PID={os.getpid()}  "
          f"code_version={_code_version()}", flush=True)
    uvicorn.run("api:app", host="127.0.0.1", port=7432, reload=False)
