import type { Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";

// Opis sklepu — treść marketingowa („Dlaczego warto kupować w Mollien") plus
// WYMÓG weryfikacji marki Google: recenzent musi wyczytać ze strony głównej,
// czym aplikacja jest i po co jest w niej konto. Dlatego w `aboutIntro` siedzi
// wplecione zdanie definiujące („Mollien to sklep internetowy z meblami…"),
// a całość domyka `aboutAccount`. Te dwa zdania są kotwicami weryfikacji —
// przy zmianie treści muszą zostać, inaczej wraca powód odrzucenia „strona
// główna nie wyjaśnia celu aplikacji".
//
// Domyślnie wplatany jako wstęp w pasek „Dlaczego warto" (page.tsx).
// `withHeading` włącza wariant samodzielny — używany, gdy pasek zaufania
// zostanie wyłączony w panelu, żeby tekst nie zniknął razem z nim.
export default function AboutStore({
  locale,
  withHeading = false,
}: {
  locale: Locale;
  withHeading?: boolean;
}) {
  const t = getDictionary(locale).home;
  return (
    <div className="max-w-5xl mx-auto mb-16">
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

      <p className="max-w-3xl mx-auto text-center text-base text-[var(--muted)] leading-relaxed">
        {t.aboutIntro}
      </p>

      {/* Dwie kolumny zamiast listy z emoji — emoji rozjeżdżają się między
          systemami i nie mają nic wspólnego z resztą typografii sklepu. */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
        {t.aboutItems.map((item) => (
          <div key={item.title}>
            <h3 className="font-sans text-xs uppercase tracking-[0.2em] text-[var(--color-gold-text)] mb-2">
              {item.title}
            </h3>
            <p className="text-base text-[var(--muted)] leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 max-w-3xl mx-auto text-center">
        <p className="font-display text-2xl font-bold text-[var(--fg)] mb-3">
          {t.aboutClosingHeading}
        </p>
        <p className="text-base text-[var(--muted)] leading-relaxed">{t.aboutClosing}</p>
        <p className="mt-3 text-base text-[var(--muted)] leading-relaxed">
          {t.aboutAccount}
        </p>
        <p className="mt-6 font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)]">
          {t.aboutTagline}
        </p>
      </div>
    </div>
  );
}
