@echo off
setlocal

cd /d "%~dp0"
set "NEED_REPAIR=0"

if not exist "node_modules" (
  echo [INFO] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    goto :fail
  )
)

if not exist "node_modules\@babel\core\lib\index.js" (
  set "NEED_REPAIR=1"
)

if "%NEED_REPAIR%"=="1" (
  echo [WARN] Detected incomplete dependencies. Running repair install...
  call npm install --force
  if errorlevel 1 (
    echo [ERROR] Dependency repair failed.
    goto :fail
  )
)

echo [INFO] Starting frontend (dev mode)...
call npm run dev -w apps/web
if errorlevel 1 (
  echo.
  echo [ERROR] Frontend dev server berhenti karena error.
  goto :fail
)

exit /b 0

:fail
echo.
pause
exit /b 1
