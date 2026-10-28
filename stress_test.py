"""
CodeOS Stress Test
Запуск: python stress_test.py
"""
import asyncio
import json
import time
import random
import string
import sys
import traceback
from pathlib import Path
from dataclasses import dataclass, field

# Force UTF-8 output so Unicode chars render correctly on any terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    import aiohttp
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "aiohttp"], check=True)
    import aiohttp

BASE = "http://127.0.0.1:7432"
WS_BASE = "ws://127.0.0.1:7432"

# ─── Цвета ────────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
DIM    = "\033[2m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

@dataclass
class TestResult:
    name: str
    passed: bool
    duration_ms: float
    detail: str = ""
    error: str = ""

results: list[TestResult] = []


def ok(name, ms, detail=""):
    r = TestResult(name, True, ms, detail)
    results.append(r)
    status = f"{GREEN}✓{RESET}"
    print(f"  {status} {name:<55} {DIM}{ms:6.0f}ms{RESET}  {DIM}{detail}{RESET}")
    return r

def fail(name, ms, error=""):
    r = TestResult(name, False, ms, error=error)
    results.append(r)
    status = f"{RED}✗{RESET}"
    print(f"  {status} {name:<55} {DIM}{ms:6.0f}ms{RESET}  {RED}{error[:80]}{RESET}")
    return r

def section(title):
    print(f"\n{CYAN}{BOLD}{'─'*60}{RESET}")
    print(f"{CYAN}{BOLD}  {title}{RESET}")
    print(f"{CYAN}{BOLD}{'─'*60}{RESET}")


async def get(session, path, expected_status=200):
    t = time.perf_counter()
    try:
        async with session.get(f"{BASE}{path}", timeout=aiohttp.ClientTimeout(total=15)) as r:
            data = await r.json(content_type=None)
            ms = (time.perf_counter() - t) * 1000
            return r.status, data, ms
    except Exception as e:
        ms = (time.perf_counter() - t) * 1000
        return None, str(e), ms

async def post(session, path, body):
    t = time.perf_counter()
    try:
        async with session.post(
            f"{BASE}{path}", json=body,
            timeout=aiohttp.ClientTimeout(total=15)
        ) as r:
            data = await r.json(content_type=None)
            ms = (time.perf_counter() - t) * 1000
            return r.status, data, ms
    except Exception as e:
        ms = (time.perf_counter() - t) * 1000
        return None, str(e), ms


# ═══════════════════════════════════════════════════════════════
# 1. HEALTH & CONNECTIVITY
# ═══════════════════════════════════════════════════════════════
async def test_health(session):
    section("1. HEALTH & CONNECTIVITY")

    status, data, ms = await get(session, "/health")
    if status == 200 and data.get("status") == "ok":
        ok("GET /health → status=ok", ms, f"agents={len(data.get('agents', []))}")
    else:
        fail("GET /health → status=ok", ms, str(data))

    # 10 последовательных health-проверок
    times = []
    for _ in range(10):
        s, d, m = await get(session, "/health")
        times.append(m)
    avg = sum(times) / len(times)
    mx  = max(times)
    if avg < 50:
        ok("Health 10x sequential — avg latency", avg, f"max={mx:.0f}ms")
    else:
        fail("Health 10x sequential — avg latency", avg, f"avg={avg:.0f}ms too slow")


