@echo off
echo.
echo ============================================
echo   INFINITY BOT -- SETUP SCRIPT (Windows)
echo ============================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found. Download from https://nodejs.org
  pause & exit
)

echo [OK] Node.js found
echo.
echo [*] Installing Node.js packages...
npm install
if %errorlevel% neq 0 (echo [ERROR] npm install failed & pause & exit)
echo [OK] Node packages installed
echo.

echo [*] Installing Python packages...
pip install -r requirements.txt
if %errorlevel% neq 0 (
  python -m pip install -r requirements.txt
)
echo [OK] Python packages done
echo.

if exist main.py (echo [OK] main.py found) else (echo [WARN] main.py MISSING -- copy to this folder!)
if exist 3.js    (echo [OK] 3.js found)    else (echo [WARN] 3.js MISSING -- copy to this folder!)

echo.
echo ============================================
echo   SETUP COMPLETE!
echo   Run:  node server.js
echo   Then open: http://localhost:3000
echo ============================================
echo.
pause
