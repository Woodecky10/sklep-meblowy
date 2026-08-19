"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  oznaczPrzejrzana,
  usunZWitryny,
  przywrocNaWitryne,
  setReviewHomepageExcluded,
  type ActionResult,
} from "./actions";
import type { ReviewForModeration } from "@/app/_lib/reviews-admin";

export default function OpinieList({
  nowe,
  opublikowane,
  usuniete,
}: {
  nowe: ReviewForModeration[];
  opublikowane: ReviewForModeration[];
  usuniete: ReviewForModeration[];
}) {
  const [blad, setBlad] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-12">
      {blad && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
          {blad}
        </div>
      )}

      <Sekcja tytul={`Nowe — do przejrzenia (${nowe.length})`}>
        {/* ⚠️ Wymóg ze specyfikacji, sekcja „Zgodność z przepisami": to
            ostrzeżenie ma stać tam, gdzie Julia klika, a nie w dokumentacji,
            której nikt nie czyta. NIE parafrazować, NIE przenosić. */}
        <p className="text-xs text-[var(--muted)] mb-4 max-w-2xl">
          Zdejmuj ze strony spam, obelgi i treści niezwiązane z produktem.{" "}
          <strong className="text-[var(--fg)]">
            Nie zdejmuj opinii tylko dlatego, że ocena jest niska, i nie
            zmieniaj jej treści
          </strong>{" "}
          — pokazywanie wyłącznie pochwał przy ukrywaniu krytyki jest niezgodne
          z przepisami o opiniach konsumenckich.
        </p>
        {nowe.length === 0 ? (
          <Pusto tekst="Nic nowego." />
        ) : (
          nowe.map((o) => (
            <Wiersz
              key={o.id}
              opinia={o}
              onBlad={setBlad}
              pokazPrzejrzyj
              pokazZdejmij
              pokazWykluczenie
              // Kubełek „nowe" łapie też legacy wiersze `pending` sprzed
              // migracji 78 (patrz reviewBucket w reviews-moderation.ts) —
              // te NIE są publiczne, bo reguła publicznego odczytu przepuszcza
              // wyłącznie `approved`. Plakietka musi więc patrzeć na status
              // TEGO wiersza, nie na samą przynależność do sekcji „nowe" —
              // inaczej kłamie dokładnie wtedy, gdy Julia najbardziej jej
              // ufa (świeży, jeszcze nieprzejrzany wpis).
              widocznaNaStronie={o.status === "approved"}
            />
          ))
        )}
      </Sekcja>

      <Sekcja tytul={`Opublikowane (${opublikowane.length})`}>
        {opublikowane.length === 0 ? (
          <Pusto tekst="Nie ma jeszcze żadnej opublikowanej opinii." />
        ) : (
          opublikowane.map((o) => (
            <Wiersz key={o.id} opinia={o} onBlad={setBlad} pokazZdejmij pokazWykluczenie />
          ))
        )}
      </Sekcja>

      <Sekcja tytul={`Zdjęte ze strony (${usuniete.length})`}>
        {usuniete.length === 0 ? (
          <Pusto tekst="Nic nie zostało zdjęte." />
        ) : (
          usuniete.map((o) => <Wiersz key={o.id} opinia={o} onBlad={setBlad} pokazPrzywroc />)
        )}
      </Sekcja>
    </div>
  );
}

function Sekcja({ tytul, children }: { tytul: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-3">{tytul}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Pusto({ tekst }: { tekst: string }) {
  return <p className="text-sm text-[var(--muted)]">{tekst}</p>;
}

function Wiersz({
  opinia,
  onBlad,
  pokazPrzejrzyj = false,
  pokazZdejmij = false,
  pokazWykluczenie = false,
  pokazPrzywroc = false,
  widocznaNaStronie = false,
}: {
  opinia: ReviewForModeration;
  onBlad: (b: string | null) => void;
  pokazPrzejrzyj?: boolean;
  pokazZdejmij?: boolean;
  pokazWykluczenie?: boolean;
  pokazPrzywroc?: boolean;
  widocznaNaStronie?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function wykonaj(akcja: (id: string) => Promise<ActionResult>) {
    onBlad(null);
    startTransition(async () => {
      const wynik = await akcja(opinia.id);
      if (!wynik.ok) onBlad(wynik.error);
      else router.refresh();
    });
  }

  function przelaczWykluczenie(nowe: boolean) {
    onBlad(null);
    startTransition(async () => {
      const wynik = await setReviewHomepageExcluded(opinia.id, nowe);
      if (!wynik.ok) onBlad(wynik.error);
      else router.refresh();
    });
  }

  // user_id === null znaczy „gość" — patrz warunek product_reviews_autor_jeden.
  const odGoscia = opinia.user_id === null;

  return (
    <article className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold text-[var(--fg)]">
            {"★".repeat(opinia.rating)}
            <span className="text-[var(--muted)]">{"★".repeat(5 - opinia.rating)}</span>
            <span className="ml-3 font-normal text-sm">
              {opinia.author_name ?? "Klient"}
            </span>
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">
            {opinia.product_name ?? "produkt usunięty"} ·{" "}
            {new Date(opinia.created_at).toLocaleDateString("pl-PL")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              odGoscia
                ? "text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                : "text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[var(--border)] text-[var(--muted)]"
            }
          >
            {odGoscia ? "gość" : "konto"}
          </span>
          {widocznaNaStronie && (
            <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              widoczna na stronie
            </span>
          )}
        </div>
      </div>

      {opinia.comment && (
        <p className="whitespace-pre-wrap text-sm text-[var(--fg)] leading-relaxed">
          {opinia.comment}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {pokazPrzejrzyj && (
          <button
            type="button"
            onClick={() => wykonaj(oznaczPrzejrzana)}
            disabled={pending}
            className="px-4 py-2 bg-[var(--color-navy)] text-white text-xs font-semibold uppercase tracking-widest rounded-full disabled:opacity-40"
          >
            Przejrzane
          </button>
        )}
        {pokazZdejmij && (
          <button
            type="button"
            onClick={() => wykonaj(usunZWitryny)}
            disabled={pending}
            className="text-xs font-semibold uppercase tracking-widest text-red-600 hover:text-red-700 disabled:opacity-40"
          >
            Zdejmij ze strony
          </button>
        )}
        {pokazPrzywroc && (
          <button
            type="button"
            onClick={() => wykonaj(przywrocNaWitryne)}
            disabled={pending}
            className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40"
          >
            Przywróć
          </button>
        )}
        {pokazWykluczenie && (
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={opinia.homepage_excluded}
              disabled={pending}
              onChange={(e) => przelaczWykluczenie(e.target.checked)}
            />
            nie pokazuj na stronie głównej
          </label>
        )}
      </div>
    </article>
  );
}
