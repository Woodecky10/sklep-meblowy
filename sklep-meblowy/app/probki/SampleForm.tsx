"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { submitSampleOrder } from "./actions";
import {
  SAMPLE_FREE_LIMIT,
  SAMPLE_UNIT_PRICE,
  sampleOrderTotal,
  splitFreePaid,
  type SampleSelection,
} from "@/app/_lib/sample-pricing";
import {
  buildSampleCatalog,
  preselectSamples,
  sampleSelectionKey,
  toggleSampleSelection,
  type SampleFabric,
  type SampleGroup,
} from "@/app/_lib/sample-catalog";
import { formatPrice } from "@/app/_lib/format";
import { pluralForm } from "@/app/_lib/plural";

// Wzornik + formularz zamówienia próbek (spec 2026-08-01).
//
// PL-only: /de jest zamrożone flagą DE_ENABLED, więc teksty są wpisane wprost
// (bez słownika) i kwoty zawsze w złotych (bez gałęzi EUR).
//
// ⚠️ Formularz idzie przez `onSubmit`, NIE przez `<form action={...}>`:
// React 19 po akcji przekazanej w `action=` sam resetuje formularz — w tym
// repo wywołało to już produkcyjnego buga („kategoria się nie zapisuje", PR #83).

const FREE_NOTE = "pula odnawia się 12 miesięcy od pierwszego zamówienia";

function samplesWord(n: number): string {
  return pluralForm(n, { one: "próbkę", few: "próbki", many: "próbek" });
}

