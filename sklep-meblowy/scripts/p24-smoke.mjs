// Smoke-test konfiguracji Przelewy24 — sprawdza klucze i PODPIS bez klikania
// przez cały checkout. Uruchamiać z katalogu sklep-meblowy:
//
//   npm run p24:smoke
//
// Czyta P24_* z .env.local (standalone skrypt nie dostaje env od Next-a).
// Robi dwie rzeczy:
//   1. GET /api/v1/testAccess — sprawdza Basic Auth (posId + klucz API). Błąd tu
//      = złe posId/API key, jeszcze nic nie mówi o podpisie.
//   2. POST /api/v1/transaction/register na 1 PLN — sprawdza PODPIS SHA-384 z CRC
//      (najbardziej prawdopodobne miejsce błędu: kolejność pól w sign). Sukces
//      zwraca token; skrypt drukuje URL, który można otworzyć w przeglądarce.
//
// Rejestracja transakcji w sandboxie nic nie kosztuje i nie tworzy zamówienia
// w naszej bazie — sessionId jest losowy, a notyfikacja nie ma gdzie dojść.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { p24Sign } from "../app/_lib/p24.ts";

// Minimalny parser .env.local — bez zależności. Obsługuje KEY=VALUE, komentarze
// i cudzysłowy; ignoruje puste linie.
function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// Każde ✖ MUSI zejść niezerowym kodem wyjścia. Ten skrypt jest jedynym
// strażnikiem cichej awarii notyfikacji (POST na nieistniejącą ścieżkę pod /api/
// oddaje HTML zamiast błędu), więc dopóki kończył się zerem, nie dało się go
// wpiąć w nic automatycznego — „✖" przewijało się w logu i wyglądało jak sukces.
// process.exitCode (a nie process.exit) pozwala dokończyć pozostałe sprawdzenia.
function fail(...args) {
  process.exitCode = 1;
  console.error(...args);
}

const env = { ...loadEnvLocal(), ...process.env };
const merchantId = Number(env.P24_MERCHANT_ID);
const posId = Number(env.P24_POS_ID);
const apiKey = env.P24_API_KEY;
const crc = env.P24_CRC;
const baseUrl = env.P24_BASE_URL;

const missing = [
  ["P24_MERCHANT_ID", merchantId],
  ["P24_POS_ID", posId],
  ["P24_API_KEY", apiKey],
  ["P24_CRC", crc],
  ["P24_BASE_URL", baseUrl],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  fail(`\n✖ Brak w .env.local (albo w env): ${missing.join(", ")}`);
  console.error(`
Skąd wziąć wartości — panel sandboxa: https://sandbox.przelewy24.pl/panel
(⚠ sam korzeń https://sandbox.przelewy24.pl zwraca HTTP 400 — jako P24_BASE_URL
jest poprawny, ale w przeglądarce trzeba wejść na /panel):
  P24_MERCHANT_ID  — ID sprzedawcy (zwykle to samo co POS ID)
  P24_POS_ID       — ID sklepu
  P24_API_KEY      — klucz do REST API (Konfiguracja → dostęp do API)
  P24_CRC          — klucz CRC z tej samej sekcji
  P24_BASE_URL     — https://sandbox.przelewy24.pl (produkcja: https://secure.przelewy24.pl)
`);
  process.exit(1);
}

const auth = Buffer.from(`${posId}:${apiKey}`).toString("base64");
const isSandbox = baseUrl.includes("sandbox");
console.log(`\nP24 smoke — ${baseUrl}${isSandbox ? "  (sandbox)" : "  ⚠ PRODUKCJA — transakcja będzie prawdziwa"}`);
console.log(`merchantId=${merchantId} posId=${posId} crc=${String(crc).slice(0, 4)}… apiKey=${String(apiKey).slice(0, 4)}…\n`);

