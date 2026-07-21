// Które próbki wzornika mają zdjęcie (klikalne w lightbox) i w jakiej kolejności
// nawiguje lightbox. Czysty moduł — testowalny bez DOM. Kolejność wg `colors`
// (kanoniczna kolejność kodów), pomija kody bez URL http(s).
export type SwatchImage = { code: string; url: string };

export function swatchImages(
  colors: string[],
  images: Record<string, string>
): SwatchImage[] {
  const out: SwatchImage[] = [];
  for (const code of colors) {
    const url = images[code];
    if (typeof url === "string" && /^https?:\/\//.test(url.trim())) {
      out.push({ code, url: url.trim() });
    }
  }
  return out;
}
