#!/usr/bin/env node
/**
 * Screen Solver — macht periodisch Screenshots und löst angezeigte Aufgaben mit Claude.
 *
 * Verwendung:
 *   ANTHROPIC_API_KEY=sk-... node screen-solver.mjs [--interval 5] [--once]
 *
 * Optionen:
 *   --interval N   Sekunden zwischen Screenshots (Standard: 5)
 *   --once         Nur einmal ausführen, dann beenden
 *   --debug        Screenshot als PNG speichern (screenshot.png) für Diagnose
 */

import Anthropic from "@anthropic-ai/sdk";
import screenshot from "screenshot-desktop";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Argumente parsen ---
const args = process.argv.slice(2);
const intervalSec = (() => {
  const idx = args.indexOf("--interval");
  return idx !== -1 ? parseInt(args[idx + 1], 10) || 5 : 5;
})();
const runOnce = args.includes("--once");
const debugMode = args.includes("--debug");

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

function hashBuffer(buf) {
  let h = 0;
  const step = Math.max(1, Math.floor(buf.length / 1000));
  for (let i = 0; i < buf.length; i += step) {
    h = (Math.imul(31, h) + buf[i]) | 0;
  }
  return h;
}

async function captureScreen() {
  try {
    const img = await screenshot({ format: "png" });
    return img;
  } catch (err) {
    // Fallback: versuche über playwright einen Screenshot zu machen
    throw new Error(`Screenshot fehlgeschlagen: ${err.message}`);
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
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64,
            },
          },
          {
            type: "text",
            text: "Was siehst du auf diesem Screenshot? Gibt es eine Aufgabe oder ein Problem, das gelöst werden soll? Wenn ja, löse es.",
          },
        ],
      },
    ],
  });

  let answer = "";
  for (const block of response.content) {
    if (block.type === "text") {
      answer += block.text;
    }
  }
  return answer.trim();
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

  // Bildschirm-Hash prüfen — nicht lösen wenn sich nichts geändert hat
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
    console.log("═".repeat(60));
    console.log(solution);
    printSeparator();
  } catch (err) {
    console.error(`\n❌ Claude-Fehler: ${err.message}`);
    if (err.status === 401) {
      console.error("   → Bitte ANTHROPIC_API_KEY setzen.");
      process.exit(1);
    }
  }
}

// --- Hauptschleife ---
console.log("🖥️  Screen Solver gestartet");
console.log(`   Modell   : claude-opus-4-8`);
console.log(`   Modus    : ${runOnce ? "einmalig" : `alle ${intervalSec}s`}`);
console.log(`   Debug    : ${debugMode ? "ja (screenshot.png)" : "nein"}`);
console.log("   Zum Beenden: Ctrl+C\n");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY nicht gesetzt!");
  console.error("   Setze ihn z.B. mit: export ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

await tick();

if (!runOnce) {
  setInterval(tick, intervalSec * 1000);
} else {
  process.exit(0);
}
