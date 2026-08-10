import type { Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { sanitizeRichHtml } from "@/app/_lib/product-html";

// Opis sklepu na stronie głównej. Treść jest EDYTOWALNA z panelu
// (/admin/strona-glowna → Teksty ogólne → „Opis sklepu na stronie głównej"),
// trzymana w site_texts pod kluczem `home_about` jako HTML z edytora WYSIWYG.
// Puste pole → tekst domyślny ze słownika, więc sekcja nigdy nie znika.
//
// HTML przechodzi przez sanitizeRichHtml — tę samą whitelistę co opisy
// produktów (p/br/ul/ol/li/strong/em/a/h2/h3/h4/…), więc treść z panelu nie
// może wstrzyknąć skryptu ani obejść CSP.
//
// `withHeading` włącza wariant samodzielny (własny eyebrow + nagłówek) —
// używany, gdy pasek zaufania zostanie wyłączony w panelu, żeby opis nie
// zniknął razem z nim.
export default function AboutStore({
  locale,
  html,
  withHeading = false,
}: {
  locale: Locale;
  html: string;
  withHeading?: boolean;
}) {
  const t = getDictionary(locale).home;
  const body = html.trim() ? html : t.aboutDefaultHtml;

  return (
    <div className="max-w-3xl mx-auto mb-16">
      {withHeading && (
        <div className="text-center mb-8">
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
            {t.aboutEyebrow}
          </p>
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
            {t.aboutHeading}
          </h2>
        </div>
      )}
      <div
        className="rich-text text-[var(--fg)]"
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }}
      />
    </div>
  );
}
