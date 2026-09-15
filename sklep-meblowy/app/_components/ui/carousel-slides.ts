// Szerokości slajdów ProductCarousel. Domyślnie karuzela wozi 4 karty produktów
// na ekran (klasa inline w ProductCarousel.tsx). Kafelki kolekcji i zestawów
// są większe (mozaika 4:3 + opis + cena), więc dostają 3 na ekran — ta sama
// siatka, co dawna statyczna sekcja kolekcji (1 / 2 / 3 kolumny).
//
// Osobny, CZYSTY moduł, a nie eksport z ProductCarousel.tsx: tamten plik ma
// "use client", a import stałej z modułu klienckiego do komponentu serwerowego
// daje w Next referencję kliencką zamiast stringa. Odstępy: gap-8 = 2rem,
// dwa odstępy na trzy slajdy → 1.334rem na slajd.
export const SLIDES_3_PER_ROW =
  "min-w-0 shrink-0 basis-[78%] sm:basis-[calc(50%-1rem)] lg:basis-[calc(33.333%-1.334rem)]";
