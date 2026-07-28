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
  // 16px przy max-w-4xl daje ~95 znaków w wierszu. Szersza miara wymaga większego
  // stopnia pisma, inaczej wiersz robi się za długi i oko gubi początek następnego
  // — przy tekście wyśrodkowanym (ragged z obu stron) tym bardziej.
  const paraCls =
    "text-base leading-relaxed text-[var(--muted)] text-balance";

  return (
    <section className="mb-10 max-w-4xl mx-auto text-center">
      {/* Krótka złota kreska NAD tekstem, wyśrodkowana. Wersja z kreską po lewej
          nie da się pogodzić z centrowaniem — wisiałaby na środku strony,
          oderwana od lewej krawędzi nagłówka. Ten sam akcent, inne osadzenie. */}
      <span
        aria-hidden="true"
        className="mx-auto mb-5 block h-px w-12 bg-[var(--color-gold)]"
      />

      <p className={paraCls}>{first}</p>

      {rest.length > 0 && (
        // flex + order: <summary> MUSI byc pierwszym dzieckiem w DOM (tak dziala
        // <details>), ale kolejnosc wizualna odwracamy flexboksem, zeby po
        // rozwinieciu "Zwin opis" stalo POD akapitami, a nie w srodku tekstu.
        // W stanie zwinietym summary jest jedynym widocznym dzieckiem, wiec
        // order nie ma tam znaczenia — przycisk zostaje tuz pod pierwszym akapitem.
        <details className="group mt-4 flex flex-col">
          <summary
            className="order-2 mx-auto inline-flex cursor-pointer list-none items-center gap-1.5 font-sans text-xs uppercase tracking-widest text-[var(--color-gold)] transition-colors hover:text-[var(--color-gold-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] [&::-webkit-details-marker]:hidden"
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

          {/* order-1 = nad przyciskiem. mb-4 zamiast mt-4, bo odstep jest teraz
              MIEDZY akapitami i przyciskiem pod nimi, nie nad tekstem. */}
          <div className="order-1 mb-4 flex flex-col gap-4">
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
