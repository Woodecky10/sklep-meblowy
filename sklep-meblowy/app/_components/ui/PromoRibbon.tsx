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
      // whitespace-nowrap + overflow-hidden są WYMAGANE, nie kosmetyczne: panel
      // wpuszcza napis do 16 znaków, a span o stałej szerokości bez nowrap zawija
      // tekst na dwie linie WEWNĄTRZ obrotu -45° — brzydsze niż obcięcie.
      // ZNAK OBROTU JEST KRYTYCZNY, nie estetyczny: w LEWYM DOLNYM narożniku
      // pas musi biegnąć w dół-prawo (rotate-45), żeby przeciąć oba brzegi
      // kontenera — lewy i dolny — i dać się przyciąć z obu stron. Przy
      // -rotate-45 pas idzie w górę-prawo, więc od lewej jest przycięty, ale
      // drugi koniec urywa się W ŚRODKU zdjęcia i wygląda jak czarny klin
      // (zobaczone na żywym renderze, nie w kodzie). Uphill czyta się tylko
      // w narożnikach górnym-lewym i dolnym-prawym.
      className={`pointer-events-none absolute ${geometry} rotate-45 whitespace-nowrap overflow-hidden text-center bg-[var(--color-navy)] text-[var(--color-gold-light)] font-sans font-bold uppercase tracking-[0.2em] shadow-md`}
    >
      {text}
    </span>
  );
}
