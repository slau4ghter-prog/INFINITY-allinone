// ============================================================
// INFINITY BOT CONTROL PANEL — BACKEND SERVER v2
// Real TG bot execution + Real WA Pair Code via Baileys
// ============================================================
const express    = require('express');
const { spawn, execSync } = require('child_process');
const WebSocket  = require('ws');
const fs         = require('fs');
const path       = require('path');
const http       = require('http');
const multer     = require('multer');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws' });
const PORT   = process.env.PORT || 3000;

const ROOT        = __dirname;
const UPLOAD_DIR  = path.join(ROOT, 'uploads');
const DATA_DIR    = path.join(ROOT, 'data');
const PUBLIC_DIR  = path.join(ROOT, 'public');
const PRESETS_F   = path.join(DATA_DIR, 'presets.json');

[UPLOAD_DIR, DATA_DIR, PUBLIC_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

// multer
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, 'entry_video' + path.extname(file.originalname))
  }),
  limits: { fileSize: 200 * 1024 * 1024 }
});

// state
const procs     = { tg: null, wa: null };
const pairProcs = {};
const wsClients = new Set();

let presets = { tg: [], wa: [] };
if (fs.existsSync(PRESETS_F)) {
  try { presets = JSON.parse(fs.readFileSync(PRESETS_F, 'utf-8')); } catch {}
}
const savePresets = () =>
  fs.writeFileSync(PRESETS_F, JSON.stringify(presets, null, 2));

// ─── WS ───────────────────────────────────────────────────
wss.on('connection', ws => {
  wsClients.add(ws);
  sendWS(ws, 'system', '✅ Connected to Infinity Backend', 'ok');
  ws.on('close', () => wsClients.delete(ws));
});

function sendWS(ws, type, message, level = 'info') {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type, message: String(message).trim(), level, time: new Date().toLocaleTimeString() }));
  } catch {}
}

function broadcast(type, message, level = 'info') {
  for (const ws of wsClients) sendWS(ws, type, message, level);
}

// ─── Python detection ─────────────────────────────────────
function getPythonBin() {
  for (const bin of ['python3', 'python', 'py']) {
    try { execSync(`${bin} --version`, { stdio: 'pipe' }); return bin; } catch {}
  }
  return null;
}

// ─── Pipe process output → WS ─────────────────────────────
function pipeProc(proc, type, onLine) {
  proc.stdout?.on('data', d =>
    d.toString().split('\n').filter(l => l.trim()).forEach(l => {
      if (onLine) onLine(l);
      broadcast(type, l, 'ok');
    })
  );
  proc.stderr?.on('data', d =>
    d.toString().split('\n').filter(l => l.trim())
      .filter(l => !l.includes('ExperimentalWarning') && !l.includes('punycode') && !l.includes('DeprecationWarning'))
      .forEach(l => broadcast(type, l, 'warn'))
  );
  proc.on('error', err => { broadcast(type, `❌ Process error: ${err.message}`, 'err'); procs[type] = null; });
  proc.on('exit', (code, sig) => {
    if (sig === 'SIGTERM') broadcast(type, `⏹ Process stopped`, 'info');
    else broadcast(type, `⚠️ Process exited (code ${code})`, 'warn');
    procs[type] = null;
  });
}

