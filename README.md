# ♾ INFINITY BOT CONTROL PANEL

A real web panel that actually runs your `main.py` (Telegram) and `3.js` (WhatsApp) bot scripts.

---

## 📁 FOLDER STRUCTURE

```
infinity-backend/
├── server.js          ← Backend server (run this)
├── package.json
├── requirements.txt
├── public/
│   └── index.html     ← Web UI (auto-served)
├── setup.sh           ← Linux/Mac setup
├── setup.bat          ← Windows setup
├── main.py            ← ⚠️ COPY YOUR TG BOT HERE
├── 3.js               ← ⚠️ COPY YOUR WA BOT HERE
└── uploads/           ← Entry video goes here
```

---

## 🚀 HOW TO RUN

### Step 1 — Copy your bot files
Copy `main.py` and `3.js` into this folder (same level as `server.js`)

### Step 2 — Install dependencies

**Linux / Mac:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows:**
```
Double-click setup.bat
```

**Manual:**
```bash
npm install
pip install -r requirements.txt
```

### Step 3 — Start the server
```bash
node server.js
```

### Step 4 — Open the panel
Go to: **http://localhost:3000**

---

## 🤖 TELEGRAM BOT

1. Click **TELEGRAM BOT** on home screen
2. Set number of bots using slider
3. Paste your bot tokens (one per slot)
4. Fill in Chat ID, Owner ID, API Key
5. Click **SAVE PRESET** to save your config
6. Click **🚀 START BOTS** — it actually runs `python main.py`!
7. Watch live logs in the **CONSOLE** tab

---

## 💬 WHATSAPP BOT

1. Click **WHATSAPP BOT** on home screen
2. Set number of bots (max 4)
3. Enter admin phone, prefix, mode, delays
4. Click **🚀 START BOTS** — it runs `node 3.js`
5. Go to **PAIRING** tab → enter phone → get pair code
6. Scan QR or use pair code in WhatsApp
7. Watch live logs in **CONSOLE** tab

---

## ⚠️ REQUIREMENTS

| Tool    | Version | Purpose              |
|---------|---------|----------------------|
| Node.js | 18+     | Server + WA bot      |
| Python  | 3.9+    | TG bot               |
| npm     | any     | Package manager      |
| pip     | any     | Python packages      |

---

## 🔧 PORTS

- Panel: `http://localhost:3000`
- WebSocket: `ws://localhost:3000/ws`

Change port: `PORT=8080 node server.js`

---

## 💾 DATA

- Presets are saved in `data/presets.json` (persists across restarts)
- Entry video saved in `uploads/`
- Generated bot configs: `main_runtime.py` and `wa_runtime.mjs`

---

## ❓ TROUBLESHOOTING

**"main.py not found"** → Copy your main.py into the same folder as server.js

**"3.js not found"** → Copy your 3.js into the same folder as server.js

**Python not found** → Install Python 3 from python.org, make sure it's in PATH

**WA bot not connecting** → Check the CONSOLE tab for QR code output in terminal

**Pair code not working** → Baileys will show QR in terminal; scan that instead
