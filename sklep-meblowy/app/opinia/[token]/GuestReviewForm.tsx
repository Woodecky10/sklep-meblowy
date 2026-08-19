"use client";

import { useEffect, useState, useTransition } from "react";
import StarInput from "@/app/_components/ui/StarInput";
import ReviewPhotoPicker from "@/app/_components/ui/ReviewPhotoPicker";
import { MAX_REVIEW_PHOTOS } from "@/app/_lib/reviews-photos";
import { submitGuestReview, uploadGuestReviewPhoto } from "./actions";

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
  // Gość nigdy nie edytuje istniejącej opinii — link jest jednorazowy —
  // więc bez prefillu.
  const [zdjecia, setZdjecia] = useState<string[]>([]);
  // Blokada wysyłki na czas wgrywania zdjęcia. Tu jest to groźniejsze niż
  // w formularzu zalogowanego: udany zapis pali token (markInviteUsed), więc
  // opinia wysłana o sekundę za wcześnie zapisuje się BEZ zdjęcia i gość nie
  // ma jak wrócić — link nigdy się już nie otworzy.
  const [wysylanieZdjecia, setWysylanieZdjecia] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  // Trzyma TREŚĆ komunikatu zwróconego przez akcję, nie tylko fakt wysłania —
  // dzięki temu jest jedno źródło prawdy o tym, co dzieje się z opinią po
  // zapisie (submitGuestReview), zamiast dwóch niezależnych tekstów, które
  // recenzja gałęzi znalazła rozjechane (komponent ignorował `wynik.message`
  // i pokazywał własny, nieaktualny tekst o moderacji przed publikacją).
  const [wyslane, setWyslane] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // GoogleAnalytics i MetaPixel siedzą w layoucie korzenia i obejmują też tę
  // stronę — bez tego pełny link z jawnym tokenem trafiłby do page_location
  // (GA4) i PageView (Meta) po zgodzie na analitykę. Token zostaje w ukrytym
  // polu formularza (poniżej), więc czyszczenie adresu nie psuje wysyłki.
  // replaceState (nie push) — to nie jest nawigacja, tylko sprzątanie paska
  // adresu, więc nie ma nowego wpisu w historii.
  useEffect(() => {
    const bezTokenu = window.location.pathname.replace(/\/[^/]+\/?$/, "/");
    window.history.replaceState(null, "", bezTokenu + window.location.search);
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBlad(null);
    const formData = new FormData(e.currentTarget);
    // StarInput trzyma ocenę w stanie Reacta, nie w polu formularza.
    formData.set("rating", String(rating));
    // Widżet trzyma listę URL-i w stanie Reacta, nie w polu formularza —
    // tak samo jak StarInput trzyma ocenę.
    formData.set("photos", JSON.stringify(zdjecia));
    startTransition(async () => {
      const wynik = await submitGuestReview(formData);
      if (!wynik.ok) setBlad(wynik.error);
      else setWyslane(wynik.message ?? "Twoja opinia jest już na stronie.");
    });
  }

  if (wyslane) {
    return (
      <section className="max-w-2xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-3">Dziękujemy!</h1>
        <p className="text-[var(--muted)]">{wyslane}</p>
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

        <ReviewPhotoPicker
          photos={zdjecia}
          onChange={setZdjecia}
          disabled={pending}
          onBusyChange={setWysylanieZdjecia}
          upload={async (fd) => {
            fd.set("token", token);
            return uploadGuestReviewPhoto(fd);
          }}
          teksty={{
            label: "Zdjęcia (opcjonalnie)",
            hint: `Do ${MAX_REVIEW_PHOTOS} zdjęć. Pokażemy je publicznie razem z opinią.`,
            add: "Dodaj zdjęcie",
            uploading: "Wysyłam...",
            alt: "Zdjęcie do opinii",
            remove: "Usuń zdjęcie",
            prepareFailed:
              "Nie udało się przygotować zdjęcia. Jeśli to plik HEIC z iPhone'a, wyślij zdjęcie prosto z telefonu albo zapisz je jako JPG.",
          }}
        />

        {blad && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            {blad}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || rating < 1 || wysylanieZdjecia}
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
