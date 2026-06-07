#!/usr/bin/env node
/**
 * Screen Solver — macht periodisch Screenshots und löst angezeigte Aufgaben mit Claude.
 *
 * Verwendung:
 *   ANTHROPIC_API_KEY=sk-... node screen-solver.mjs [--interval 5] [--once]
 *   ANTHROPIC_API_KEY=sk-... node screen-solver.mjs --url https://example.com
 *
 * Optionen:
 *   --interval N       Sekunden zwischen Screenshots (Standard: 5)
 *   --once             Nur einmal ausführen, dann beenden
 *   --debug            Screenshot als PNG speichern (screenshot.png)
 *   --url <URL>        Browser-Modus: Screenshot dieser URL (kein Display nötig)
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// .env Datei laden falls vorhanden (KEY=VALUE pro Zeile)
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Argumente parsen ---
const args = process.argv.slice(2);
const intervalSec = (() => {
  const idx = args.indexOf("--interval");
  return idx !== -1 ? parseInt(args[idx + 1], 10) || 5 : 5;
})();
const runOnce  = args.includes("--once");
const debugMode = args.includes("--debug");
const urlIdx   = args.indexOf("--url");
const targetUrl = urlIdx !== -1 ? args[urlIdx + 1] : null;

// --- Anthropic Client ---
const client = new Anthropic();

const SYSTEM_PROMPT = `Du bist ein KI-Assistent, der Aufgaben auf dem Bildschirm erkennt und löst.

Deine Aufgabe:
1. Analysiere den Screenshot sorgfältig.
2. Erkenne, ob eine Aufgabe, Frage oder ein Problem sichtbar ist.
3. Wenn ja: Löse es und gib die Antwort klar und prägnant aus.
4. Wenn kein klares Problem erkennbar ist: Beschreibe kurz, was du siehst.

Antworte auf Deutsch. Halte die Antwort kurz und fokussiert auf das erkannte Problem.`;

let lastScreenHash = null;
let solveCount = 0;
let playwrightBrowser = null;

function hashBuffer(buf) {
  let h = 0;
  const step = Math.max(1, Math.floor(buf.length / 1000));
  for (let i = 0; i < buf.length; i += step) {
    h = (Math.imul(31, h) + buf[i]) | 0;
  }
  return h;
}

// --- Screenshot: Desktop (benötigt Display) ---
async function captureDesktop() {
  const { default: screenshot } = await import("screenshot-desktop");
  return screenshot({ format: "png" });
}

// --- Screenshot: Browser via Playwright (kein Display nötig) ---
async function captureBrowser(url) {
  if (!playwrightBrowser) {
    const { chromium } = await import("playwright");
    playwrightBrowser = await chromium.launch({ headless: true });
  }
  const page = await playwrightBrowser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  const buf = await page.screenshot({ type: "png", fullPage: false });
  await page.close();
  return buf;
}

async function captureScreen() {
  if (targetUrl) {
    return captureBrowser(targetUrl);
  }
  try {
    return await captureDesktop();
  } catch (err) {
    throw new Error(`Screenshot fehlgeschlagen: ${err.message}\nTipp: --url <URL> für Browser-Modus verwenden`);
  }
}

async function solveFromScreen(imgBuffer) {
  const base64 = imgBuffer.toString("base64");
  process.stdout.write("\n🔍 Analysiere Bildschirm...\n");

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: base64 },
          },
          {
            type: "text",
            text: "Was siehst du auf diesem Screenshot? Gibt es eine Aufgabe oder ein Problem, das gelöst werden soll? Wenn ja, löse es.",
          },
        ],
      },
    ],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function printSeparator() {
  console.log("\n" + "═".repeat(60));
}

async function tick() {
  let imgBuffer;
  try {
    imgBuffer = await captureScreen();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    return;
  }

  if (debugMode) {
    const debugPath = path.join(__dirname, "screenshot.png");
    fs.writeFileSync(debugPath, imgBuffer);
    console.log(`💾 Screenshot gespeichert: ${debugPath}`);
  }

  const hash = hashBuffer(imgBuffer);
  if (hash === lastScreenHash && solveCount > 0) {
    process.stdout.write(".");
    return;
  }
  lastScreenHash = hash;

  try {
    const solution = await solveFromScreen(imgBuffer);
    solveCount++;
    printSeparator();
    console.log(`⏱  ${new Date().toLocaleTimeString("de-DE")}  |  Analyse #${solveCount}`);
    if (targetUrl) console.log(`🌐 URL: ${targetUrl}`);
    console.log("═".repeat(60));
    console.log(solution);
    printSeparator();
  } catch (err) {
    console.error(`\n❌ Claude-Fehler: ${err.message}`);
    if (err.status === 401) {
      console.error("   → Ungültiger ANTHROPIC_API_KEY.");
      shutdown(1);
    }
  }
}

// --- Sauberes Beenden (verhindert Windows async-Handle Assertion) ---
let intervalHandle = null;

function shutdown(code = 0) {
  process.exitCode = code;
  if (intervalHandle) clearInterval(intervalHandle);
  // Kurze Verzögerung damit native Handles (screenshot-desktop) sauber schließen
  setTimeout(() => {
    if (playwrightBrowser) {
      playwrightBrowser.close().catch(() => {}).finally(() => process.exit(code));
    } else {
      process.exit(code);
    }
  }, 200);
}

process.on("SIGINT", () => { console.log("\n👋 Beende..."); shutdown(0); });
process.on("SIGTERM", () => shutdown(0));

// --- Start ---
console.log("🖥️  Screen Solver gestartet");
console.log(`   Modell   : claude-opus-4-8`);
console.log(`   Modus    : ${runOnce ? "einmalig" : `alle ${intervalSec}s`}`);
console.log(`   Quelle   : ${targetUrl ? `Browser → ${targetUrl}` : "Desktop-Screenshot"}`);
console.log(`   Debug    : ${debugMode ? "ja (screenshot.png)" : "nein"}`);
console.log("   Zum Beenden: Ctrl+C\n");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY nicht gesetzt!");
  console.error("   Erstelle eine .env Datei mit: ANTHROPIC_API_KEY=sk-ant-...");
  setTimeout(() => process.exit(1), 200);
} else {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log(`   API Key  : ${key.slice(0, 18)}...${key.slice(-4)} (${key.length} Zeichen)`);
  if (!key.startsWith("sk-ant-")) {
    console.error("❌ Key hat falsches Format! Muss mit 'sk-ant-' beginnen.");
    setTimeout(() => process.exit(1), 200);
  } else {
    await tick();
    if (!runOnce) {
      intervalHandle = setInterval(tick, intervalSec * 1000);
    } else {
      shutdown(0);
    }
  }
}
