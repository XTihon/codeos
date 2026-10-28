# FreelanceOS — запуск в dev режиме
Write-Host "Starting FreelanceOS..." -ForegroundColor Cyan

# Запуск Python API
Write-Host "Starting Python API on port 7432..." -ForegroundColor Yellow
$api = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Dev\freelance-os; python core/api.py" -PassThru

Start-Sleep -Seconds 2

# Запуск Electron
Write-Host "Starting Electron app..." -ForegroundColor Yellow
cd C:\Dev\freelance-os\app
npm run dev

# При закрытии убиваем API
Stop-Process -Id $api.Id -ErrorAction SilentlyContinue
