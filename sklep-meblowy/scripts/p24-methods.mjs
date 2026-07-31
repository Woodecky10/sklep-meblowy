// Lista metod płatności aktywnych na koncie Przelewy24.
//
//   npm run p24:methods
//
// Czyta P24_* z .env.local (albo ze zmiennych środowiska, które mają priorytet).
// Wywołuje GET /api/v1/payment/methods/pl — operacja TYLKO DO ODCZYTU, nie rusza
// pieniędzy, więc bezpiecznie odpalić ją także na kluczach produkcyjnych.
//
// Po co: strona płatności P24 pokazuje klientowi tylko te metody, które są
// aktywne na koncie ORAZ obsługiwane przez jego urządzenie. Apple Pay renderuje
// się wyłącznie na urządzeniach Apple w Safari, więc jego brak na ekranie w
// Chrome/Windows NIC nie znaczy — o tym, czy jest w ogóle dostępny, rozstrzyga
// dopiero ta lista.
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...loadEnvLocal(), ...process.env };
const posId = env.P24_POS_ID;
const apiKey = env.P24_API_KEY;
const baseUrl = env.P24_BASE_URL;
const lang = process.argv[2] ?? "pl";

if (!posId || !apiKey || !baseUrl) {
  console.error("\n✖ Brak P24_POS_ID / P24_API_KEY / P24_BASE_URL (.env.local albo env).");
  console.error("  Produkcja: P24_BASE_URL=https://secure.przelewy24.pl + klucze z panelu produkcyjnego.");
  process.exit(1);
}

const isSandbox = baseUrl.includes("sandbox");
console.log(`\nMetody płatności — ${baseUrl}  ${isSandbox ? "(SANDBOX)" : "(PRODUKCJA)"}, język: ${lang}`);

const auth = Buffer.from(`${posId}:${apiKey}`).toString("base64");
const res = await fetch(`${baseUrl}/api/v1/payment/methods/${lang}`, {
  headers: { Authorization: `Basic ${auth}` },
});
if (!res.ok) {
  console.error(`✖ HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const items = (await res.json())?.data ?? [];
console.log(`Metod na koncie: ${items.length}\n`);

// Interesują nas przede wszystkim te, o które ktoś zwykle pyta.
const WAZNE = [
  ["ApplePay", /apple/i],
  ["Google Pay", /google/i],
  ["BLIK", /blik/i],
  ["Karta płatnicza", /karta|card/i],
];
for (const [label, re] of WAZNE) {
  const found = items.filter((m) => re.test(m.name ?? ""));
  if (found.length === 0) {
    console.log(`  ✖ ${label.padEnd(16)} — NIE MA na tym koncie`);
  } else {
    for (const m of found) {
      const ok = m.status === true || m.status === "true";
      console.log(`  ${ok ? "✔" : "✖"} ${String(m.name).padEnd(16)} id=${m.id}  status=${m.status}`);
    }
  }
}

if (process.argv.includes("--all")) {
  console.log("\nWszystkie metody:");
  for (const m of items) console.log(`  ${String(m.id).padStart(4)}  ${m.name}  (status=${m.status})`);
}
console.log("");