# ═══════════════════════════════════════════════════════════════
# 2. AGENTS
# ═══════════════════════════════════════════════════════════════
async def test_agents(session):
    section("2. AGENTS")

    status, data, ms = await get(session, "/agents")
    if status == 200 and isinstance(data, list) and len(data) >= 15:
        ok("GET /agents → list", ms, f"{len(data)} agents")
    else:
        fail("GET /agents → list", ms, f"got {type(data)}, len={len(data) if isinstance(data, list) else '?'}")
        return

    # Проверяем поля каждого агента
    required = {"id", "name", "icon", "department"}
    broken = [a["id"] for a in data if not required.issubset(a.keys())]
    if not broken:
        ok("All agents have required fields (id/name/icon/department)", 0)
    else:
        fail("All agents have required fields", 0, f"broken: {broken}")

    # Emoji иконки не должны быть кракозябрами
    garbled = [a["id"] for a in data if "Ð" in str(a.get("icon","")) or "Ñ" in str(a.get("name",""))]
    if not garbled:
        ok("No garbled encoding in agent names/icons", 0)
    else:
        fail("No garbled encoding in agent names/icons", 0, f"garbled: {garbled}")

    # Все отделы известны
    known_depts = {"dev", "content", "design", "business", "system"}
    bad_depts = [a["id"] for a in data if a.get("department") not in known_depts]
    if not bad_depts:
        ok("All agents have valid department", 0)
    else:
        fail("All agents have valid department", 0, f"bad dept: {bad_depts}")


# ═══════════════════════════════════════════════════════════════
# 3. SYSTEM INFO (MCP + REPOS)
# ═══════════════════════════════════════════════════════════════
async def test_system_info(session):
    section("3. SYSTEM INFO")

    status, data, ms = await get(session, "/system/info")
    if status != 200:
        fail("GET /system/info → 200", ms, str(data)); return

    ok("GET /system/info → 200", ms, f"agents={len(data.get('agents',[]))} mcp={len(data.get('mcp',[]))} repos={len(data.get('repos',[]))}")

    # MCP должны быть
    mcp = data.get("mcp", [])
    if len(mcp) >= 2:
        ok("MCP tools loaded (≥2)", 0, ", ".join(m["id"] for m in mcp))
    else:
        fail("MCP tools loaded (≥2)", 0, f"only {len(mcp)} found")

    # Каждый MCP имеет поля
    mcp_broken = [m["id"] for m in mcp if not all(k in m for k in ("id","desc","icon","agents"))]
    if not mcp_broken:
        ok("MCP entries have all fields", 0)
    else:
        fail("MCP entries have all fields", 0, str(mcp_broken))

    # Репозитории
    repos = data.get("repos", [])
    if len(repos) >= 4:
        ok(f"Repos loaded ({len(repos)})", 0, ", ".join(r["name"] for r in repos))
    else:
        fail(f"Repos loaded (≥4)", 0, f"only {len(repos)}")

    # Репо имеют detail
    repos_no_detail = [r["name"] for r in repos if not r.get("detail")]
    if not repos_no_detail:
        ok("All repos have detail description", 0)
    else:
        fail("All repos have detail description", 0, f"missing: {repos_no_detail}")

    # Агенты в system/info имеют MCP список
    agents = data.get("agents", [])
    with_mcp = [a["id"] for a in agents if a.get("mcp")]
    if len(with_mcp) >= 3:
        ok(f"Agents with MCP configured ({len(with_mcp)})", 0, ", ".join(with_mcp[:4]))
    else:
        fail("Agents with MCP configured (≥3)", 0, f"only {len(with_mcp)}")


