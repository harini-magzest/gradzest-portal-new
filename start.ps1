# Start MongoDB service (runs as Windows service)
Write-Host "Starting MongoDB..." -ForegroundColor Cyan
$mongoStarted = $false

try {
  $svc = Get-Service -Name "MongoDB" -ErrorAction Stop
  if ($svc.Status -ne "Running") {
    Start-Service -Name "MongoDB"
    Start-Sleep -Seconds 2
  }
  Write-Host "MongoDB service is running." -ForegroundColor Green
  $mongoStarted = $true
} catch {
  Write-Host "MongoDB Windows service not found. Trying mongod directly..." -ForegroundColor Yellow
  # Try to start mongod manually (create data dir if needed)
  if (-not (Test-Path "C:\data\db")) { New-Item -ItemType Directory -Force "C:\data\db" | Out-Null }
  Start-Process "mongod" -ArgumentList "--dbpath C:\data\db" -WindowStyle Minimized
  Start-Sleep -Seconds 3
  $mongoStarted = $true
}

# Start backend server
Write-Host "Starting backend server..." -ForegroundColor Cyan
$serverPath = Join-Path $PSScriptRoot "server"
Start-Process "powershell" -ArgumentList "-NoExit", "-Command", "cd '$serverPath'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 2

# Start frontend dev server
Write-Host "Starting frontend..." -ForegroundColor Cyan
Start-Process "powershell" -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "All services started!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "Backend:  http://localhost:5000" -ForegroundColor White
Write-Host ""
Write-Host "If universities still show errors, seed the database:" -ForegroundColor Yellow
Write-Host "  cd server && node seed.js" -ForegroundColor White
