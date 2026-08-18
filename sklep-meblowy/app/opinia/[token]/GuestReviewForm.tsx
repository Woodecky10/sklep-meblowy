"use client";

import { useState, useTransition } from "react";
import StarInput from "@/app/_components/ui/StarInput";
import { submitGuestReview } from "./actions";

export default function GuestReviewForm({
  token,
  productName,
  domyslneImie,
  domyslnyEmail,
}: {
  token: string;
  productName: string;
  domyslneImie: string;
  domyslnyEmail: string;
}) {
  const [rating, setRating] = useState(0);
  const [tresc, setTresc] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [wyslane, setWyslane] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBlad(null);
    const formData = new FormData(e.currentTarget);
    // StarInput trzyma ocenę w stanie Reacta, nie w polu formularza.
    formData.set("rating", String(rating));
    startTransition(async () => {
      const wynik = await submitGuestReview(formData);
      if (!wynik.ok) setBlad(wynik.error);
      else setWyslane(true);
    });
  }

  if (wyslane) {
    return (
      <section className="max-w-2xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-3">Dziękujemy!</h1>
        <p className="text-[var(--muted)]">
          Opinia pojawi się na stronie po sprawdzeniu przez obsługę sklepu.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-2">
        Jak sprawdza się {productName}?
      </h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Twoja opinia pomaga innym wybrać mebel, którego nie mogą wcześniej zobaczyć na żywo.
      </p>

      <form
        onSubmit={onSubmit}
        className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5"
      >
        <input type="hidden" name="token" value={token} />

        <div>
          <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Ocena
          </p>
          <StarInput value={rating} onChange={setRating} />
        </div>

        <div>
          <label
            htmlFor="opinia-imie"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2 block"
          >
            Imię
          </label>
          <input
            id="opinia-imie"
            name="imie"
            defaultValue={domyslneImie}
            required
            maxLength={80}
            className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </div>

        <div>
          <label
            htmlFor="opinia-email"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2 block"
          >
            Adres e-mail
          </label>
          <input
            id="opinia-email"
            name="email"
            type="email"
            defaultValue={domyslnyEmail}
            required
            maxLength={200}
            className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </div>

        <div>
          <label
            htmlFor="opinia-tresc"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2 block"
          >
            Opinia
          </label>
          <textarea
            id="opinia-tresc"
            name="tresc"
            value={tresc}
            onChange={(e) => setTresc(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Jak mebel sprawdza się w codziennym użytkowaniu?"
            className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] resize-y"
          />
          <p className="text-xs text-[var(--muted)] mt-1 text-right">{tresc.length}/2000</p>
        </div>

        {blad && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            {blad}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || rating < 1}
          className="ml-auto px-6 py-3 bg-[var(--color-navy)] text-white font-sans text-xs font-semibold uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "Wysyłam..." : "Wyślij opinię"}
        </button>

        <p className="text-xs text-[var(--muted)]">
          Twój adres e-mail nie będzie publikowany — służy wyłącznie potwierdzeniu, że opinia
          pochodzi od osoby, która kupiła ten produkt. Pod opinią pokażemy tylko imię.
        </p>
      </form>
    </section>
  );
}
