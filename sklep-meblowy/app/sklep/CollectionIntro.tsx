// Opis kolekcji nad filtrami na /sklep.
//
// Serwerowy, ZERO JavaScriptu — rozwijanie stoi na natywnym <details>. Dzięki
// temu działa bez hydracji, jest dostępne z klawiatury out of the box, a cały
// tekst siedzi w HTML od razu (liczy się dla SEO strony kolekcji).
//
// Dlaczego rozwijanie, a nie cały tekst: opisy kolekcji to kilka akapitów
// (NUVO ma 846 znaków / 3 akapity). Wrzucone w całości między nagłówek a filtry
// zepchnęłyby siatkę produktów poniżej pierwszego ekranu, a na /sklep intencją
// wchodzącego jest przeglądanie produktów. Pierwszy akapit zostaje widoczny —
// zwykle nosi całą obietnicę kolekcji — resztę czyta ten, kto chce.

// Tekst z bazy jest zwykłym tekstem (bez HTML), akapity rozdzielone pustą
// linią; w praktyce CRLF, bo wpisywany przez panel na Windowsie.
function toParagraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\r?\n/g, " ").trim())
    .filter((p) => p.length > 0);
}

export default function CollectionIntro({
  description,
  moreLabel,
  lessLabel,
}: {
  description: string;
  moreLabel: string;
  lessLabel: string;
}) {
  const paragraphs = toParagraphs(description);
  if (paragraphs.length === 0) return null;

  const [first, ...rest] = paragraphs;
  // max-w-3xl, bo przy pełnej szerokości kontenera (7xl) wiersz miałby ~180
  // znaków i tekst stałby się nieczytelny. Miara ~75 znaków to komfort czytania.
  const paraCls = "text-[15px] leading-relaxed text-[var(--muted)]";

  return (
    <section
      // Złota kreska po lewej — ten sam akcent, którym sklep oznacza treść
      // wyróżnioną; oddziela opis od nagłówka bez dokładania ramki czy karty.
      className="mb-10 max-w-3xl border-l-2 border-[var(--color-gold)] pl-5"
    >
      <p className={paraCls}>{first}</p>

      {rest.length > 0 && (
        <details className="group mt-3">
          <summary
            className="inline-flex cursor-pointer list-none items-center gap-1.5 font-sans text-xs uppercase tracking-widest text-[var(--color-gold)] transition-colors hover:text-[var(--color-gold-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] [&::-webkit-details-marker]:hidden"
          >
            {/* Dwie etykiety, przełączane CSS-em wg stanu <details> — bez tego
                trzeba by komponentu klienckiego tylko po zmianę jednego napisu. */}
            <span className="group-open:hidden">{moreLabel}</span>
            <span className="hidden group-open:inline">{lessLabel}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="transition-transform group-open:rotate-180"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>

          <div className="mt-3 flex flex-col gap-3">
            {rest.map((p, i) => (
              <p key={i} className={paraCls}>
                {p}
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
