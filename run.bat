@echo off
:: Убиваем только Python API на порту 7432 (не трогаем VS Code и другие приложения)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":7432"') do (
    taskkill /f /pid %%P >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Запускаем Electron с готовой сборкой (Electron сам поднимет Python)
cd /d "C:\Dev\projects\own\CodeOS\app"
node_modules\.bin\electron.cmd .
