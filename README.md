# CodeOS

A desktop app that turns a task description into a working project using a team of AI agents.

You describe the task. An orchestrator agent reads it, asks clarifying questions if the brief is too short, and builds a minimal chain of specialist agents. The agents run one after another, each building on the previous one's output. When the chain finishes, CodeOS collects the files into a clean project folder and writes a README for it.

Each agent is a [Claude Code](https://docs.claude.com/en/docs/claude-code) process (`claude -p`) with its own role prompt, model and skills.

## How it works

```
Task description (text, or .docx / .pdf / .txt / .md files)
        │
        ▼
Orchestrator ── short brief? → 2–3 clarifying questions (run in parallel with planning)
        │        + similar past projects from the knowledge base
        ▼
Plan (JSON): agent chain, task per agent, time & token estimates, risks
        │
        ▼
Agent chain runs step by step ── live output streamed to the UI over WebSocket
        │                       ── progress saved to a per-project SQLite checkpoint
        ▼
Finalize: merge agent outputs → clean project folder + generated README
```

Planning rules the orchestrator follows:

- Use as few agents as the task needs (1–2 for a script, up to 5 for a full product).
- If the task involves code, put a reviewer (`tester` or `code-reviewer`) last in the chain.
- Write each agent's task with a concrete acceptance criterion.
- Retry Claude CLI calls on transient errors (rate limits, 5xx, network).

## Agents

15 role agents plus the orchestrator, each defined by a `CLAUDE.md` role prompt and a `config.json` (model, skills, MCP servers):

business-analyst · developer · tester · code-reviewer · security-auditor · performance · devops · ui-designer · documenter · translator · copywriter · marketer · seo · investor-brief · video-editor

Project templates (`templates/`) give preset chains for common jobs: API backend, landing page, mobile app, parser, Telegram bot.

## Features

- **Projects:** create from a brief or a template, plan, run, and view the checkpoint history
- **Clients:** a small CRM (clients, contacts, notes)
- **Repo analysis:** detect the languages and stack of an existing repository and add it as agent context
- **Analytics:** token and time metrics per agent and per project
- **Knowledge base:** past projects are stored, and similar ones are used when planning new tasks

## Stack

| Part | Tech |
|---|---|
| Desktop shell | Electron, electron-vite |
| UI | React 18, Tailwind CSS, Radix UI, lucide-react |
| Backend | Python, FastAPI, Uvicorn, Pydantic, WebSockets |
| Storage | SQLite (CRM, knowledge base, metrics, per-project checkpoints) |
| Agents | Claude Code CLI |

```
core/        FastAPI backend: api, orchestrator, agent_runner, checkpoint,
             knowledge_base, crm, metrics, repo_analyzer, doc_reader
agents/      role prompts and configs for every agent
templates/   preset agent chains
app/         Electron + React desktop app
stress_test.py   load test for the API and WebSocket
```

## Run

Requirements: Windows, Python 3.11+, Node.js, and the Claude Code CLI installed and signed in.

```powershell
pip install -r requirements.txt
cd app
npm install
npm run dev        # starts Electron; the app launches the Python API on 127.0.0.1:7432
```

`data/`, `workspace/` and `projects/` are created on first run and are not tracked in git.

## Note

Agents run with `--dangerously-skip-permissions`, so they can read and write files without asking. Run CodeOS only on tasks and folders you trust.