export default function SampleForm({
  fabrics,
  groups,
  quotaLeft,
  preselectedSlug,
  defaultName,
  defaultStreet,
  defaultPostalCode,
  defaultCity,
  defaultPhone,
}: {
  fabrics: SampleFabric[];
  groups: SampleGroup[];
  quotaLeft: number;
  preselectedSlug: string | null;
  defaultName: string;
  defaultStreet: string;
  defaultPostalCode: string;
  defaultCity: string;
  defaultPhone: string;
}) {
  const router = useRouter();
  // Preselekcja z `?tkanina=` liczona przy pierwszym renderze (lazy initializer),
  // a nie w useEffect — inaczej klient zobaczyłby przez moment pusty wybór.
  const [selections, setSelections] = useState<SampleSelection[]>(() =>
    preselectSamples(fabrics, preselectedSlug)
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // ⚠️ OCHRONA PIENIĘDZY KLIENTA. Gdy zamówienie POWSTAŁO, NIE wracamy do stanu
  // „można klikać": przeglądarka jest już w drodze do bramki, na stronę
  // podziękowania albo na status, a każde kolejne wysłanie to OSOBNE zamówienie
  // — pierwsze zabiera całą darmową pulę, drugie jest w całości płatne (45 zł za
  // te same trzy próbki). Warstwa danych tego nie wyłapie: dla niej to dwa
  // poprawne zamówienia. Wartość mówi też, co robimy — inaczej przycisk
  // obiecywałby płatność w chwili, gdy właśnie ona padła.
  const [leaving, setLeaving] = useState<"payment" | "order" | "status" | null>(null);
  // Wysyłka rzuciła wyjątkiem, więc NIE WIEMY, czy zamówienie powstało. Przycisk
  // zostaje zablokowany do świadomego potwierdzenia (patrz catch niżej).
  const [needsConfirm, setNeedsConfirm] = useState(false);
  // Ref, bo `isPending` staje się widoczne dopiero po re-renderze — dwa szybkie
  // kliknięcia (albo Enter + klik) mieszczą się przed nim.
  const busyRef = useRef(false);

  const busy = isPending || leaving !== null || needsConfirm;
  const sections = useMemo(
    () => buildSampleCatalog(fabrics, groups, query),
    [fabrics, groups, query]
  );
  const selectedKeys = useMemo(
    () => new Set(selections.map((s) => sampleSelectionKey(s.fabricId, s.color))),
    [selections]
  );

  // Podsumowanie liczone WYŁĄCZNIE przez moduł wyceny — te same funkcje, których
  // używa warstwa danych. `quotaLeft` jest poglądowy: rozstrzyga baza przy
  // składaniu zamówienia (RPC pod blokadą wiersza), więc przy karcie otwartej
  // od godziny kwota może wyjść wyższa niż tutaj.
  const { free, paid } = splitFreePaid(selections.length, quotaLeft);
  const total = sampleOrderTotal(paid);

  function toggleColor(fabric: SampleFabric, color: string) {
    if (busy) return;
    setSelections((prev) =>
      toggleSampleSelection(prev, {
        fabricId: fabric.id,
        fabricName: fabric.name,
        color,
      })
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Twarda blokada przed re-renderem (patrz komentarz przy busyRef).
    if (busyRef.current) return;
    if (selections.length === 0) {
      setError("Wybierz przynajmniej jedną próbkę.");
      return;
    }

    // FormData budujemy synchronicznie: po `await` `e.currentTarget` jest już null.
    const formData = new FormData(e.currentTarget);
    formData.set("selections", JSON.stringify(selections));

    busyRef.current = true;
    setError(null);

    startTransition(async () => {
      // try/catch, bo `submitSampleOrder` zwraca błędy DZIEDZINOWE jako
      // { ok: false }, ale zerwane połączenie albo 500 z serwera to wyjątek.
      // Bez tego rzut leci przez transition do error boundary: klient traci
      // cały wybór i nie widzi żadnego komunikatu przy przycisku, a `busyRef`
      // zostaje na zawsze podniesiony (formularz zablokowany do F5).
      try {
        const res = await submitSampleOrder(formData);
        // `data.orderId` jest po OBU stronach kontraktu akcji (app/probki/actions.ts):
        // przy `ok: false` znaczy „zamówienie mimo wszystko powstało".
        const data = (res.data ?? {}) as { orderId?: string; redirectUrl?: string | null };

        if (res.ok) {
          // Przycisk zostaje zablokowany na zawsze — nawigacja trwa, a klient
          // widzący znów aktywny przycisk kliknąłby ponownie.
          setLeaving(data.redirectUrl ? "payment" : "order");
          if (data.redirectUrl) {
            window.location.href = data.redirectUrl;
            return;
          }
          router.push(`/probki/sukces?zamowienie=${encodeURIComponent(data.orderId ?? "")}`);
          return;
        }

        // ⚠️ BŁĄD Z IDENTYFIKATOREM ZAMÓWIENIA (padła rejestracja płatności, ale
        // wiersz w bazie i rezerwacja darmowej puli JUŻ SĄ) to nie jest błąd do
        // powtórzenia — powtórzenie daje drugie zamówienie, tym razem bez
        // gratisów. Nie odblokowujemy przycisku, tylko pokazujemy prawdziwy stan
        // rzeczy: zamówienie przyjęte, płatność niepotwierdzona.
        if (data.orderId) {
          setLeaving("status");
          router.push(`/probki/sukces?zamowienie=${encodeURIComponent(data.orderId)}`);
          return;
        }

        // Komunikat akcji pokazujemy dosłownie — rozróżnia brak wyboru, brak
        // adresu i awarię płatności, a własny ogólnik zabrałby tę informację.
        busyRef.current = false;
        setError(res.error);
      } catch (err) {
        console.error("[probki] wysylka zamowienia nieudana:", err);
        // ⚠️ TA SAMA KLASA BŁĘDU, CO WYŻEJ, tylko bez odpowiedzi: rzut po
        // dotarciu żądania (timeout, zerwana odpowiedź) mógł zostawić w bazie
        // gotowe zamówienie, a my się o tym nie dowiemy. Automatyczne
        // odblokowanie przycisku zamieniałoby to w duplikat na jedno kliknięcie,
        // więc ponowienie musi być ŚWIADOME: przycisk zostaje zablokowany do
        // czasu, aż klient potwierdzi je osobnym przyciskiem w komunikacie.
        busyRef.current = false;
        setNeedsConfirm(true);
        setError(
          "Nie udało się potwierdzić wysyłki zamówienia — sprawdź połączenie. " +
            "Nie wiemy, czy zdążyło się zapisać, a drugie zamówienie nie dostanie już darmowych próbek."
        );
      }
    });
  }

  const buttonLabel =
    leaving === "payment"
      ? "Przekierowuję do płatności…"
      : leaving === "order"
        ? "Zapisuję zamówienie…"
        : leaving === "status"
          ? "Otwieram status zamówienia…"
          : isPending
            ? "Wysyłam…"
            : "Zamawiam";

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-8">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Próbki tkanin
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)] mb-3">
          Zamów próbki tkanin
        </h1>
        <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
          Wybierz kolory, które chcesz zobaczyć na żywo — wycinki wysyłamy pocztą.
          Pierwsze {SAMPLE_FREE_LIMIT} próbki są gratis, każda kolejna kosztuje{" "}
          {formatPrice(SAMPLE_UNIT_PRICE, "pl")}. Dostawa zawsze za 0 zł.
        </p>
      </div>

      {/* ⚠️ Stan puli MUSI być widoczny przed wyborem: klient z wyczerpaną pulą
          zaznaczyłby trzy próbki w przekonaniu, że są gratis, i poczułby się
          oszukany dopiero na bramce płatności. */}
      <div
        className={`mb-8 rounded-2xl border px-5 py-4 text-sm leading-relaxed ${
          quotaLeft > 0
            ? "border-[var(--color-gold)] bg-[var(--card-bg)] text-[var(--fg)]"
            : "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700"
        }`}
      >
        {quotaLeft > 0 ? (
          <>
            <strong>
              Masz jeszcze {quotaLeft} z {SAMPLE_FREE_LIMIT} darmowych próbek
            </strong>{" "}
            ({FREE_NOTE}).
          </>
        ) : (
          <>
            <strong>Darmowa pula jest wyczerpana</strong> — każda próbka w tym zamówieniu
            kosztuje {formatPrice(SAMPLE_UNIT_PRICE, "pl")} ({FREE_NOTE}).
          </>
        )}
        <span className="block mt-1 text-xs text-[var(--muted)]">
          Ostateczną liczbę darmowych sztuk potwierdzamy przy składaniu zamówienia.
        </span>
      </div>

      {/* Cała treść jest w jednym <form>, bo pasek podsumowania (sticky
          bottom-0) przykleja się tylko w obrębie SWOJEGO rodzica — gdyby
          formularz zaczynał się dopiero przy adresie, pasek zniknąłby na czas
          przewijania wzornika, czyli dokładnie wtedy, gdy jest potrzebny. */}
      <form onSubmit={onSubmit}>
        <label className="block mb-8">
          <span className="block text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Szukaj tkaniny
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // ⚠️ Enter w wyszukiwarce NIE MOŻE wysłać formularza. HTML robi to
            // sam (implicit submission), a tu kosztowałoby to zamówienie:
            // przy preselekcji z `?tkanina=` i adresie z profilu wszystkie
            // wymagane pola są już wypełnione, więc nic by nie zaprotestowało
            // — klient szukający tkaniny wylądowałby na bramce płatności.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="np. monolith 84"
            className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
          />
        </label>

        {sections.length === 0 ? (
          <p className="mb-10 text-sm text-[var(--muted)]">
            {fabrics.length === 0
              ? "Wzornik jest chwilowo niedostępny — napisz do nas, a wyślemy próbki ręcznie."
              : "Żadna tkanina nie pasuje do wyszukiwania."}
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.id} className="mb-12">
              <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-6">
                {section.name}
              </h2>
              <div className="flex flex-col gap-8">
                {section.fabrics.map((fabric) => (
                  <div key={fabric.id}>
                    <h3 className="font-sans text-sm font-semibold uppercase tracking-widest text-[var(--fg)] mb-3">
                      {fabric.name}
                    </h3>
                    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-3">
                      {fabric.colors.map((color) => {
                        const selected = selectedKeys.has(
                          sampleSelectionKey(fabric.id, color)
                        );
                        const img = fabric.images[color];
                        return (
                          <button
                            // type="button" jest krytyczne: bez niego kafelek
                            // wysyłałby formularz zamówienia.
                            type="button"
                            key={color}
                            onClick={() => toggleColor(fabric, color)}
                            aria-pressed={selected}
                            aria-label={`${fabric.name} ${color}`}
                            className={`group flex flex-col items-center gap-1.5 rounded-xl p-1 transition-all ${
                              selected
                                ? "ring-2 ring-[var(--color-gold)]"
                                : "hover:ring-2 hover:ring-[var(--color-gold)]/40"
                            } ${busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                          >
                            {/* Kontener MUSI być blokowy — aspect-* na inline
                                <span> nie wymusza wymiaru i obrazek wychodzi
                                poza kafelek (patrz PR #79). */}
                            <span className="relative block w-full aspect-square rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
                              {img ? (
                                // Siatka: 3 kolumny do 640px, 5 do 768px, dalej 8.
                                <Image
                                  src={img}
                                  alt=""
                                  fill
                                  sizes="(max-width: 640px) 33vw, (max-width: 768px) 20vw, 120px"
                                  className="object-cover"
                                />
                              ) : (
                                <span className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
                                  {color}
                                </span>
                              )}
                              {selected && (
                                <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--color-gold)] text-white text-xs flex items-center justify-center shadow">
                                  ✓
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-[var(--muted)]">{color}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}

        {selections.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-4">
              Twój wybór
            </h2>
            <ul className="flex flex-wrap gap-2">
              {selections.map((s, index) => (
                <li key={sampleSelectionKey(s.fabricId, s.color)}>
                  <button
                    type="button"
                    onClick={() => setSelections((prev) => toggleSampleSelection(prev, s))}
                    disabled={busy}
                    aria-label={`Usuń próbkę ${s.fabricName} ${s.color}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--card-bg)] text-sm text-[var(--fg)] hover:border-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>
                      {s.fabricName} {s.color}
                    </span>
                    {/* Które sztuki są darmowe, wyznacza KOLEJNOŚĆ wyboru —
                        pierwsze `free` pozycji. Klient nie wskazuje ich sam. */}
                    <span
                      className={
                        index < free
                          ? "text-emerald-700 dark:text-emerald-400 text-xs font-semibold"
                          : "text-[var(--muted)] text-xs"
                      }
                    >
                      {index < free ? "gratis" : formatPrice(SAMPLE_UNIT_PRICE, "pl")}
                    </span>
                    <span aria-hidden="true" className="text-[var(--muted)]">
                      ×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-10 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-2">
            Adres wysyłki
          </h2>
          {/* Bez wyboru sposobu dostawy — jest jedna i darmowa (koperta pocztą). */}
          <p className="text-sm text-[var(--muted)] mb-6">
            Próbki wysyłamy pocztą — dostawa jest darmowa niezależnie od liczby sztuk.
          </p>
          <div className="flex flex-col gap-4">
            <Field label="Imię i nazwisko" name="name" defaultValue={defaultName} required />
            <Field label="Ulica i numer" name="street" defaultValue={defaultStreet} required />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Kod pocztowy"
                name="postal_code"
                defaultValue={defaultPostalCode}
                placeholder="00-000"
                required
              />
              <Field label="Miasto" name="city" defaultValue={defaultCity} required />
            </div>
            <Field
              label="Telefon (opcjonalnie)"
              name="phone"
              type="tel"
              defaultValue={defaultPhone}
              placeholder="+48 600 000 000"
            />
          </div>
          {/* ⚠️ Świadomie BEZ pola e-mail: adres bierzemy z sesji. Pole
              w formularzu sugerowałoby, że da się je zmienić, a akcja i tak je
              ignoruje — z e-maila sesji powstaje klucz darmowej puli. */}
        </section>

        <div className="sticky bottom-0 z-40 -mx-6 px-6 py-4 bg-[var(--bg)]/95 backdrop-blur border-t border-[var(--border)]">
          {error && (
            <div
              role="alert"
              className="mb-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm"
            >
              {error}
              {/* Świadome ponowienie po rzucie: jedno dodatkowe kliknięcie
                  zamiast automatycznego odblokowania przycisku (patrz catch).
                  ⚠️ Klient MUSI dostać tu podpowiedź, co zrobić ZAMIAST klikania
                  — sam nie ma jak sprawdzić, czy zamówienie powstało (lista
                  zamówień próbek jest tylko w panelu właścicielki). Bez tego
                  dodana blokada jest kosmetyczna: i tak kliknie „ponów". */}
              {needsConfirm && (
                <>
                  <p className="mt-2">
                    Nie masz jak sprawdzić tego samodzielnie — napisz do nas przez{" "}
                    <Link href="/kontakt" className="underline font-semibold">
                      stronę kontaktu
                    </Link>{" "}
                    (podaj tkaniny i kolory, które wybrałeś). Sprawdzimy, czy
                    zamówienie się zapisało, i dokończymy je bez utraty darmowych
                    próbek. Jeśli wolisz spróbować sam — odblokuj przycisk:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNeedsConfirm(false);
                      setError(null);
                    }}
                    className="block mt-3 px-4 py-2 rounded-full border border-current font-sans text-xs uppercase tracking-widest hover:opacity-80 transition-opacity"
                  >
                    Odblokuj i spróbuj ponownie
                  </button>
                </>
              )}
            </div>
          )}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <p aria-live="polite" className="text-sm text-[var(--fg)]">
              {selections.length === 0 ? (
                <span className="text-[var(--muted)]">
                  Nie wybrano jeszcze żadnej próbki.
                </span>
              ) : (
                <>
                  Wybrano {selections.length} {samplesWord(selections.length)} —{" "}
                  {free > 0 && <>{free} gratis</>}
                  {free > 0 && paid > 0 && " + "}
                  {paid > 0 && (
                    <>
                      {paid} × {formatPrice(SAMPLE_UNIT_PRICE, "pl")}
                    </>
                  )}
                  {" = "}
                  <strong className="text-[var(--fg)]">{formatPrice(total, "pl")}</strong>
                  {" · dostawa 0 zł"}
                </>
              )}
            </p>
            <button
              type="submit"
              disabled={busy || selections.length === 0}
              aria-busy={busy}
              className="shrink-0 px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
      />
    </label>
  );
}