// ═══════════════════════════════════════════════════════════
// TELEGRAM BOT — patch + run main.py
// ═══════════════════════════════════════════════════════════
function patchMainPy(tokens, chatId, ownerId, apiKey, delay, ebbuncDelay) {
  let src = fs.readFileSync(path.join(ROOT, 'main.py'), 'utf-8');

  // patch tokens
  const tokStr = tokens.map(t => `    "${t}"`).join(',\n');
  src = src.replace(/BOT_TOKENS\s*=\s*\[[\s\S]*?\]/, `BOT_TOKENS = [\n${tokStr}\n]`);

  // patch scalars
  src = src
    .replace(/^CHAT_ID\s*=\s*.+/m,            `CHAT_ID = ${chatId}`)
    .replace(/^OWNER_ID\s*=\s*.+/m,           `OWNER_ID = ${ownerId}`)
    .replace(/^tempest_API_KEY\s*=\s*".*?"/m, `tempest_API_KEY = "${apiKey}"`)
    .replace(/^delay\s*=\s*[\d.]+/m,          `delay = ${delay}`)
    .replace(/^ebbunc_delay\s*=\s*[\d.]+/m,   `ebbunc_delay = ${ebbuncDelay}`);

  // fix: bot_loop was accidentally indented inside generate_multiple_voices
  // Detect if there's a line like "    async def bot_loop(" (4-space indented)
  if (src.includes('    async def bot_loop(')) {
    // Extract bot_loop block and de-indent by 4 spaces
    const lines = src.split('\n');
    const out   = [];
    let fixing  = false;
    let fixDepth = 0;
    for (const line of lines) {
      if (!fixing && line.match(/^    async def bot_loop\(/)) {
        fixing = true;
        fixDepth = 4;
        out.push(line.slice(fixDepth)); // remove 4 leading spaces
        continue;
      }
      if (fixing) {
        // stop when we hit another top-level or same-level definition
        if (line.match(/^(async def|def|class)\s/) || (line.match(/^    (async def|def)\s/) && !line.match(/^    async def bot_loop/))) {
          fixing = false;
          out.push(line);
          continue;
        }
        // de-indent this line too
        out.push(line.length > 0 ? (line.startsWith(' '.repeat(fixDepth)) ? line.slice(fixDepth) : line) : line);
      } else {
        out.push(line);
      }
    }
    src = out.join('\n');
  }

  const outPath = path.join(ROOT, 'main_runtime.py');
  fs.writeFileSync(outPath, src);
  return outPath;
}

app.post('/api/tg/start', async (req, res) => {
  if (procs.tg) return res.json({ success: false, error: 'Already running — stop first' });

  const { tokens, chatId, ownerId, apiKey, delay, ebbuncDelay } = req.body;
  if (!tokens?.length) return res.json({ success: false, error: 'No tokens provided' });

  const mainPy = path.join(ROOT, 'main.py');
  if (!fs.existsSync(mainPy))
    return res.json({ success: false, error: 'main.py not found — copy it into the server folder!' });

  const pyBin = getPythonBin();
  if (!pyBin)
    return res.json({ success: false, error: 'Python 3 not installed on this system' });

  try {
    patchMainPy(tokens, chatId, ownerId, apiKey, delay, ebbuncDelay);
    broadcast('tg', `📄 Config written — ${tokens.length} token(s) | ${pyBin}`, 'info');
  } catch (err) {
    return res.json({ success: false, error: 'Patch error: ' + err.message });
  }

  // auto-install deps if missing
  try {
    execSync(`${pyBin} -c "import telegram"`, { stdio: 'pipe' });
  } catch {
    broadcast('tg', '📦 Installing Python packages (one-time, may take a minute)...', 'warn');
    try {
      const pip = spawn(pyBin, ['-m', 'pip', 'install', 'python-telegram-bot==20.7', 'yt-dlp', 'gTTS', 'requests', '-q'], { cwd: ROOT });
      await new Promise(resolve => pip.on('exit', resolve));
      broadcast('tg', '✅ Python packages installed', 'ok');
    } catch (e) {
      broadcast('tg', `⚠️ pip warning: ${e.message?.slice(0,80)}`, 'warn');
    }
  }

  const proc = spawn(pyBin, ['main_runtime.py'], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });
  procs.tg = proc;
  pipeProc(proc, 'tg');

  res.json({ success: true });
  broadcast('tg', `🚀 Launching ${tokens.length} TG bot(s)...`, 'info');
});

app.post('/api/tg/stop', (req, res) => {
  if (!procs.tg) return res.json({ success: false, error: 'Not running' });
  procs.tg.kill('SIGTERM');
  setTimeout(() => { if (procs.tg) { procs.tg.kill('SIGKILL'); procs.tg = null; } }, 3000);
  res.json({ success: true });
  broadcast('tg', '⏹ TG bots stopped', 'warn');
});

app.get('/api/tg/status', (req, res) => res.json({ running: !!procs.tg }));

// ═══════════════════════════════════════════════════════════
// WHATSAPP BOT — patch + run 3.js
// ═══════════════════════════════════════════════════════════
function patchWaJs(count, adminPhone, prefix, mode, delay, targetDelay) {
  let src = fs.readFileSync(path.join(ROOT, '3.js'), 'utf-8');
  const rawPhone = adminPhone.replace(/\D/g, '');
  src = src
    .replace(/const ADMIN_PHONE\s*=\s*"[^"]*"/,     `const ADMIN_PHONE = "${rawPhone}@s.whatsapp.net"`)
    .replace(/let PREFIX\s*=\s*"[^"]*"/,              `let PREFIX = "${prefix}"`)
    .replace(/let MODE\s*=\s*"[^"]*"/,                `let MODE = "${mode}"`)
    .replace(/let GLOBAL_DELAY\s*=\s*[\d.]+/,         `let GLOBAL_DELAY = ${delay}`)
    .replace(/const TARGET_DELAY_MS\s*=\s*[\d.]+/,    `const TARGET_DELAY_MS = ${targetDelay}`)
    .replace(/const MAX_BOTS\s*=\s*\d+/,              `const MAX_BOTS = ${count}`);

  // remove readline block, replace with direct starts
  src = src.replace(
    /const rl\s*=\s*readline\.createInterface[\s\S]*$/,
    `// Auto-started by Infinity Panel\nfor (let i = 1; i <= ${count}; i++) startBot(i);\n`
  );

  fs.writeFileSync(path.join(ROOT, 'wa_runtime.mjs'), src);
}

