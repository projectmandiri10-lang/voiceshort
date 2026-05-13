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
if not exist "node_modules\@google\genai\dist\node\index.mjs" (
  set "NEED_REPAIR=1"
)

if not exist ".env" (
  echo [WARN] File .env belum ada. Menyalin dari .env.example...
  copy /y ".env.example" ".env" >nul
  echo [WARN] File yang perlu diedit: %cd%\.env
  echo [WARN] Pastikan LITELLM_BASE_URL, LITELLM_SCRIPT_MODEL, dan LITELLM_TTS_MODEL terisi lalu jalankan lagi.
  goto :fail
)

findstr /r /c:"^LITELLM_BASE_URL=$" ".env" >nul
if "%ERRORLEVEL%"=="0" (
  echo [WARN] File yang perlu diedit: %cd%\.env
  echo [WARN] LITELLM_BASE_URL di .env masih kosong. Isi base URL LiteLLM lalu jalankan lagi.
  goto :fail
)

if "%NEED_REPAIR%"=="1" (
  echo [WARN] Detected incomplete dependencies. Running repair install...
  call npm install --force
  if errorlevel 1 (
    echo [ERROR] Dependency repair failed.
    goto :fail
  )
)

echo [INFO] Chrome akan dibuka otomatis ke http://localhost:5174 saat frontend siap...
start "VoiceShort Browser" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-dev-browser.ps1" -Url "http://localhost:5174" -HostName "127.0.0.1" -Port 5174 -TimeoutSeconds 45

rem Detect existing dev servers to avoid EADDRINUSE when user runs this twice.
set "HAS_BACKEND=0"
set "HAS_FRONTEND=0"
netstat -ano | findstr /R /C:":8788 .*LISTENING" >nul 2>nul && set "HAS_BACKEND=1"
netstat -ano | findstr /R /C:":5174 .*LISTENING" >nul 2>nul && set "HAS_FRONTEND=1"

if "%HAS_BACKEND%"=="1" (
  if "%HAS_FRONTEND%"=="1" (
    echo [INFO] Backend 8788 dan frontend 5174 sudah berjalan. Skip start.
    exit /b 0
  )
)

if "%HAS_BACKEND%"=="1" (
  echo [INFO] Backend 8788 sudah berjalan. Menjalankan frontend saja...
  call npm run dev -w apps/web
  goto :after_run
)

if "%HAS_FRONTEND%"=="1" (
  echo [INFO] Frontend 5174 sudah berjalan. Menjalankan backend saja...
  call npm run dev -w apps/server
  goto :after_run
)

echo [INFO] Starting server + frontend (dev mode)...
call npm run dev
:after_run
if errorlevel 1 (
  echo.
  echo [ERROR] Dev server berhenti karena error.
  goto :fail
)

exit /b 0

:fail
echo.
pause
exit /b 1
