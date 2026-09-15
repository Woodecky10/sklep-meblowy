// Klasa grid dla i-tego zdjęcia w mozaice kafelka (do 4 zdjęć, siatka 2×2).
// Pojedyncze zdjęcie wypełnia całość, dwa dzielą się na pół szerokości, przy
// trzech pierwsze zajmuje cały górny wiersz, przy czterech siatka 2×2.
// Wspólne dla kafelka kolekcji (HomeCollections.tsx) i kafelka zestawu
// (BundleTileCard.tsx) — jedna reguła, żeby oba kafelki wyglądały tak samo.
export function mosaicTileClass(total: number, index: number): string {
  if (total === 1) return "col-span-2 row-span-2";
  if (total === 2) return "col-span-1 row-span-2";
  if (total === 3 && index === 0) return "col-span-2";
  return "";
}