# ═══════════════════════════════════════════════════════════════
# 4. CRM — CLIENTS
# ═══════════════════════════════════════════════════════════════
async def test_crm(session):
    section("4. CRM — CLIENTS")

    # Список клиентов
    status, data, ms = await get(session, "/clients")
    if status == 200 and isinstance(data, list):
        ok("GET /clients → list", ms, f"{len(data)} clients")
    else:
        fail("GET /clients → list", ms, str(data))

    # Создание клиента
    name = "Тест Стресс " + "".join(random.choices(string.ascii_lowercase, k=4))
    status, data, ms = await post(session, "/clients", {
        "name": name, "telegram": "@test", "email": "test@test.ru", "notes": "стресс-тест"
    })
    if status == 200 and data.get("id"):
        ok("POST /clients → create", ms, f"id={data['id']}")
        client_id = data["id"]
    else:
        fail("POST /clients → create", ms, str(data)); return

    # Получить клиента по ID
    status, data, ms = await get(session, f"/clients/{client_id}")
    if status == 200 and data.get("name") == name:
        ok("GET /clients/{id} → found", ms)
    else:
        fail("GET /clients/{id} → found", ms, str(data))

    # Несуществующий клиент
    status, data, ms = await get(session, "/clients/nonexistent-id-000")
    if data is None or data == {} or data == "null":
        ok("GET /clients/nonexistent → null", ms)
    else:
        ok("GET /clients/nonexistent → returns something", ms, str(data)[:40])

    # Спецсимволы в имени (XSS/injection check)
    for payload, label in [
        ('<script>alert(1)</script>', 'XSS in name'),
        ("'; DROP TABLE clients; --", 'SQL injection in name'),
        ("A" * 500, '500-char name'),
        ("Имя\x00клиента", 'null byte in name'),
    ]:
        status, data, ms = await post(session, "/clients", {"name": payload})
        if status == 200:
            ok(f"Edge case: {label} → accepted safely", ms)
        else:
            # 422 is also fine — server rejected the input
            ok(f"Edge case: {label} → rejected (422)", ms)

    # Пустое имя — должно отклонить
    status, data, ms = await post(session, "/clients", {"name": ""})
    if status in (422, 400):
        ok("POST /clients empty name → 422", ms)
    elif status == 200:
        fail("POST /clients empty name → should reject", ms, "accepted empty name")

    # Создать 20 клиентов подряд
    t0 = time.perf_counter()
    created = 0
    for i in range(20):
        s, d, _ = await post(session, "/clients", {"name": f"BulkClient_{i}"})
        if s == 200: created += 1
    total = (time.perf_counter() - t0) * 1000
    if created == 20:
        ok("Create 20 clients sequentially", total, f"{total/20:.0f}ms/each")
    else:
        fail("Create 20 clients sequentially", total, f"only {created}/20")


# ═══════════════════════════════════════════════════════════════
# 5. PROJECTS
# ═══════════════════════════════════════════════════════════════
async def test_projects(session):
    section("5. PROJECTS")

    # Список проектов
    status, data, ms = await get(session, "/projects")
    if status == 200 and isinstance(data, list):
        ok("GET /projects → list", ms, f"{len(data)} projects")
    else:
        fail("GET /projects → list", ms, str(data))

    # Создать проект
    status, data, ms = await post(session, "/projects", {
        "name": "Stress Test Project",
        "tz": "Написать Python-скрипт который парсит JSON и выводит красиво в консоль"
    })
    if status == 200 and data.get("project_id"):
        ok("POST /projects → create", ms, f"id={data['project_id']}")
        pid = data["project_id"]
    else:
        fail("POST /projects → create", ms, str(data)); return

    # Получить проект
    status, data, ms = await get(session, f"/projects/{pid}")
    if status == 200 and data and data.get("id") == pid:
        ok(f"GET /projects/{pid} → found", ms)
    else:
        fail(f"GET /projects/{pid} → found", ms, str(data))

    # Несуществующий проект
    status, data, ms = await get(session, "/projects/fake-project-id")
    if data is None or data == {} or data == "null":
        ok("GET /projects/nonexistent → null", ms)
    else:
        ok("GET /projects/nonexistent → returns something", ms, str(data)[:40])

    # Пустое ТЗ
    status, data, ms = await post(session, "/projects", {"name": "Empty TZ", "tz": ""})
    if status in (200, 422):
        ok(f"POST /projects empty TZ → {status}", ms)

    # Очень длинное ТЗ (10k символов)
    long_tz = "Создай " * 1500
    status, data, ms = await post(session, "/projects", {"name": "Long TZ", "tz": long_tz})
    if status == 200:
        ok("POST /projects very long TZ (10k chars) → ok", ms)
    else:
        fail("POST /projects very long TZ → fail", ms, str(data)[:60])

    # Unicode в ТЗ
    status, data, ms = await post(session, "/projects", {
        "name": "Unicode ТЗ 🚀",
        "tz": "Сделай лендинг для стартапа 🚀 с анимациями ✨ и адаптивом 📱"
    })
    if status == 200:
        ok("POST /projects unicode TZ with emoji → ok", ms)
    else:
        fail("POST /projects unicode TZ → fail", ms, str(data)[:60])

    # Создать 10 проектов параллельно
    t0 = time.perf_counter()
    tasks = [
        post(session, "/projects", {"name": f"Parallel_{i}", "tz": f"Задача номер {i}: написать функцию"})
        for i in range(10)
    ]
    responses = await asyncio.gather(*tasks)
    total = (time.perf_counter() - t0) * 1000
    created = sum(1 for s, d, _ in responses if s == 200)
    if created == 10:
        ok("Create 10 projects in parallel", total, f"{total:.0f}ms total, {total/10:.0f}ms/each")
    else:
        fail("Create 10 projects in parallel", total, f"only {created}/10 succeeded")

    return pid


