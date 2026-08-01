"use server";

// ⚠️ W pliku z "use server" eksportuj WYŁĄCZNIE async funkcje. `export type`
// wywala się tu pod Turbopackiem runtime'owym ReferenceError (patrz
// reference_turbopack_use_server_export_type). Funkcje pomocnicze bez `export`
// są w porządku.
import { headers } from "next/headers";
import { createClient } from "@/app/_lib/supabase/server";
import { createSampleOrder } from "@/app/_lib/samples";
import { registerTransaction, trnRequestUrl } from "@/app/_lib/p24";
import type { SampleSelection } from "@/app/_lib/sample-pricing";
import type { ActionResult } from "@/app/_lib/types";

// Wybór przychodzi jako JSON z komponentu klienckiego, więc jego kształt jest
// tak samo niezaufany jak każde inne pole formularza. Bez tej bramki byle co
// wpadłoby do insertu pozycji: `fabric_id` jest kluczem obcym (uuid), a błąd
// dopiero na poziomie bazy kosztowałby klienta rezerwację puli i kompensację.
function parseSelections(raw: unknown): SampleSelection[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SampleSelection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    if (
      typeof e.fabricId !== "string" ||
      typeof e.fabricName !== "string" ||
      typeof e.color !== "string"
    ) {
      return null;
    }
    const fabricId = e.fabricId.trim();
    const color = e.color.trim();
    if (!fabricId || !color) return null;
    out.push({ fabricId, fabricName: e.fabricName.trim(), color });
  }
  return out;
}

export async function submitSampleOrder(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Bramka logowania jest też tutaj, nie tylko w UI: akcję da się wywołać
  // bezpośrednio, a darmowa pula bez tożsamości jest nieograniczona.
  if (!user?.email) {
    return { ok: false, error: "Zamawianie próbek wymaga zalogowania" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("selections") ?? "[]"));
  } catch {
    return { ok: false, error: "Nieprawidłowy wybór próbek" };
  }
  const selections = parseSelections(parsed);
  if (!selections) return { ok: false, error: "Nieprawidłowy wybór próbek" };
  if (selections.length === 0) {
    return { ok: false, error: "Wybierz przynajmniej jedną próbkę" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const street = String(formData.get("street") ?? "").trim();
  const postal = String(formData.get("postal_code") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!name || !street || !postal || !city) {
    return { ok: false, error: "Uzupełnij imię, nazwisko i adres" };
  }

  let created: Awaited<ReturnType<typeof createSampleOrder>>;
  try {
    created = await createSampleOrder({
      userId: user.id,
      // ⚠️ E-MAIL WYŁĄCZNIE Z SESJI. Formularz nie ma pola e-mail i nawet gdyby
      // je przysłał, jest ignorowane: z e-maila powstaje klucz darmowej puli,
      // a normalizacja („jan+a@b@gmail.com" → „jan@gmail.com") pozwoliłaby
      // spalić cudzą pulę na rok.
      email: user.email,
      name,
      phone: String(formData.get("phone") ?? "").trim() || null,
      address: { street, postal_code: postal, city },
      selections,
    });
  } catch (err) {
    // Błąd rezerwacji puli KOŃCZY zamówienie. Kontynuowanie „bez gratisów"
    // oznaczałoby, że klient płaci 45 zł za próbki, które mu się należały.
    // Rezerwacja, jeśli zdążyła przejść, została już zwrócona w createSampleOrder.
    console.error("[probki] tworzenie zamowienia nieudane:", err);
    return { ok: false, error: "Nie udało się złożyć zamówienia. Spróbuj ponownie." };
  }

  // Zamówienie darmowe kończy się tutaj — bramka płatności się nie pojawia.
  if (created.amountTotal <= 0) {
    return { ok: true, data: { orderId: created.orderId, redirectUrl: null } };
  }

  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.mollien.pl";

  try {
    const token = await registerTransaction({
      sessionId: created.orderId,
      // ⚠️ GROSZE. sampleOrderTotal zwraca ZŁOTE — bez tego mnożenia klient
      // zapłaciłby 15 groszy zamiast 15 złotych.
      amount: Math.round(created.amountTotal * 100),
      // Próbki są PLN-only (/de zamrożone flagą DE_ENABLED).
      currency: "PLN",
      description: `Próbki tkanin (${created.paidCount} szt.)`,
      email: user.email,
      country: "PL",
      language: "pl",
      urlReturn: `${origin}/probki/sukces?zamowienie=${created.orderId}`,
      // ⚠️ OSOBNY endpoint (powstaje w Tasku 5). /api/p24/status zakłada
      // sessionId == orders.id i zgubiłby tę płatność, logując „zamówienie
      // nie istnieje". Literówka w tym adresie daje CICHĄ awarię: POST na
      // nieistniejącą ścieżkę pod /api/ zwraca w tym frameworku 200 z HTML-em,
      // więc P24 uzna notyfikację za dostarczoną i nie ponowi.
      urlStatus: `${origin}/api/p24/probki-status`,
    });
    return { ok: true, data: { orderId: created.orderId, redirectUrl: trnRequestUrl(token) } };
  } catch (err) {
    // Zamówienie ISTNIEJE (payment_status = "pending") i widać je w panelu
    // w grupie „nieopłacone" — właścicielka może je anulować, co zwróci pulę.
    console.error("[probki] rejestracja P24 nieudana:", err);
    return {
      ok: false,
      error: "Zamówienie zapisane, ale nie udało się otworzyć płatności. Skontaktuj się z nami.",
    };
  }
}
