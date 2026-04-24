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

if not exist "node_modules\@google\genai\dist\node\index.mjs" (
  set "NEED_REPAIR=1"
)
if not exist "node_modules\@babel\core\lib\index.js" (
  set "NEED_REPAIR=1"
)

if not exist ".env" (
  echo [WARN] File .env belum ada. Menyalin dari .env.example...
  copy /y ".env.example" ".env" >nul
  echo [WARN] File yang perlu diedit: %cd%\.env
  echo [WARN] Isi GEMINI_API_KEY di .env lalu jalankan lagi.
  goto :fail
)

findstr /b /c:"GEMINI_API_KEY=your_api_key_here" ".env" >nul
if "%ERRORLEVEL%"=="0" (
  echo [WARN] File yang perlu diedit: %cd%\.env
  echo [WARN] GEMINI_API_KEY di .env masih contoh. Isi API key asli lalu jalankan lagi.
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

echo [INFO] Starting backend server (dev mode)...
call npm run dev -w apps/server
if errorlevel 1 (
  echo.
  echo [ERROR] Backend server berhenti karena error.
  goto :fail
)

exit /b 0

:fail
echo.
pause
exit /b 1