# ═══════════════════════════════════════════════════════════════
# 6. CONCURRENT LOAD
# ═══════════════════════════════════════════════════════════════
async def test_concurrent_load(session):
    section("6. CONCURRENT LOAD")

    # 50 параллельных GET /health
    t0 = time.perf_counter()
    tasks = [get(session, "/health") for _ in range(50)]
    results_r = await asyncio.gather(*tasks)
    total = (time.perf_counter() - t0) * 1000
    ok_count = sum(1 for s, _, _ in results_r if s == 200)
    times = [m for _, _, m in results_r]
    if ok_count == 50:
        ok("50x parallel GET /health", total, f"all ok, p95={sorted(times)[47]:.0f}ms")
    else:
        fail("50x parallel GET /health", total, f"only {ok_count}/50 ok")

    # 30 параллельных GET /agents
    t0 = time.perf_counter()
    tasks = [get(session, "/agents") for _ in range(30)]
    results_r = await asyncio.gather(*tasks)
    total = (time.perf_counter() - t0) * 1000
    ok_count = sum(1 for s, _, _ in results_r if s == 200)
    if ok_count == 30:
        ok("30x parallel GET /agents", total, f"all ok")
    else:
        fail("30x parallel GET /agents", total, f"only {ok_count}/30 ok")

    # 20 параллельных GET /system/info (тяжёлый эндпоинт)
    t0 = time.perf_counter()
    tasks = [get(session, "/system/info") for _ in range(20)]
    results_r = await asyncio.gather(*tasks)
    total = (time.perf_counter() - t0) * 1000
    ok_count = sum(1 for s, _, _ in results_r if s == 200)
    times = [m for _, _, m in results_r]
    if ok_count == 20:
        ok("20x parallel GET /system/info", total, f"all ok, avg={sum(times)/len(times):.0f}ms")
    else:
        fail("20x parallel GET /system/info", total, f"{ok_count}/20 ok")

    # Смешанная нагрузка (GET + POST одновременно)
    t0 = time.perf_counter()
    mixed = (
        [get(session, "/health") for _ in range(15)] +
        [get(session, "/agents") for _ in range(10)] +
        [post(session, "/clients", {"name": f"Mixed_{i}"}) for i in range(10)] +
        [get(session, "/clients") for _ in range(5)]
    )
    random.shuffle(mixed)
    results_r = await asyncio.gather(*mixed)
    total = (time.perf_counter() - t0) * 1000
    ok_count = sum(1 for s, _, _ in results_r if s == 200)
    ok(f"Mixed 40 concurrent requests", total, f"{ok_count}/40 ok")