app.post('/api/wa/start', (req, res) => {
  if (procs.wa) return res.json({ success: false, error: 'Already running — stop first' });
  const { count, adminPhone, prefix, mode, delay, targetDelay } = req.body;

  if (!fs.existsSync(path.join(ROOT, '3.js')))
    return res.json({ success: false, error: '3.js not found — copy it into the server folder!' });

  try {
    patchWaJs(count, adminPhone, prefix, mode, delay, targetDelay);
    broadcast('wa', `📄 WA config written (${count} bot(s), ${mode})`, 'info');
  } catch (err) {
    return res.json({ success: false, error: 'Patch failed: ' + err.message });
  }

  const proc = spawn('node', ['wa_runtime.mjs'], {
    cwd: ROOT, stdio: ['pipe','pipe','pipe'], env: { ...process.env }
  });
  procs.wa = proc;
  pipeProc(proc, 'wa');

  res.json({ success: true });
  broadcast('wa', `🚀 Starting ${count} WA bot(s) [${mode.toUpperCase()}]...`, 'info');
  broadcast('wa', '📱 If not yet paired → Pairing tab → Get Pair Code', 'info');
});

app.post('/api/wa/stop', (req, res) => {
  if (!procs.wa) return res.json({ success: false, error: 'Not running' });
  procs.wa.kill('SIGTERM');
  setTimeout(() => { if (procs.wa) { procs.wa.kill('SIGKILL'); procs.wa = null; } }, 3000);
  res.json({ success: true });
  broadcast('wa', '⏹ WA bots stopped', 'warn');
});

app.get('/api/wa/status', (req, res) => res.json({ running: !!procs.wa }));

// ─── REAL PAIR CODE ───────────────────────────────────────
app.post('/api/wa/paircode', (req, res) => {
  const { phone, botId = '1' } = req.body;
  if (!phone) return res.json({ success: false, error: 'Phone required' });

  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10)
    return res.json({ success: false, error: 'Enter full phone with country code (e.g. 917479655490)' });

  const pairScript = path.join(ROOT, 'wa_pair.mjs');
  if (!fs.existsSync(pairScript))
    return res.json({ success: false, error: 'wa_pair.mjs not found in server folder' });

  // kill old pair proc if any
  if (pairProcs[botId]) {
    try { pairProcs[botId].kill(); } catch {}
    pairProcs[botId] = null;
  }

  broadcast('wa', `🔑 Pairing BOT ${botId} with +${cleanPhone}...`, 'info');
  broadcast('wa', `⏳ Connecting to WhatsApp — wait up to 30 seconds...`, 'info');

  const proc = spawn('node', ['wa_pair.mjs', cleanPhone, String(botId)], {
    cwd: ROOT, stdio: ['pipe','pipe','pipe'], env: { ...process.env }
  });
  pairProcs[botId] = proc;

  proc.stdout?.on('data', d => {
    d.toString().split('\n').filter(l => l.trim()).forEach(line => {
      if (line.startsWith('PAIR_CODE:')) {
        const code = line.replace('PAIR_CODE:', '').trim();
        for (const ws of wsClients) sendWS(ws, 'pair_code', code, 'ok');
        broadcast('wa', `🔢 PAIR CODE: ${code}`, 'ok');
        broadcast('wa', `📲 WhatsApp → Linked Devices → Link a Device → Link with phone number → enter: ${code}`, 'info');
      } else if (line.startsWith('PAIRED_SUCCESS:')) {
        const msg = line.replace('PAIRED_SUCCESS:', '');
        broadcast('wa', `🎉 ${msg}`, 'ok');
        for (const ws of wsClients) sendWS(ws, 'paired', msg, 'ok');
        pairProcs[botId] = null;
      } else if (line.startsWith('PAIR_ERROR:')) {
        const err = line.replace('PAIR_ERROR:', '');
        broadcast('wa', `❌ ${err}`, 'err');
        for (const ws of wsClients) sendWS(ws, 'pair_error', err, 'err');
        pairProcs[botId] = null;
      } else if (line.startsWith('PAIRING_START:')) {
        broadcast('wa', '🔗 WA connected — requesting code...', 'info');
      } else {
        broadcast('wa', line, 'info');
      }
    });
  });

  proc.stderr?.on('data', d =>
    d.toString().split('\n').filter(l => l.trim())
      .filter(l => !l.includes('ExperimentalWarning') && !l.includes('punycode'))
      .forEach(l => broadcast('wa', l, 'warn'))
  );

  proc.on('exit', code => {
    if (pairProcs[botId] === proc) pairProcs[botId] = null;
  });

  res.json({ success: true });
});

