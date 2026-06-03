@echo off
setlocal

echo [1/6] Moving to project root...
cd /d "%~dp0"

echo [2/6] Stopping anything on ports 5000 and 5173...
for %%P in (5000 5173) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /PID %%A /F >nul 2>&1
  )
)

echo [3/6] Clearing frontend Vite cache...
if exist "frontend\node_modules\.vite" (
  rmdir /s /q "frontend\node_modules\.vite"
)

echo [4/6] Starting backend on http://localhost:5000 ...
start "Meryl Backend" cmd /k "cd /d %~dp0 && python app.py"

echo [5/6] Starting frontend on http://localhost:5173 ...
start "Meryl Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo [6/6] Done.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo If the browser still shows old behavior, press Ctrl+Shift+R.

endlocal