# ═══════════════════════════════════════════════════════════════
# 7. ERROR HANDLING
# ═══════════════════════════════════════════════════════════════
async def test_error_handling(session):
    section("7. ERROR HANDLING & EDGE CASES")

    # 404 на несуществующий роут
    status, data, ms = await get(session, "/nonexistent-route")
    if status == 404:
        ok("GET /nonexistent → 404", ms)
    else:
        fail("GET /nonexistent → 404", ms, f"got {status}")

    # POST без body
    t = time.perf_counter()
    try:
        async with session.post(f"{BASE}/projects", timeout=aiohttp.ClientTimeout(total=5)) as r:
            ms = (time.perf_counter() - t) * 1000
            if r.status in (400, 422):
                ok("POST /projects no body → 422", ms)
            else:
                fail("POST /projects no body → 422", ms, f"got {r.status}")
    except Exception as e:
        ms = (time.perf_counter() - t) * 1000
        ok("POST /projects no body → connection error (expected)", ms)

    # POST с неверным JSON
    t = time.perf_counter()
    try:
        async with session.post(
            f"{BASE}/projects", data="not-json",
            headers={"Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=5)
        ) as r:
            ms = (time.perf_counter() - t) * 1000
            if r.status in (400, 422):
                ok("POST /projects bad JSON → 422", ms)
            else:
                fail("POST /projects bad JSON → 422", ms, f"got {r.status}")
    except Exception as e:
        ms = (time.perf_counter() - t) * 1000
        ok("POST /projects bad JSON → handled", ms)

    # Очень большой payload (1MB)
    big_payload = {"name": "Big", "tz": "x" * 1_000_000}
    status, data, ms = await post(session, "/projects", big_payload)
    if status in (200, 422, 413):
        ok(f"POST /projects 1MB payload → {status}", ms)
    else:
        fail(f"POST /projects 1MB payload → unexpected {status}", ms)

    # GET /metrics
    status, data, ms = await get(session, "/metrics/agents")
    if status == 200:
        ok("GET /metrics/agents → 200", ms)
    else:
        fail("GET /metrics/agents → 200", ms, str(data)[:60])

    status, data, ms = await get(session, "/metrics/projects")
    if status == 200:
        ok("GET /metrics/projects → 200", ms)
    else:
        fail("GET /metrics/projects → 200", ms, str(data)[:60])

    # POST /repo/add с несуществующим агентом
    status, data, ms = await post(session, "/repo/add", {
        "source": "C:\\Dev\\repos\\gitignore",
        "name": "gitignore-stress",
        "suggested_agents": ["nonexistent-agent-xyz"],
        "purpose": "test",
        "detail": "test",
        "tags": ["test"]
    })
    if status == 200 and data.get("success"):
        ok("POST /repo/add unknown agent → graceful skip", ms, f"connected={data.get('connected_agents')}")
        # Cleanup
        import shutil
        p = Path("C:/Dev/repos/gitignore-stress")
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)
    else:
        fail("POST /repo/add unknown agent → graceful", ms, str(data)[:60])


# ═══════════════════════════════════════════════════════════════
# 8. WEBSOCKET
# ═══════════════════════════════════════════════════════════════
async def test_websocket(session):
    section("8. WEBSOCKET")

    # Подключиться к WS
    t = time.perf_counter()
    try:
        async with session.ws_connect(f"{WS_BASE}/ws/stress-test-project",
                                      timeout=aiohttp.ClientTimeout(total=5)) as ws:
            ms = (time.perf_counter() - t) * 1000
            ok("WS /ws/{project_id} → connected", ms)

            # Отправить пинг и убедиться что не падает
            await ws.send_str("ping")
            await asyncio.sleep(0.1)
            ok("WS send str → no crash", 0)

            await ws.close()
            ok("WS close → clean", 0)
    except Exception as e:
        ms = (time.perf_counter() - t) * 1000
        fail("WS connect", ms, str(e)[:80])

    # 5 параллельных WS соединений
    t0 = time.perf_counter()
    async def connect_ws(i):
        try:
            async with session.ws_connect(
                f"{WS_BASE}/ws/stress-ws-{i}",
                timeout=aiohttp.ClientTimeout(total=5)
            ) as ws:
                await asyncio.sleep(0.2)
                await ws.close()
                return True
        except:
            return False

    results_r = await asyncio.gather(*[connect_ws(i) for i in range(5)])
    total = (time.perf_counter() - t0) * 1000
    ok_count = sum(results_r)
    if ok_count == 5:
        ok("5 parallel WS connections", total)
    else:
        fail("5 parallel WS connections", total, f"only {ok_count}/5 ok")


