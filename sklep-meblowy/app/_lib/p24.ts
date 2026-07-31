import { createHash } from "node:crypto";

// Podpis P24: SHA-384 z JSON-a pól w kolejności narzuconej przez dokumentację.
// JSON.stringify zachowuje kolejność wstawiania kluczy — budujemy obiekty
// z kluczami w odpowiedniej kolejności w miejscu wywołania.
export function p24Sign(fields: Record<string, unknown>): string {
  return createHash("sha384").update(JSON.stringify(fields)).digest("hex");
}

export type P24Config = {
  merchantId: number;
  posId: number;
  apiKey: string;
  crc: string;
  baseUrl: string;
};

let _cfg: P24Config | null = null;

// Lazy-init: czytamy env przy pierwszym użyciu, nie przy imporcie (jak stripe.ts).
export function getP24Config(): P24Config {
  if (!_cfg) {
    const merchantId = Number(process.env.P24_MERCHANT_ID);
    const posId = Number(process.env.P24_POS_ID);
    const apiKey = process.env.P24_API_KEY;
    const crc = process.env.P24_CRC;
    const baseUrl = process.env.P24_BASE_URL;
    if (!merchantId || !posId || !apiKey || !crc || !baseUrl) {
      throw new Error("Brak konfiguracji P24 w env (P24_MERCHANT_ID/POS_ID/API_KEY/CRC/BASE_URL)");
    }
    _cfg = { merchantId, posId, apiKey, crc, baseUrl };
  }
  return _cfg;
}

function jsonHeaders(cfg: P24Config): Record<string, string> {
  // Basic Auth: login = posId, hasło = klucz API z panelu P24.
  const token = Buffer.from(`${cfg.posId}:${cfg.apiKey}`).toString("base64");
  return { "Content-Type": "application/json", Authorization: `Basic ${token}` };
}

export type P24RegisterParams = {
  sessionId: string;
  amount: number; // grosze/eurocenty
  currency: "PLN" | "EUR";
  description: string;
  email: string;
  country: string;
  language: string;
  urlReturn: string;
  urlStatus: string;
};

export async function registerTransaction(p: P24RegisterParams): Promise<string> {
  const cfg = getP24Config();
  const sign = p24Sign({
    sessionId: p.sessionId,
    merchantId: cfg.merchantId,
    amount: p.amount,
    currency: p.currency,
    crc: cfg.crc,
  });
  const res = await fetch(`${cfg.baseUrl}/api/v1/transaction/register`, {
    method: "POST",
    headers: jsonHeaders(cfg),
    body: JSON.stringify({
      merchantId: cfg.merchantId,
      posId: cfg.posId,
      sessionId: p.sessionId,
      amount: p.amount,
      currency: p.currency,
      description: p.description,
      email: p.email,
      country: p.country,
      language: p.language,
      urlReturn: p.urlReturn,
      urlStatus: p.urlStatus,
      sign,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`P24 register nieudany (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { data?: { token?: string } };
  const token = json.data?.token;
  if (!token) throw new Error("P24 register: brak tokena w odpowiedzi");
  return token;
}

export async function verifyTransaction(p: {
  sessionId: string;
  orderId: number;
  amount: number;
  currency: "PLN" | "EUR";
}): Promise<boolean> {
  const cfg = getP24Config();
  const sign = p24Sign({
    sessionId: p.sessionId,
    orderId: p.orderId,
    amount: p.amount,
    currency: p.currency,
    crc: cfg.crc,
  });
  const res = await fetch(`${cfg.baseUrl}/api/v1/transaction/verify`, {
    method: "PUT",
    headers: jsonHeaders(cfg),
    body: JSON.stringify({
      merchantId: cfg.merchantId,
      posId: cfg.posId,
      sessionId: p.sessionId,
      amount: p.amount,
      currency: p.currency,
      orderId: p.orderId,
      sign,
    }),
  });
  if (!res.ok) {
    // Treść odpowiedzi jest tu KRYTYCZNA, bo rozróżnia dwie zupełnie różne
    // przyczyny, które bez niej wyglądają w logach identycznie:
    //   "Invalid CRC"  → zły podpis albo zły klucz CRC = błąd KONFIGURACJI,
    //                    żadna płatność się nie rozliczy (alarm),
    //   "Error call 2" → transakcja nie jest opłacona / nie zgadza się orderId
    //                    = normalna ścieżka (klient porzucił płatność).
    // Rozróżnienie potwierdzone empirycznie na sandboxie 2026-07-29: celowo
    // zepsuty podpis zwrócił "Invalid CRC", nasz podpis "Error call 2".
    const detail = await res.text().catch(() => "");
    console.error(
      `[p24] verify nieudany (HTTP ${res.status}) dla sessionId=${p.sessionId}, orderId=${p.orderId}: ${detail}`
    );
    return false;
  }
  const json = (await res.json()) as { data?: { status?: string } };
  if (json.data?.status !== "success") {
    console.error(
      `[p24] verify: P24 nie potwierdził płatności dla sessionId=${p.sessionId} (status=${json.data?.status ?? "brak"})`
    );
    return false;
  }
  return true;
}

export async function refundTransaction(p: {
  sessionId: string;
  orderId: number;
  amount: number;
  requestId: string;
}): Promise<boolean> {
  const cfg = getP24Config();
  const res = await fetch(`${cfg.baseUrl}/api/v1/transaction/refund`, {
    method: "POST",
    headers: jsonHeaders(cfg),
    body: JSON.stringify({
      requestId: p.requestId,
      refunds: [{ sessionId: p.sessionId, amount: p.amount }],
      refundsUuid: p.requestId,
    }),
  });
  if (!res.ok) {
    // Zwrot to operacja na pieniądzach klienta — nieudana próba bez powodu
    // w logach jest bezużyteczna. Funkcja nie ma dziś UI (zwroty robi się
    // w panelu P24), ale gdy dostanie przycisk, to jest jedyne źródło diagnozy.
    const detail = await res.text().catch(() => "");
    console.error(
      `[p24] refund nieudany (HTTP ${res.status}) dla sessionId=${p.sessionId}, requestId=${p.requestId}: ${detail}`
    );
    return false;
  }
  return true;
}

export function trnRequestUrl(token: string): string {
  return `${getP24Config().baseUrl}/trnRequest/${token}`;
}
