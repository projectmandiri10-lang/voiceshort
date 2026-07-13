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
  echo [WARN] Edit .env lalu isi AIVENE_API_KEY, OPENROUTER_API_KEY, SUPABASE_URL, dan SUPABASE_SERVICE_ROLE_KEY.
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

echo [INFO] Starting Cloudflare Worker API (local dev)...
call npm run dev:worker -w apps/web
if errorlevel 1 (
  echo.
  echo [ERROR] Worker API berhenti karena error.
  goto :fail
)

exit /b 0

:fail
echo.
pause
exit /b 1
