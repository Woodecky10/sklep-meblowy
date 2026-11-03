import type { Product } from "./types";
import { effectivePrice } from "./pricing";

// Dane przycisku „+" na karcie produktu (QuickAddButton, komponent kliencki).
//
// Wszystko, co komponent serwerowy podaje klienckiemu w propsach, jedzie do
// przeglądarki w payloadzie RSC — w całości, razem z polami, których klient
// nie czyta. Karta produktu podawała tu cały `Product` (opisy PL i DE, klucze
// wyszukiwania, warianty ze wszystkimi tkaninami i cenami): na stronie głównej
// było to ~200 KB z 416 KB payloadu i spowalniało LCP na telefonach (pomiar
// PageSpeed 2026-11-03). Dlatego tu jest wąska lista — dokładając pole, dokładaj
// tylko takie, które przycisk naprawdę wyświetla albo wkłada do koszyka.
export type QuickAddProduct = {
  id: string;
  name: string;
  // Cena efektywna (z promocją) — dokładnie ta, którą wkłada się do koszyka.
  price: number;
  // Pierwsze zdjęcie produktu albo "" (tak jak koszyk zapisywał je dotąd:
  // getVariantImages(product, {})[0] przy pustym wyborze = images[0]).
  image: string;
  category: Product["category"];
  // Produkt z opcjami nie może trafić do koszyka bez wyboru wariantu —
  // przycisk prowadzi wtedy na kartę produktu zamiast dodawać.
  hasVariants: boolean;
};

export function toQuickAddProduct(product: Product): QuickAddProduct {
  return {
    id: product.id,
    name: product.name,
    price: effectivePrice(product.price, product.sale_price),
    image: product.images?.[0] ?? "",
    category: product.category,
    hasVariants: (product.variants?.options.length ?? 0) > 0,
  };
}
