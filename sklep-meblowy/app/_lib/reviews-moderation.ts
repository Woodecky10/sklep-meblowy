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

export function poluDlaPrzejrzenia(teraz: Date): { moderated_at: string } {
  return { moderated_at: teraz.toISOString() };
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
