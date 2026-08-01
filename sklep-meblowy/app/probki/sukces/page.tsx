import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/app/_lib/supabase/server";
import { getSampleOrderById } from "@/app/_lib/samples";
import { getContactInfo } from "@/app/_lib/contact-server";
import { formatPrice } from "@/app/_lib/format";

// Strona powrotu po zamówieniu próbek (urlReturn z app/_lib/sample-p24.ts).
// PL-only jak całe /probki: /de jest zamrożone flagą DE_ENABLED.
//
// ⚠️ NIE UFA POWROTOWI Z BRAMKI. Adres jest zwykłym GET-em, który klient może
// otworzyć kiedy chce (i który P24 potrafi otworzyć ZANIM dojdzie notyfikacja),
// więc o stanie płatności rozstrzyga wyłącznie `payment_status` z bazy.
export const metadata: Metadata = {
  title: "Zamówienie próbek przyjęte",
  // Adres niesie identyfikator konkretnego zamówienia — nie ma czego indeksować.
  robots: { index: false, follow: false },
};

// `?zamowienie=` może przyjść jako tablica (`?zamowienie=a&zamowienie=b`).
function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SampleSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ zamowienie?: string | string[] }>;
}) {
  const orderId = firstParam((await searchParams).zamowienie);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ⚠️ POWRÓT Z BRAMKI BEZ SESJI TO NORMALNA SYTUACJA, nie próba podglądania
  // cudzego zamówienia: BLIK i aplikacje bankowe potrafią otworzyć `urlReturn`
  // we WŁASNEJ przeglądarce (in-app browser banku), w której nie ma ciasteczek
  // Supabase. Klient, który przed sekundą zapłacił, nie może tam zobaczyć
  // „nie znaleźliśmy tego zamówienia". Nie czytamy zamówienia (nie ma czym
  // potwierdzić własności), więc nie pokazujemy ŻADNYCH szczegółów — tylko
  // potwierdzenie przyjęcia i logowanie po resztę. Ten sam wzorzec `next=`
  // co bramka logowania na /probki.
  if (orderId && !user) {
    const back = `/probki/sukces?zamowienie=${encodeURIComponent(orderId)}`;
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
          Dziękujemy
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-[var(--fg)] mb-6">
          Zamówienie przyjęte
        </h1>
        <p className="text-[var(--muted)] mb-10 leading-relaxed">
          Zaloguj się, żeby zobaczyć szczegóły zamówienia i status płatności. Jeśli
          wróciłeś tu z aplikacji banku, ta przeglądarka może nie znać Twojej sesji —
          zamówienia to nie dotyczy, jest zapisane.
        </p>
        <Link
          href={`/logowanie?next=${encodeURIComponent(back)}`}
          className="inline-flex px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          Zaloguj się
        </Link>
      </div>
    );
  }

  // ⚠️ WŁASNOŚĆ SPRAWDZAMY SAMI. getSampleOrderById czyta service_rolem (RLS na
  // sample_orders go nie dotyczy), więc bez tego porównania wystarczyłoby zgadnąć
  // uuid, żeby zobaczyć czyjeś imię, adres i telefon. Cudze zamówienie i brak
  // parametru dają ten sam komunikat — bez zdradzania, czy takie zamówienie istnieje.
  const fetched = orderId && user ? await getSampleOrderById(orderId) : null;
  const order = fetched && user && fetched.user_id === user.id ? fetched : null;

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-[var(--fg)] mb-6">
          Nie znaleźliśmy tego zamówienia
        </h1>
        <p className="text-[var(--muted)] mb-10 leading-relaxed">
          Ten link nie pasuje do żadnego zamówienia na Twoim koncie. Jeśli właśnie
          zamawiałeś próbki, sprawdź, czy jesteś zalogowany na tym samym koncie, na
          którym składałeś zamówienie.
        </p>
        <Link
          href="/probki"
          className="inline-flex px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          Wróć do wzornika
        </Link>
      </div>
    );
  }

  // Trzy stany płatności z migracji 67. "none" = zamówienie w całości darmowe
  // (bramka się nie pojawiła), "paid" = notyfikacja P24 już doszła i została
  // zweryfikowana, "pending" = czekamy — albo klient jest przed bramką/w trakcie,
  // albo rejestracja płatności padła i zamówienie czeka bez transakcji.
  const pending = order.payment_status === "pending";
  const contact = pending ? await getContactInfo() : null;
  const shortId = order.id.slice(0, 8).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto px-6 py-20">
      <div className="text-center">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
          {pending ? "Zamówienie przyjęte" : "Dziękujemy"}
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-[var(--fg)] mb-6">
          {pending ? "Czekamy na potwierdzenie płatności" : "Zamówienie przyjęte"}
        </h1>
        {pending ? (
          // ⚠️ Ten sam ekran ogląda klient, któremu w ogóle nie otworzyła się
          // bramka (padła rejestracja transakcji, patrz actions.ts). Dlatego
          // komunikat nazywa rzecz po imieniu i mówi, co teraz zrobić — nie
          // „spróbuj złożyć zamówienie jeszcze raz", bo drugie zamówienie będzie
          // już bez gratisów.
          <div className="text-[var(--muted)] leading-relaxed mb-10 flex flex-col gap-3">
            <p>
              Zamówienie <strong className="text-[var(--fg)]">{shortId}</strong> jest
              zapisane, ale nie mamy jeszcze potwierdzenia płatności{" "}
              {formatPrice(Number(order.amount_total), "pl")}. Potwierdzenie z banku
              potrafi iść kilka minut —{" "}
              <a href={`/probki/sukces?zamowienie=${order.id}`} className="underline">
                odśwież tę stronę
              </a>{" "}
              za chwilę.
            </p>
            <p>
              Jeśli płatność się nie rozpoczęła albo została przerwana,{" "}
              <strong className="text-[var(--fg)]">nie składaj zamówienia drugi raz</strong>{" "}
              — to zamówienie czeka i darmowe próbki są już w nim zarezerwowane.
              Napisz do nas na{" "}
              <a href={`mailto:${contact?.email ?? ""}`} className="underline">
                {contact?.email}
              </a>{" "}
              {contact?.phone ? <>lub zadzwoń ({contact.phone}) </> : null}i podaj numer{" "}
              {shortId} — dokończymy płatność albo anulujemy zamówienie i oddamy
              darmowe sztuki do puli.
            </p>
          </div>
        ) : (
          <p className="text-[var(--muted)] leading-relaxed mb-10">
            Dziękujemy — zamówienie <strong className="text-[var(--fg)]">{shortId}</strong>{" "}
            jest przyjęte. Próbki wyślemy pocztą w ciągu kilku dni roboczych.
            {order.payment_status === "paid" && " Płatność została potwierdzona."}
          </p>
        )}
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 mb-10">
        <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-4">
          Zamówione próbki
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex justify-between gap-4 border-b border-[var(--border)] pb-2 last:border-0 last:pb-0"
            >
              <span className="text-[var(--fg)]">
                {item.fabric_name} {item.color}
              </span>
              <span
                className={
                  item.is_free
                    ? "text-emerald-700 dark:text-emerald-400 font-semibold shrink-0"
                    : "text-[var(--muted)] shrink-0"
                }
              >
                {item.is_free ? "gratis" : formatPrice(Number(item.unit_price), "pl")}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between mt-4 pt-4 border-t border-[var(--border)] text-sm font-bold">
          <span className="text-[var(--fg)]">Razem (dostawa 0 zł)</span>
          <span className="text-[var(--fg)]">
            {formatPrice(Number(order.amount_total), "pl")}
          </span>
        </div>
      </div>

      <div className="text-center">
        <Link
          href="/sklep"
          className="inline-flex px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          Kontynuuj zakupy
        </Link>
      </div>
    </div>
  );
}
