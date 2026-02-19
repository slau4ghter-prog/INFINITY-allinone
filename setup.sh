#!/bin/bash
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ♾ INFINITY BOT — SETUP SCRIPT         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org (v18+)"
  exit 1
fi
echo "✅ Node.js: $(node -v)"

# Check Python
PYTHON=""
if command -v python3 &> /dev/null; then PYTHON="python3"
elif command -v python &> /dev/null; then PYTHON="python"
else
  echo "❌ Python not found. Install from https://python.org"
  exit 1
fi
echo "✅ Python: $($PYTHON --version)"

# Check npm
if ! command -v npm &> /dev/null; then echo "❌ npm not found"; exit 1; fi
echo "✅ npm: $(npm -v)"

echo ""
echo "📦 Installing Node.js dependencies..."
npm install
if [ $? -ne 0 ]; then echo "❌ npm install failed"; exit 1; fi
echo "✅ Node.js deps installed"

echo ""
echo "🐍 Installing Python dependencies..."
$PYTHON -m pip install -r requirements.txt
if [ $? -ne 0 ]; then
  echo "⚠️  pip install failed. Try: pip3 install -r requirements.txt manually"
fi
echo "✅ Python deps installed"

echo ""
echo "📁 Checking required files..."
[[ -f main.py ]] && echo "✅ main.py found" || echo "⚠️  main.py MISSING — copy it to this folder!"
[[ -f 3.js ]]    && echo "✅ 3.js found"    || echo "⚠️  3.js MISSING — copy it to this folder!"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ SETUP COMPLETE!                      ║"
echo "║                                          ║"
echo "║  Start the panel:  node server.js        ║"
echo "║  Then open:        http://localhost:3000  ║"
echo "╚══════════════════════════════════════════╝"
echo ""