// ── 1. Basic Auth ─────────────────────────────────────────────────────────
let ok = true;
try {
  const res = await fetch(`${baseUrl}/api/v1/testAccess`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const body = await res.text();
  if (res.ok) {
    console.log(`✔ testAccess: HTTP ${res.status} — posId + klucz API działają`);
  } else {
    ok = false;
    fail(`✖ testAccess: HTTP ${res.status} — ${body.slice(0, 300)}`);
    console.error("  → sprawdź P24_POS_ID i P24_API_KEY (Basic Auth: posId jako login, klucz API jako hasło)");
  }
} catch (err) {
  ok = false;
  fail(`✖ testAccess: brak połączenia — ${err.message}`);
}

// ── 2. register (weryfikuje podpis) ───────────────────────────────────────
if (ok) {
  const sessionId = randomUUID();
  const amount = 100; // 1,00 PLN w groszach
  const sign = p24Sign({ sessionId, merchantId, amount, currency: "PLN", crc });
  const payload = {
    merchantId,
    posId,
    sessionId,
    amount,
    currency: "PLN",
    description: "Smoke test konfiguracji P24",
    email: "smoke@example.com",
    country: "PL",
    language: "pl",
    urlReturn: "http://localhost:3000/checkout/success",
    urlStatus: "http://localhost:3000/api/p24/status",
    sign,
  };
  try {
    const res = await fetch(`${baseUrl}/api/v1/transaction/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (res.ok) {
      const token = JSON.parse(body)?.data?.token;
      console.log(`✔ register: HTTP ${res.status} — PODPIS SHA-384 zaakceptowany`);
      console.log(`  token: ${token}`);
      console.log(`  otwórz w przeglądarce: ${baseUrl}/trnRequest/${token}`);
      console.log("\n  (urlStatus wskazuje localhost, więc notyfikacja nie dojdzie — to tylko test podpisu.)");
    } else {
      fail(`✖ register: HTTP ${res.status} — ${body.slice(0, 500)}`);
      console.error("  → jeśli błąd dotyczy 'sign', kolejność pól podpisu nie zgadza się z dokumentacją:");
      console.error("    register  = { sessionId, merchantId, amount, currency, crc }   (app/_lib/p24.ts)");
      console.error("    verify    = { sessionId, orderId, amount, currency, crc }");
      console.error("    notyfikacja = { merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement, crc }   (app/_lib/p24-events.ts)");
    }
  } catch (err) {
    fail(`✖ register: brak połączenia — ${err.message}`);
  }
}

// ── 3. Czy urlStatus faktycznie trafia w NASZ handler? ────────────────────
// Podaj adres wdrożenia jako argument:  npm run p24:smoke -- https://preview...
//
// Po co: nieistniejąca ścieżka pod /api/ oddaje w tym Next-cie stronę not-found
// jako odpowiedź STRUMIENIOWANĄ, a te wg dokumentacji mają status 200 (patrz
// docs/01-app/03-api-reference/03-file-conventions/not-found.md). Skutek: gdyby
// urlStatus miał literówkę, P24 dostałoby 200, uznało notyfikację za
// dostarczoną i NIE ponowiło jej — zamówienie zostałoby pending bez śladu.
// Dlatego sprawdzamy, że pod adresem odpowiada nasz handler, a nie strona HTML.
//
// ⚠️ KAŻDY urlStatus, jaki wysyłamy do P24, musi być tu wymieniony. Meble
// (app/api/checkout/route.ts) i próbki (app/_lib/sample-p24.ts) mają OSOBNE
// trasy notyfikacji, bo sessionId znaczy w nich co innego (orders.id vs
// sample_orders.id) — i osobno da się je zepsuć.
const NOTIFICATION_PATHS = [
  ["/api/p24/status", "meble (app/api/checkout/route.ts)"],
  ["/api/p24/probki-status", "próbki (app/_lib/sample-p24.ts)"],
];

async function checkNotificationUrl(target, path, who) {
  const url = `${target}${path}`;
  console.log(`Sprawdzam urlStatus [${who}]: ${url}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}", // celowo bez podpisu — ma odbić się o bramkę podpisu
    });
    const ct = res.headers.get("content-type") ?? "";
    const body = (await res.text()).slice(0, 200);
    if (res.status === 400 && ct.includes("json")) {
      console.log(`✔ urlStatus: HTTP 400 ${body} — odpowiada NASZ handler, bramka podpisu działa`);
    } else if (res.status === 500) {
      fail(`✖ urlStatus: HTTP 500 — trasa istnieje, ale temu wdrożeniu brakuje zmiennych P24_* (getP24Config rzuca)`);
    } else if (ct.includes("html")) {
      fail(`✖ urlStatus: HTTP ${res.status} i HTML zamiast JSON-a — pod tym adresem NIE MA naszej trasy.`);
      console.error("  ⚠ To jest cicha awaria: P24 zobaczy 200, uzna notyfikację za dostarczoną i jej NIE ponowi.");
      console.error(`  → sprawdź, czy gałąź z ${path} jest wdrożona pod tym adresem i czy ścieżka nie ma literówki`);
    } else {
      fail(`✖ urlStatus: nieoczekiwane HTTP ${res.status} (${ct}) ${body}`);
    }
  } catch (err) {
    fail(`✖ urlStatus: brak połączenia — ${err.message}`);
  }
}

const target = process.argv[2]?.replace(/\/+$/, "");
if (target) {
  for (const [path, who] of NOTIFICATION_PATHS) {
    await checkNotificationUrl(target, path, who);
  }
} else {
  console.log("Pominięto sprawdzenie urlStatus (podaj adres: npm run p24:smoke -- https://twoj-deploy)");
}

console.log("");
