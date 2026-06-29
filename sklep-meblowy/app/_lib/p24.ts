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