app.post('/api/wa/paircode/cancel', (req, res) => {
  const { botId = '1' } = req.body;
  if (pairProcs[botId]) { try { pairProcs[botId].kill(); } catch {} pairProcs[botId] = null; }
  broadcast('wa', `⏹ Pair cancelled for BOT ${botId}`, 'warn');
  res.json({ success: true });
});

// ─── PRESETS ──────────────────────────────────────────────
app.get('/api/presets', (req, res) => res.json(presets));
app.post('/api/presets/tg', (req, res) => {
  presets.tg.push({ ...req.body, saved: new Date().toLocaleString() }); savePresets(); res.json({ success: true });
});
app.delete('/api/presets/tg/:i', (req, res) => {
  const i = parseInt(req.params.i); if (i >= 0 && i < presets.tg.length) presets.tg.splice(i, 1); savePresets(); res.json({ success: true });
});
app.post('/api/presets/wa', (req, res) => {
  presets.wa.push({ ...req.body, saved: new Date().toLocaleString() }); savePresets(); res.json({ success: true });
});
app.delete('/api/presets/wa/:i', (req, res) => {
  const i = parseInt(req.params.i); if (i >= 0 && i < presets.wa.length) presets.wa.splice(i, 1); savePresets(); res.json({ success: true });
});

// ─── Video upload ─────────────────────────────────────────
app.post('/api/upload/video', upload.single('video'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'No file' });
  broadcast('system', `🎬 Video: ${req.file.originalname} (${(req.file.size/1048576).toFixed(1)}MB)`, 'ok');
  res.json({ success: true, filename: req.file.filename });
});

// ─── Status ───────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const pyBin = getPythonBin();
  let pyVer = null;
  if (pyBin) { try { pyVer = execSync(`${pyBin} --version`, {stdio:'pipe'}).toString().trim(); } catch {} }
  res.json({
    tg:          !!procs.tg,
    wa:          !!procs.wa,
    uptime:      Math.floor(process.uptime()),
    tgScript:    fs.existsSync(path.join(ROOT, 'main.py')),
    waScript:    fs.existsSync(path.join(ROOT, '3.js')),
    pairScript:  fs.existsSync(path.join(ROOT, 'wa_pair.mjs')),
    videoFile:   fs.existsSync(path.join(UPLOAD_DIR, 'entry_video.mp4')),
    python:      pyVer || null,
    node:        process.version,
  });
});

// ─── Start server ─────────────────────────────────────────
server.listen(PORT, () => {
  const pyBin = getPythonBin();
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║   ♾  INFINITY BOT BACKEND  —  PORT ${PORT}          ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  🌐 Open: http://localhost:${PORT}\n`);
  console.log(`  main.py   : ${fs.existsSync(path.join(ROOT,'main.py'))    ? '✅ Found' : '❌ MISSING'}`);
  console.log(`  3.js      : ${fs.existsSync(path.join(ROOT,'3.js'))       ? '✅ Found' : '❌ MISSING'}`);
  console.log(`  wa_pair   : ${fs.existsSync(path.join(ROOT,'wa_pair.mjs'))? '✅ Found' : '❌ MISSING'}`);
  console.log(`  Node.js   : ${process.version}`);
  console.log(`  Python    : ${pyBin ? pyBin : '❌ NOT FOUND — install Python 3!'}`);
  console.log('\n  Press Ctrl+C to stop\n');
});

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\n🛑 Shutting down...');
  if (procs.tg) try { procs.tg.kill('SIGTERM'); } catch {}
  if (procs.wa) try { procs.wa.kill('SIGTERM'); } catch {}
  Object.values(pairProcs).forEach(p => { if (p) try { p.kill(); } catch {} });
  setTimeout(() => process.exit(0), 1500);
}
