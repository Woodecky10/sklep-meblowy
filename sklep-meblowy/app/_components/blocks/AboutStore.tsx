import type { Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";

// Opis sklepu zwykłym językiem — WYMÓG weryfikacji marki Google. Recenzent musi
// wyczytać ze strony głównej, czym aplikacja jest i po co jest w niej konto;
// reszta home mówi hasłami („Meble, które opowiadają historię"), przez co Google
// odrzucił zgłoszenie z powodem „strona główna nie wyjaśnia celu aplikacji".
//
// Domyślnie wplatany jako wstęp w pasek „Dlaczego warto" (page.tsx), bo to
// tematycznie sekcja „kim jesteśmy" i tam wygląda jak część strony, a nie jak
// doklejony blok SEO. `withHeading` włącza wariant samodzielny — używany, gdy
// pasek zaufania zostanie wyłączony w panelu, żeby tekst nie zniknął razem z nim.
export default function AboutStore({
  locale,
  withHeading = false,
}: {
  locale: Locale;
  withHeading?: boolean;
}) {
  const t = getDictionary(locale).home;
  return (
    <div className="max-w-4xl mx-auto mb-14">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
        <p className="text-base text-[var(--muted)] leading-relaxed">{t.aboutBody}</p>
        <p className="text-base text-[var(--muted)] leading-relaxed">{t.aboutAccount}</p>
      </div>
    </div>
  );
}
