// Zdjęcia z produkcji tkaniny — CZYSTY parser wierszy z formularza admina
// (hidden input production_photos_json). Wzorzec parseColorRows z
// app/admin/tkaniny/actions.ts: zły JSON → [], tylko URL-e http(s),
// product_id = niepusty string albo null, twardy limit wierszy.
import type { FabricProductionPhoto } from "./types";

export const MAX_PRODUCTION_PHOTOS = 20;

export function parseProductionPhotos(input: unknown): FabricProductionPhoto[] {
  if (typeof input !== "string") return [];
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: FabricProductionPhoto[] = [];
  for (const r of rows) {
    if (out.length >= MAX_PRODUCTION_PHOTOS) break;
    if (!r || typeof r !== "object") continue;
    const rec = r as { url?: unknown; product_id?: unknown };
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!/^https?:\/\//.test(url)) continue;
    const pid = typeof rec.product_id === "string" ? rec.product_id.trim() : "";
    out.push({ url, product_id: pid === "" ? null : pid });
  }
  return out;
}
