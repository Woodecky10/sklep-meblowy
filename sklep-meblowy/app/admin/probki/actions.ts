"use server";

// Akcje panelu właścicielki dla zamówień próbek. Cały zapis idzie przez warstwę
// danych (app/_lib/samples.ts), która rozmawia z bazą service_rolem — na
// `sample_orders` nie ma polityki dla admina, więc klient sesyjny nie zobaczyłby
// ani nie zmienił tu niczego.
//
// ⚠️ W pliku "use server" eksportujemy WYŁĄCZNIE async funkcje (typy i stałe
// wysypują się pod Turbopackiem na ReferenceError).

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import {
  cancelSampleOrder,
  getSampleOrderById,
  setSampleOrderStatus,
} from "@/app/_lib/samples";
import type { ActionResult, SampleOrderStatus } from "@/app/_lib/types";
import { SAMPLE_STATUS_LABELS } from "./sample-groups";

const PANEL_PATH = "/admin/probki";

// Wspólna bramka zmiany statusu.
//
// ⚠️ `setSampleOrderStatus` jest BEZWARUNKOWE — przestawi każdy status na każdy
// inny. Panel takich przejść nie oferuje, ale sam brak przycisku nie wystarcza:
// druga, nieodświeżona karta panelu pokazuje przyciski sprzed zmiany. Dlatego
// stan sprawdzamy tuż przed zapisem, na świeżym odczycie.
//
// Blokujemy zawsze „cancelled" (wskrzeszenie + kolejne „Anuluj" zwolniłoby
// darmową pulę DRUGI raz, sześć gratisów zamiast trzech), a `alsoBlock` dokłada
// stany zabronione dla konkretnej akcji.
async function guardStatusChange(
  id: string,
  what: string,
  alsoBlock: SampleOrderStatus[] = []
): Promise<{ ok: false; error: string } | null> {
  const order = await getSampleOrderById(id);
  if (!order) {
    return { ok: false, error: "Nie znaleziono tego zamówienia — odśwież stronę." };
  }
  if (order.status === "cancelled" || alsoBlock.includes(order.status)) {
    return {
      ok: false,
      error: `To zamówienie ma już status „${SAMPLE_STATUS_LABELS[order.status]}” — nie da się go ${what}. Odśwież stronę.`,
    };
  }
  return null;
}

export async function markSamplePacked(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Brak identyfikatora zamówienia" };

  // ⚠️ „Wysłane" TEŻ blokuje pakowanie. Bez tego wystarczy druga otwarta karta
  // panelu: w pierwszej oznaczasz wysyłkę, w drugiej (sprzed zmiany) klikasz
  // „Spakowane" — status wraca na „packed", `sent_at`/`tracking` zostają, a
  // zamówienie ląduje z powrotem w sekcji „do wysłania". Paczka idzie DRUGI raz.
  // Cofania wysyłki panel świadomie nie oferuje, więc nic legalnego to nie ubija.
  const blocked = await guardStatusChange(id, "spakować", ["sent"]);
  if (blocked) {
    // Strona i tak jest nieaktualna — odświeżamy ją, żeby właścicielka zobaczyła
    // prawdziwy stan zamiast klikać drugi raz w to samo.
    revalidatePath(PANEL_PATH);
    return blocked;
  }

  try {
    await setSampleOrderStatus(id, "packed");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Nie udało się zapisać",
    };
  }
  revalidatePath(PANEL_PATH);
  return { ok: true, message: "Oznaczono jako spakowane" };
}

export async function markSampleSent(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  // Numer nadania jest opcjonalny — próbki jadą zwykłą kopertą, która często
  // żadnego numeru nie ma. Pusty string zapisujemy świadomie (czyści literówkę).
  const tracking = String(formData.get("tracking") ?? "").trim();
  if (!id) return { ok: false, error: "Brak identyfikatora zamówienia" };

  const blocked = await guardStatusChange(id, "wysłać");
  if (blocked) {
    revalidatePath(PANEL_PATH);
    return blocked;
  }

  try {
    await setSampleOrderStatus(id, "sent", tracking);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Nie udało się zapisać",
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // TASK 7 (maile) — TU WPINA SIĘ POWIADOMIENIE „próbki wysłane".
  // Miejsce jest celowo PO udanym zapisie statusu i PRZED revalidatePath:
  // e-mail o wysyłce ma wyjść tylko wtedy, gdy zapis faktycznie przeszedł.
  // Potrzebne dane (customer_email, customer_name, pozycje) bierze się ze
  // snapshotu zamówienia — `getSampleOrderById(id)` — a nie z sesji.
  // ⚠️ Funkcja powiadamiająca NIE MOŻE rzucać: padnięty Resend nie może
  // cofnąć właścicielce oznaczenia paczki jako wysłanej.
  // ────────────────────────────────────────────────────────────────────────

  revalidatePath(PANEL_PATH);
  return { ok: true, message: "Oznaczono jako wysłane" };
}

export async function cancelSample(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Brak identyfikatora zamówienia" };

  try {
    await cancelSampleOrder(id);
  } catch (err) {
    // ⚠️ KOMUNIKAT DOSŁOWNIE Z WARSTWY DANYCH. `cancelSampleOrder` potrafi rzucić
    // JUŻ PO udanym anulowaniu — z informacją „zamówienie anulowane, ale zwrot
    // darmowych próbek do puli nie zadziałał, zgłoś to". Zamiana tego na własne
    // „nie udało się anulować" wprowadziłaby właścicielkę w błąd: anulowanie się
    // udało, nie udał się zwrot gratisów, a to dwie różne rzeczy do zrobienia.
    const message = err instanceof Error && err.message ? err.message : "Nie udało się anulować";
    // Odświeżamy TAKŻE po błędzie — z tego samego powodu: status w bazie mógł
    // się już zmienić i lista musi to pokazać.
    revalidatePath(PANEL_PATH);
    return { ok: false, error: message };
  }

  revalidatePath(PANEL_PATH);
  // Świadomie bez „darmowe próbki wróciły do puli": dla zamówienia wysłanego
  // pula NIE wraca, a dla zamówienia bez gratisów nie ma czego zwracać.
  // Co się stanie, właścicielka przeczytała w oknie potwierdzenia.
  return { ok: true, message: "Zamówienie anulowane" };
}
