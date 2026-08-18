"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReviewStatus, setReviewHomepageExcluded } from "./actions";
import type { ReviewForModeration } from "@/app/_lib/reviews-admin";

export default function OpinieList({
  oczekujace,
  zatwierdzone,
  odrzucone,
}: {
  oczekujace: ReviewForModeration[];
  zatwierdzone: ReviewForModeration[];
  odrzucone: ReviewForModeration[];
}) {
  const [blad, setBlad] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-12">
      {blad && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
          {blad}
        </div>
      )}

      <Sekcja tytul={`Oczekujące (${oczekujace.length})`}>
        {/* ⚠️ Wymóg ze specyfikacji, sekcja „Zgodność z przepisami": to
            ostrzeżenie ma stać tam, gdzie Julia klika, a nie w dokumentacji,
            której nikt nie czyta. NIE parafrazować, NIE przenosić. */}
        <p className="text-xs text-[var(--muted)] mb-4 max-w-2xl">
          Odrzucaj spam, obelgi i treści niezwiązane z produktem.{" "}
          <strong className="text-[var(--fg)]">
            Nie odrzucaj opinii tylko dlatego, że ocena jest niska
          </strong>{" "}
          — pokazywanie wyłącznie pochwał przy ukrywaniu krytyki jest niezgodne
          z przepisami o opiniach konsumenckich.
        </p>
        {oczekujace.length === 0 ? (
          <Pusto tekst="Nic nie czeka na sprawdzenie." />
        ) : (
          oczekujace.map((o) => (
            <Wiersz key={o.id} opinia={o} onBlad={setBlad} pokazDecyzje />
          ))
        )}
      </Sekcja>

      <Sekcja tytul={`Opublikowane (${zatwierdzone.length})`}>
        {zatwierdzone.length === 0 ? (
          <Pusto tekst="Nie ma jeszcze żadnej opublikowanej opinii." />
        ) : (
          zatwierdzone.map((o) => (
            <Wiersz key={o.id} opinia={o} onBlad={setBlad} pokazWykluczenie />
          ))
        )}
      </Sekcja>

      <Sekcja tytul={`Odrzucone (${odrzucone.length})`}>
        {odrzucone.length === 0 ? (
          <Pusto tekst="Nic nie zostało odrzucone." />
        ) : (
          odrzucone.map((o) => <Wiersz key={o.id} opinia={o} onBlad={setBlad} pokazPrzywroc />)
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
  pokazDecyzje = false,
  pokazWykluczenie = false,
  pokazPrzywroc = false,
}: {
  opinia: ReviewForModeration;
  onBlad: (b: string | null) => void;
  pokazDecyzje?: boolean;
  pokazWykluczenie?: boolean;
  pokazPrzywroc?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function zmien(status: "approved" | "rejected" | "pending") {
    onBlad(null);
    startTransition(async () => {
      const wynik = await setReviewStatus(opinia.id, status);
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
        <span
          className={
            odGoscia
              ? "text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              : "text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[var(--border)] text-[var(--muted)]"
          }
        >
          {odGoscia ? "gość" : "konto"}
        </span>
      </div>

      {opinia.comment && (
        <p className="whitespace-pre-wrap text-sm text-[var(--fg)] leading-relaxed">
          {opinia.comment}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {pokazDecyzje && (
          <>
            <button
              type="button"
              onClick={() => zmien("approved")}
              disabled={pending}
              className="px-4 py-2 bg-[var(--color-navy)] text-white text-xs font-semibold uppercase tracking-widest rounded-full disabled:opacity-40"
            >
              Zatwierdź
            </button>
            <button
              type="button"
              onClick={() => zmien("rejected")}
              disabled={pending}
              className="text-xs font-semibold uppercase tracking-widest text-red-600 hover:text-red-700 disabled:opacity-40"
            >
              Odrzuć
            </button>
          </>
        )}
        {pokazPrzywroc && (
          <button
            type="button"
            onClick={() => zmien("pending")}
            disabled={pending}
            className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40"
          >
            Przywróć do sprawdzenia
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
