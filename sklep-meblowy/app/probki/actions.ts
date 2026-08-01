"use server";

// ⚠️ W pliku z "use server" eksportuj WYŁĄCZNIE async funkcje. `export type`
// wywala się tu pod Turbopackiem runtime'owym ReferenceError (patrz
// reference_turbopack_use_server_export_type). Funkcje pomocnicze bez `export`
// są w porządku.
import { headers } from "next/headers";
import { after } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import {
  notifyAdminNewSampleOrder,
  notifyCustomerSampleOrder,
} from "@/app/_lib/mail/sample-notify";
import { createSampleOrder } from "@/app/_lib/samples";
import { buildSampleP24Params } from "@/app/_lib/sample-p24";
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
    // Maile TYLKO na tej gałęzi. Zamówienie płatne dostaje potwierdzenie
    // dopiero po rozliczeniu notyfikacji P24 (app/api/p24/probki-status) —
    // nie dziękujemy za zamówienie, które klient może porzucić przed bramką.
    // after(): wysyłka jest POST-response, żeby zawieszony Resend nie trzymał
    // klienta na spinnerze. Obie funkcje nigdy nie rzucają, więc `await`
    // w środku jest bezpieczny i druga zawsze dojdzie do skutku.
    after(async () => {
      await notifyCustomerSampleOrder(created.orderId);
      await notifyAdminNewSampleOrder(created.orderId);
    });
    return { ok: true, data: { orderId: created.orderId, redirectUrl: null } };
  }

  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.mollien.pl";

  try {
    // Kwota w groszach, waluta, adresy powrotu i notyfikacji — w czystej,
    // otestowanej funkcji (app/_lib/sample-p24.ts), nie inline: z pliku
    // "use server" nie da się wyeksportować niczego do testu.
    const token = await registerTransaction(
      buildSampleP24Params({
        orderId: created.orderId,
        amountTotal: created.amountTotal,
        paidCount: created.paidCount,
        // ⚠️ Znowu e-mail SESJI, nie z formularza.
        sessionEmail: user.email,
        origin,
      })
    );
    return { ok: true, data: { orderId: created.orderId, redirectUrl: trnRequestUrl(token) } };
  } catch (err) {
    // Zamówienie ISTNIEJE (payment_status = "pending") i widać je w panelu
    // w grupie „nieopłacone" — właścicielka może je anulować, co zwróci pulę.
    console.error("[probki] rejestracja P24 nieudana:", err);
    return {
      ok: false,
      error:
        "Zamówienie zapisane, ale nie udało się otworzyć płatności. Za chwilę pokażemy jego status.",
      // ⚠️ KONTRAKT, NIE OZDOBNIK: `data.orderId` przy `ok: false` znaczy
      // „zamówienie JUŻ POWSTAŁO w bazie i zabrało darmową pulę". Formularz na
      // tej podstawie NIE odblokowuje przycisku, tylko przechodzi na
      // /probki/sukces (SampleForm.tsx). Bez tego kanału klient widziałby zwykły
      // błąd, kliknął „Zamawiam" jeszcze raz i dostał DRUGIE zamówienie — tym
      // razem w całości płatne, 45 zł za te same trzy próbki. Rozpoznawanie tej
      // sytuacji po TREŚCI komunikatu byłoby dopasowaniem stringa, nie kontraktem.
      data: { orderId: created.orderId },
    };
  }
}