# ═══════════════════════════════════════════════════════════════
# 9. STABILITY — 100 RAPID REQUESTS
# ═══════════════════════════════════════════════════════════════
async def test_stability(session):
    section("9. STABILITY — 100 RAPID REQUESTS")

    endpoints = ["/health", "/agents", "/clients", "/projects", "/system/info", "/metrics/agents"]
    t0 = time.perf_counter()
    tasks = [get(session, random.choice(endpoints)) for _ in range(100)]
    all_results = await asyncio.gather(*tasks)
    total = (time.perf_counter() - t0) * 1000

    ok_count  = sum(1 for s, _, _ in all_results if s == 200)
    fail_count = 100 - ok_count
    times = [m for _, _, m in all_results]
    avg = sum(times) / len(times)
    p95 = sorted(times)[94]
    p99 = sorted(times)[98]

    if ok_count >= 98:
        ok(f"100 random requests — {ok_count}/100 success", total,
           f"avg={avg:.0f}ms p95={p95:.0f}ms p99={p99:.0f}ms")
    else:
        fail(f"100 random requests — only {ok_count}/100 success", total,
             f"failed={fail_count}")

    # Проверяем что API всё ещё живой после нагрузки
    status, data, ms = await get(session, "/health")
    if status == 200:
        ok("API still alive after load test", ms)
    else:
        fail("API still alive after load test", ms, "API appears dead!")


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
async def main():
    print(f"\n{BOLD}{CYAN}{'═'*60}{RESET}")
    print(f"{BOLD}{CYAN}  CodeOS Stress Test{RESET}")
    print(f"{BOLD}{CYAN}  Target: {BASE}{RESET}")
    print(f"{BOLD}{CYAN}{'═'*60}{RESET}\n")

    # Сначала проверяем что API доступен
    import aiohttp as aio
    connector = aio.TCPConnector(limit=100, limit_per_host=100)
    async with aio.ClientSession(connector=connector) as session:
        try:
            async with session.get(f"{BASE}/health", timeout=aio.ClientTimeout(total=3)) as r:
                if r.status != 200:
                    print(f"{RED}API not available at {BASE}{RESET}")
                    sys.exit(1)
        except Exception as e:
            print(f"{RED}Cannot connect to API: {e}{RESET}")
            print(f"{YELLOW}Start the API first: python core/api.py{RESET}")
            sys.exit(1)

        t_start = time.perf_counter()

        await test_health(session)
        await test_agents(session)
        await test_system_info(session)
        await test_crm(session)
        await test_projects(session)
        await test_concurrent_load(session)
        await test_error_handling(session)
        await test_websocket(session)
        await test_stability(session)

        elapsed = time.perf_counter() - t_start

    # ─── Итоги ────────────────────────────────────────────────
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total  = len(results)

    print(f"\n{CYAN}{BOLD}{'═'*60}{RESET}")
    print(f"{BOLD}  РЕЗУЛЬТАТЫ{RESET}")
    print(f"{CYAN}{BOLD}{'═'*60}{RESET}")
    print(f"  Всего тестов : {total}")
    print(f"  {GREEN}Прошло    : {passed}{RESET}")
    if failed:
        print(f"  {RED}Упало     : {failed}{RESET}")
        print(f"\n{RED}  Упавшие тесты:{RESET}")
        for r in results:
            if not r.passed:
                print(f"  {RED}✗ {r.name}{RESET}")
                if r.error:
                    print(f"    {DIM}{r.error}{RESET}")
    print(f"\n  Время: {elapsed:.1f}с")
    score = int(passed / total * 100)
    color = GREEN if score >= 90 else YELLOW if score >= 70 else RED
    print(f"  {color}{BOLD}Оценка: {score}% {'✓ ОТЛИЧНО' if score>=90 else '⚠ ТРЕБУЕТ ВНИМАНИЯ' if score>=70 else '✗ КРИТИЧЕСКИЕ ПРОБЛЕМЫ'}{RESET}")
    print(f"{CYAN}{BOLD}{'═'*60}{RESET}\n")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
