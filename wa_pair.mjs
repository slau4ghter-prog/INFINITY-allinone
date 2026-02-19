/**
 * INFINITY WA PAIRING SCRIPT
 * Runs standalone — pairs one bot by phone number, prints the 8-digit code, exits.
 * Called by server.js when user clicks "GET PAIR CODE"
 */
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import pino from "pino";

const PHONE  = process.argv[2]; // e.g. 917479655490
const BOT_ID = process.argv[3] || "1";
const REPORT_URL = process.argv[4] || null; // optional HTTP callback

if (!PHONE) {
  console.error("ERROR: No phone number provided");
  console.error("Usage: node wa_pair.mjs <phone> <bot_id>");
  process.exit(1);
}

// Clean phone: digits only, no + or spaces
const cleanPhone = PHONE.replace(/\D/g, "");

const authDir = path.join(process.cwd(), `auth_bot_${BOT_ID}`);
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

const logger = pino({ level: "silent" }); // suppress baileys logs

let paired = false;

async function pair() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    printQRInTerminal: false,
    logger,
    browser: ["Infinity Bot", "Chrome", "4.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    // When socket is ready but not authenticated — request pair code
    if (qr && !paired) {
      // QR appeared — means we need pairing. Request code instead.
      try {
        paired = true;
        console.log(`PAIRING_START:${cleanPhone}`);

        const code = await sock.requestPairingCode(cleanPhone);
        // Format as XXXX-XXXX
        const formatted = code?.match(/.{1,4}/g)?.join("-") || code;

        console.log(`PAIR_CODE:${formatted}`);
        console.log(`BOT_ID:${BOT_ID}`);

        // Save to a file so backend can also read it
        fs.writeFileSync(
          path.join(process.cwd(), `pair_code_bot${BOT_ID}.txt`),
          formatted
        );

      } catch (err) {
        console.error(`PAIR_ERROR:${err.message}`);
        process.exit(1);
      }
    }

    if (connection === "open") {
      console.log(`PAIRED_SUCCESS:BOT ${BOT_ID} linked to WhatsApp!`);
      // Stay alive briefly so creds save, then exit
      setTimeout(() => {
        sock.end();
        process.exit(0);
      }, 3000);
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        console.error("PAIR_ERROR:Logged out");
        process.exit(1);
      } else if (reason === DisconnectReason.connectionClosed) {
        // might just be after pairing — ignore
      } else if (!paired) {
        console.error(`PAIR_ERROR:Connection closed (${reason})`);
        process.exit(1);
      }
    }
  });

  // Timeout after 3 minutes
  setTimeout(() => {
    if (!paired) {
      console.error("PAIR_ERROR:Timeout — no QR received from WhatsApp");
      process.exit(1);
    }
  }, 180_000);
}

pair().catch(err => {
  console.error(`PAIR_ERROR:${err.message}`);
  process.exit(1);
});
