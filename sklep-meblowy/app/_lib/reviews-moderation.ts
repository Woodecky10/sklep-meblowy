// Czysta logika moderacji opinii — bez Supabase i bez next/headers, żeby dało
// się to zaimportować w vitest (environment: "node"). Odczyty siedzą
// w reviews-admin.ts, akcje w app/admin/opinie/actions.ts.
//
// Od migracji 78 opinia publikuje się natychmiast, a „nieprzejrzana" to NIE
// osobny status, tylko puste moderated_at. Dzięki temu usunięcie z witryny
// (rejected) i przejrzenie (stempel) są rozłączne i żadne z nich nie musi
// zgadywać, co znaczy drugie.

import type { ReviewStatus } from "./types";

export type ReviewBucket = "nowe" | "opublikowane" | "usuniete";

export function reviewBucket(r: {
  status: ReviewStatus;
  moderated_at: string | null;
}): ReviewBucket {
  if (r.status === "rejected") return "usuniete";
  // pending nie powinno już powstawać, ale wiersze sprzed migracji 78 (albo
  // z okna wdrożenia, gdy migracja była, a kod jeszcze nie) NIE są publiczne.
  // Muszą więc wylądować tam, gdzie Julia patrzy, a nie zniknąć.
  if (r.moderated_at === null || r.status === "pending") return "nowe";
  return "opublikowane";
}

export function poluDlaNowegoZapisu(): { status: "approved"; moderated_at: null } {
  return { status: "approved", moderated_at: null };
}

// Zwraca też status, nie tylko stempel — celowo. W oknie między aplikacją
// migracji 78 a wdrożeniem kodu stary kod nadal zapisywał `status: "pending"`.
// Taki wiersz trafia do kubełka „nowe" (patrz reviewBucket — pending zawsze
// ląduje tam, niezależnie od moderated_at), ale gdyby „Przejrzane" stemplowało
// WYŁĄCZNIE moderated_at, wiersz zniknąłby z „nowe" (moderated_at przestaje być
// puste) i NIE trafiłby do „opublikowane" (tam warunek to `status = 'approved'`)
// — zostałby niewidoczny na zawsze, bez żadnego przycisku, który by to naprawił
// (jedyne obejście: Zdejmij → Przywróć, czego nikt by się nie domyślił).
// Wymuszenie 'approved' jest tu bezpieczne, bo w kubełku „nowe" NIGDY nie ma
// wierszy `rejected` — reviewBucket i getReviewsForBucket odsiewają je jawnie —
// więc to wywołanie nie może przypadkiem cofnąć decyzji Julii o zdjęciu opinii.
// Dla wierszy już `approved` to zwykły no-op na statusie.
export function poluDlaPrzejrzenia(teraz: Date): {
  status: "approved";
  moderated_at: string;
} {
  return { status: "approved", moderated_at: teraz.toISOString() };
}

export function poluDlaUsuniecia(teraz: Date): {
  status: "rejected";
  moderated_at: string;
} {
  return { status: "rejected", moderated_at: teraz.toISOString() };
}

export function poluDlaPrzywrocenia(): { status: "approved"; moderated_at: null } {
  return { status: "approved", moderated_at: null };
}
