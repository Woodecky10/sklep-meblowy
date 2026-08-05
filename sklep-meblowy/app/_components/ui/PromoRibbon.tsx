// Ukośna wstążka w LEWYM DOLNYM narożniku zdjęcia. Narożniki są zajęte:
// lewy górny = badge z „Polecanych", prawy górny = serce ulubionych — dlatego
// wstążka idzie na dół. Przycięcie po łuku robi overflow-hidden kontenera.
// Świadomie bez importów i bez "use client": ten sam komponent renderuje się
// z ProductCard (serwer) i z ImageGallery (klient).
export default function PromoRibbon({
  text,
  size = "card",
  decorative = false,
}: {
  text: string;
  // card: kafel listingu (rounded-2xl), hero: główne zdjęcie karty produktu (rounded-3xl)
  size?: "card" | "hero";
  // true na karcie produktu — obok ceny stoi już plakietka „Promocja",
  // czytnik ekranu nie ma czytać tego dwa razy.
  decorative?: boolean;
}) {
  const geometry =
    size === "hero"
      ? "bottom-9 -left-12 w-56 py-2 text-[11px]"
      : "bottom-6 -left-9 w-36 py-1.5 text-[9px]";

  return (
    <span
      aria-hidden={decorative || undefined}
      className={`pointer-events-none absolute ${geometry} -rotate-45 text-center bg-[var(--color-navy)] text-[var(--color-gold-light)] font-sans font-bold uppercase tracking-[0.2em] shadow-md`}
    >
      {text}
    </span>
  );
}
