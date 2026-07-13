@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo [INFO] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    goto :fail
  )
)

if not exist ".env" (
  echo [WARN] File .env belum ada. Menyalin dari .env.example...
  copy /y ".env.example" ".env" >nul
  echo [WARN] File yang perlu diedit: %cd%\.env
  echo [WARN] Pastikan AIVENE_API_KEY, OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, dan VITE_SUPABASE_ANON_KEY terisi lalu jalankan lagi.
  goto :fail
)

findstr /r /c:"^AIVENE_API_KEY=$" ".env" >nul
if "%ERRORLEVEL%"=="0" (
  echo [WARN] AIVENE_API_KEY di .env masih kosong.
  goto :fail
)

findstr /r /c:"^OPENROUTER_API_KEY=$" ".env" >nul
if "%ERRORLEVEL%"=="0" (
  echo [WARN] OPENROUTER_API_KEY di .env masih kosong.
  goto :fail
)

findstr /r /c:"^SUPABASE_URL=$" ".env" >nul
if "%ERRORLEVEL%"=="0" (
  echo [WARN] SUPABASE_URL di .env masih kosong.
  goto :fail
)

findstr /r /c:"^SUPABASE_SERVICE_ROLE_KEY=$" ".env" >nul
if "%ERRORLEVEL%"=="0" (
  echo [WARN] SUPABASE_SERVICE_ROLE_KEY di .env masih kosong.
  goto :fail
)

findstr /r /c:"^VITE_SUPABASE_URL=$" ".env" >nul
if "%ERRORLEVEL%"=="0" (
  echo [WARN] VITE_SUPABASE_URL di .env masih kosong.
  goto :fail
)

findstr /r /c:"^VITE_SUPABASE_ANON_KEY=$" ".env" >nul
if "%ERRORLEVEL%"=="0" (
  echo [WARN] VITE_SUPABASE_ANON_KEY di .env masih kosong.
  goto :fail
)

echo [INFO] Chrome akan dibuka otomatis ke http://localhost:5174 saat frontend siap...
start "VoiceShort Browser" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-dev-browser.ps1" -Url "http://localhost:5174" -HostName "127.0.0.1" -Port 5174 -TimeoutSeconds 45

set "HAS_WORKER=0"
set "HAS_FRONTEND=0"
netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul 2>nul && set "HAS_WORKER=1"
netstat -ano | findstr /R /C:":5174 .*LISTENING" >nul 2>nul && set "HAS_FRONTEND=1"

if "%HAS_WORKER%"=="1" (
  if "%HAS_FRONTEND%"=="1" (
    echo [INFO] Worker API 8787 dan frontend 5174 sudah berjalan. Skip start.
    exit /b 0
  )
)

if "%HAS_WORKER%"=="1" (
  echo [INFO] Worker API 8787 sudah berjalan. Menjalankan frontend saja...
  call npm run dev -w apps/web
  goto :after_run
)

if "%HAS_FRONTEND%"=="1" (
  echo [INFO] Frontend 5174 sudah berjalan. Menjalankan Worker API saja...
  call npm run dev:worker -w apps/web
  goto :after_run
)

echo [INFO] Starting frontend Vite + Worker API (dev mode)...
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
