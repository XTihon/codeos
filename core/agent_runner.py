import asyncio
import json
import os
import re
from pathlib import Path
from typing import Callable, Awaitable


class AgentRunner:
    def __init__(self, project_dir: Path, loader, metrics):
        self.project_dir = project_dir
        self.loader = loader
        self.metrics = metrics

    async def run(
        self,
        agent_id: str,
        task: str,
        on_line: Callable[[str], Awaitable[None]] | None = None,
    ) -> dict:
        config = self.loader.get_config(agent_id) or {}
        model = config.get("model", "claude-sonnet-4-6")
        claude_md = self.loader.get_claude_md(agent_id)

        context_path = self.project_dir / "context"
        output_path = self.project_dir / "output" / agent_id
        output_path.mkdir(parents=True, exist_ok=True)

        prev_context = self._read_prev_context(context_path, agent_id)

        prompt = self._build_prompt(agent_id, task, claude_md, prev_context, output_path)

        env = os.environ.copy()
        env["CLAUDE_PROJECT_DIR"] = str(self.project_dir)
        env["AGENT_ID"] = agent_id
        env["OUTPUT_DIR"] = str(output_path)

        cmd = ["claude", "-p", "-", "--model", model, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"]

        tokens_used = 0
        lines_collected = []

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd=str(self.project_dir / "output" / agent_id),
        )

        async def write_stdin():
            process.stdin.write(prompt.encode("utf-8"))
            await process.stdin.drain()
            process.stdin.close()

        async def read_stream(stream):
            nonlocal tokens_used
            async for raw in stream:
                line = raw.decode("utf-8", errors="replace").rstrip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    msg_type = obj.get("type", "")
                    if msg_type == "assistant":
                        content = obj.get("message", {}).get("content", [])
                        for block in content:
                            if block.get("type") == "text":
                                text = block["text"]
                                lines_collected.append(text)
                                if on_line:
                                    await on_line(text)
                    elif msg_type == "result":
                        usage = obj.get("usage", {})
                        tokens_used = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
                except json.JSONDecodeError:
                    lines_collected.append(line)
                    if on_line:
                        await on_line(line)

        await asyncio.gather(
            write_stdin(),
            read_stream(process.stdout),
            read_stream(process.stderr),
        )
        await process.wait()

        full_output = "\n".join(lines_collected)
        context_file = context_path / f"{agent_id}.md"
        context_file.write_text(full_output, encoding="utf-8")

        quality = self._estimate_quality(full_output, task)

        return {
            "agent_id": agent_id,
            "tokens": tokens_used,
            "quality": quality,
            "output_path": str(output_path),
            "exit_code": process.returncode,
        }

    def _read_prev_context(self, context_path: Path, current_agent_id: str) -> str:
        files = sorted(context_path.glob("*.md"))
        parts = []
        for f in files:
            if f.stem != current_agent_id:
                parts.append(f"## {f.stem}\n{f.read_text(encoding='utf-8')}")
        return "\n\n".join(parts)

    def _build_prompt(self, agent_id: str, task: str, claude_md: str, prev_context: str, output_path: Path) -> str:
        parts = []
        if claude_md:
            parts.append(claude_md)

        # Расширенное ТЗ с содержимым файлов
        tz_expanded = self.project_dir / "tz" / "tz_expanded.md"
        if not tz_expanded.exists():
            tz_expanded = self.project_dir / "tz" / "tz.md"
        tz_text = tz_expanded.read_text(encoding="utf-8") if tz_expanded.exists() else ""
        if tz_text:
            parts.append(f"## Техническое задание проекта\n\n{tz_text}")

        if prev_context:
            parts.append(f"## Результаты предыдущих агентов\n\n{prev_context}")
        parts.append(f"## Твоя задача\n\n{task}")
        parts.append(f"## Рабочая директория\n\nСохраняй все файлы в: {output_path}")

        # Универсальный критерий готовности — последняя и самая сильная инструкция
        parts.append(
            "## Критерий готовности (проверь перед завершением)\n\n"
            "Результат идёт напрямую заказчику и должен работать с первого раза:\n"
            "1. Всё реализовано полностью — без TODO, заглушек, фейковых данных и незавершённых кусков.\n"
            "2. Никаких вызовов несуществующих API/серверов/пакетов. Клиентская логика считается на клиенте "
            "(калькулятор вычисляет `6*6=36` в JS, а не через запрос к серверу).\n"
            "3. Основной сценарий и краевые случаи реально проверены — для кода прогони через bash/node/python "
            "и убедись в правильном результате своими глазами.\n"
            "4. Обработаны ошибки и краевые случаи (пустой ввод, деление на ноль, некорректные данные).\n"
            "Не пиши «готово», пока не выполнил все пункты."
        )
        return "\n\n".join(parts)

    def _estimate_quality(self, output: str, task: str) -> int:
        if not output or len(output) < 50:
            return 2
        if len(output) > 500:
            return 8
        return 5
