import asyncio
import json
import subprocess
import time
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
AGENTS_DIR = BASE_DIR / "agents"

# Минимальная длина ТЗ без вопросов
TZ_MIN_CHARS = 80


class Orchestrator:
    def __init__(self, loader, knowledge):
        self.loader = loader
        self.knowledge = knowledge

    async def build_plan(self, project_id: str, tz_text: str) -> dict:
        tz_text = tz_text.strip()

        similar = self.knowledge.find_similar(tz_text)
        agent_list = self.loader.agent_ids()
        system_prompt = self._build_system_prompt(agent_list, similar)
        user_prompt = f"ТЗ:\n\n{tz_text}"

        # Вызовы claude блокирующие (subprocess) — гоняем их в потоках.
        # Для короткого ТЗ строим план И уточнения ПАРАЛЛЕЛЬНО (вдвое быстрее).
        need_clarify = len(tz_text) < TZ_MIN_CHARS
        if need_clarify:
            raw, clarifications = await asyncio.gather(
                asyncio.to_thread(self._call_claude, system_prompt, user_prompt),
                asyncio.to_thread(self._get_clarifications, tz_text),
            )
        else:
            raw = await asyncio.to_thread(self._call_claude, system_prompt, user_prompt)
            clarifications = []

        plan = self._parse_plan(raw, project_id)
        if clarifications:
            plan["clarifications"] = clarifications

        return plan

    def _get_clarifications(self, tz_text: str) -> list[str]:
        prompt = f"""ТЗ очень короткое: "{tz_text}"

Задай 2-3 уточняющих вопроса которые помогут выполнить задачу точнее.
Верни строго JSON-массив строк, без markdown:
["Вопрос 1?", "Вопрос 2?"]"""

        raw = ""
        for attempt in range(3):
            try:
                raw, rc = self._run_claude(prompt, "claude-sonnet-4-6", timeout=30)
            except subprocess.TimeoutExpired:
                raw, rc = "", -1
            if not self._looks_transient(raw, rc):
                break
            time.sleep(2 * (attempt + 1))
        try:
            start, end = raw.find('['), raw.rfind(']') + 1
            if start >= 0 and end > start:
                return json.loads(raw[start:end])
        except Exception:
            pass
        return []

    def _build_system_prompt(self, agent_ids: list, similar_projects: list) -> str:
        agents_desc = "\n".join(f"- {a}" for a in agent_ids)
        similar_str = ""
        if similar_projects:
            similar_str = "\n\nПохожие прошлые проекты:\n" + "\n".join(
                f"- {p['name']}: использовались {p['agents']}" for p in similar_projects[:3]
            )

        return f"""Ты оркестратор CodeOS — системы автоматизации фриланс-задач.
Читаешь ТЗ и строишь минимально необходимую цепочку агентов.

Доступные агенты:
{agents_desc}

ВАЖНЫЕ ПРАВИЛА:
1. Для простой задачи (скрипт, маленький компонент) — используй 1-2 агента максимум
2. Для средней задачи (небольшое приложение) — 2-3 агента
3. Для крупной задачи (полноценный продукт) — до 5 агентов
4. НЕ добавляй агентов "на всякий случай" — только реально нужных
5. business-analyst нужен только если ТЗ реально неоднозначное и требует разбора требований
6. documenter — только если явно нужна документация
7. Оцени риски только если есть реальные проблемы в ТЗ

КАЧЕСТВО РЕЗУЛЬТАТА (критично — заказчику нужен работающий продукт):
8. Если в задаче есть КОД/приложение — ставь последним в цепочке проверяющего агента
   (tester или code-reviewer), чтобы поймать неработающий код до сдачи. Даже для простого
   приложения: developer → tester.
9. Формулируй task КОНКРЕТНО и с критерием приёмки — что именно должно работать.
   Плохо: "Написать калькулятор".
   Хорошо: "Сделать веб-калькулятор (один HTML-файл, вся логика на JS в браузере,
   без обращений к серверу): операции + - * /, обработка деления на ноль, кнопка сброса.
   Проверить, что 6*6=36 и 10/2=5."
10. В task для клиентских приложений явно указывай "вся логика на клиенте, без запросов к серверу",
    если бэкенд по ТЗ не требуется.{similar_str}

Верни строго JSON без markdown:
{{
  "title": "Название проекта",
  "estimated_time_min": 10,
  "estimated_tokens_k": 15,
  "risks": [],
  "chain": [
    {{
      "agent_id": "developer",
      "task": "Конкретная задача для этого агента",
      "estimated_time_min": 5,
      "estimated_tokens_k": 8,
      "debate": false
    }}
  ]
}}"""

    # Признаки транзиентной ошибки авторизации/сети от claude CLI
    _TRANSIENT_MARKERS = (
        "403", "request not allowed", "failed to authenticate",
        "rate limit", "overloaded", "429", "500", "502", "503",
        "econnreset", "network error", "timed out",
    )

    def _looks_transient(self, raw: str, returncode: int) -> bool:
        low = raw.lower()
        if any(m in low for m in self._TRANSIENT_MARKERS):
            return True
        # Пустой ответ при ненулевом коде — тоже транзиент
        if returncode != 0 and not raw.strip():
            return True
        return False

    def _run_claude(self, prompt: str, model: str, timeout: int) -> tuple[str, int]:
        # Бинарный режим (bytes) — обход cp1252 на Windows; UTF-8 в обе стороны
        result = subprocess.run(
            ["claude", "-p", "-", "--model", model, "--output-format", "text",
             "--dangerously-skip-permissions"],
            input=prompt.encode("utf-8"),
            capture_output=True,
            timeout=timeout,
        )
        raw = result.stdout.decode("utf-8", errors="replace").strip()
        # Диагностика ТОЛЬКО при ошибке — с ПОЛНЫМ окружением для поиска токсичной переменной
        if self._looks_transient(raw, result.returncode) or result.returncode != 0:
            try:
                import os
                stderr = result.stderr.decode("utf-8", errors="replace").strip()
                env_dump = "\n".join(f"  {k}={str(v)[:200]}" for k, v in sorted(os.environ.items()))
                (BASE_DIR / "data" / "claude_diag.txt").write_text(
                    f"time={time.strftime('%Y-%m-%d %H:%M:%S')}\n"
                    f"returncode={result.returncode}\n"
                    f"STDOUT[:1500]:\n{raw[:1500]}\n"
                    f"STDERR[:1500]:\n{stderr[:1500]}\n"
                    f"FULL_ENV:\n{env_dump}\n",
                    encoding="utf-8"
                )
            except Exception:
                pass
        return raw, result.returncode

    def _call_claude(self, system_prompt: str, user_prompt: str) -> str:
        orch_config = self.loader.get_config("orchestrator") or {}
        model = orch_config.get("model", "claude-sonnet-4-6")
        prompt = f"{system_prompt}\n\n{user_prompt}"

        raw, rc = "", -1
        for attempt in range(3):
            try:
                raw, rc = self._run_claude(prompt, model, timeout=120)
            except subprocess.TimeoutExpired:
                raw, rc = "", -1
            if not self._looks_transient(raw, rc):
                break  # успех или неретраибельный результат
            print(f"[orchestrator] transient claude error (attempt {attempt+1}/3): {raw[:120]!r}")
            time.sleep(2 * (attempt + 1))  # 2s, 4s backoff
        return raw

    def _parse_plan(self, raw: str, project_id: str) -> dict:
        text = raw.strip()

        # Снимаем markdown-обёртку ```json ... ``` если Claude добавил
        if "```" in text:
            for block in text.split("```"):
                cleaned = block.lstrip("json").lstrip("JSON").strip()
                if cleaned.startswith("{"):
                    text = cleaned
                    break

        try:
            start, end = text.find("{"), text.rfind("}") + 1
            if start >= 0 and end > start:
                plan = json.loads(text[start:end])
                plan["project_id"] = project_id
                # Гарантируем обязательные поля
                plan.setdefault("chain", [])
                plan.setdefault("risks", [])
                plan.setdefault("estimated_time_min", 0)
                plan.setdefault("estimated_tokens_k", 0)
                return plan
        except Exception as e:
            print(f"[orchestrator] parse error: {e}\nRAW:\n{raw[:500]}")

        return {
            "project_id": project_id,
            "title": "Новый проект",
            "estimated_time_min": 0,
            "estimated_tokens_k": 0,
            "risks": ["Не удалось распарсить план — попробуй ещё раз или уточни ТЗ"],
            "chain": []
        }
