import type { ReactNode } from "react";
import type { FabricPropertyIcon } from "@/app/_lib/fabric-properties";

// Biblioteka ikonek cech tkaniny. Zestaw cech jest edytowalny w panelu, ale
// ikonka to kod (SVG) — admin wybiera jedną z tych dziesięciu, nie rysuje
// własnej. Rejestr jest typowany jako Record<FabricPropertyIcon, ReactNode>,
// więc dorzucenie klucza do FABRIC_PROPERTY_ICONS bez ikonki nie skompiluje się.
//
// Zasady rysowania (pigułka renderuje ikonkę w 12 px):
// - jednolita bryła, `fill="currentColor"`, ZERO `stroke` — kontury zlewają się
//   w tym rozmiarze,
// - `viewBox="0 0 24 24"`, kształt wypełnia kadr,
// - zero drobnych detali: przy 12 px i tak zniknęłyby, a podpis pigułki niesie
//   właściwe znaczenie (ikonka jest ozdobna, stąd aria-hidden na <svg>).
const ICONS: Record<FabricPropertyIcon, ReactNode> = {
  // Kropla — przeniesiona 1:1 ze starej mapy (dawny kod `waterproof`),
  // żeby pigułka wyglądała dokładnie jak na produkcji.
  drop: (
    <path d="M12 2.6c3.9 4.9 6.8 8 6.8 11.3A6.8 6.8 0 1 1 5.2 13.9C5.2 10.6 8.1 7.5 12 2.6z" />
  ),
  // Łapka — 1:1 ze starej mapy (dawny kod `pet_friendly`).
  paw: (
    <>
      <circle cx="6.5" cy="9.5" r="2.3" />
      <circle cx="11" cy="6.6" r="2.3" />
      <circle cx="16" cy="7.6" r="2.3" />
      <circle cx="19" cy="12" r="2.1" />
      <path d="M12.4 12.2c2.6 0 5.3 2.4 5.3 4.8 0 1.7-1.4 2.7-3.2 2.7-1.2 0-1.6-.5-2.9-.5s-1.7.5-2.9.5c-1.8 0-3.2-1-3.2-2.7 0-2.4 2.7-4.8 5.3-4.8z" />
    </>
  ),
  // Iskierki — 1:1 ze starej mapy (dawny kod `easy_clean`).
  sparkle: (
    <path d="M12 2l1.7 4.6L18.3 8l-4.6 1.7L12 14.3l-1.7-4.6L5.7 8l4.6-1.4L12 2zm6 11l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9L18 13z" />
  ),
  // Listek z ogonkiem (naturalne włókna, ekologia).
  leaf: (
    <path d="M20.8 3.2C11.6 2.6 5 8.2 5 16.3c0 .6 0 1.2.1 1.7l-2.8 2.8 1.4 1.4 2.8-2.8c.6.1 1.1.1 1.7.1C16.3 19.5 21.4 12.4 20.8 3.2z" />
  ),
  // Tarcza (ochrona, impregnacja).
  shield: <path d="M12 2 4 5v6.2c0 4.9 3.4 9.4 8 10.6 4.6-1.2 8-5.7 8-10.6V5l-8-3z" />,
  // Słońce z promieniami (odporność na blaknięcie w słońcu). Promienie są
  // celowo grube (3/24) — przy 12 px cieńsze rozpływają się w tle.
  sun: (
    <>
      <circle cx="12" cy="12" r="4.8" />
      <path d="M10.5 1.2h3v5.2h-3zM10.5 17.6h3v5.2h-3zM1.2 10.5h5.2v3H1.2zM17.6 10.5h5.2v3h-5.2zM14.9 7 17.2 4.7 19.4 6.8 17 9.1zM9.1 7 6.8 4.7 4.6 6.8 7 9.1zM14.9 17 17.2 19.3 19.4 17.2 17 14.9zM9.1 17 6.8 19.3 4.6 17.2 7 14.9z" />
    </>
  ),
  // Płomień (trudnopalność). Wcięcie po prawej (ostry „języczek" nad brzuchem)
  // jest tu obowiązkowe — bez niego sylwetka wychodzi identyczna jak `drop`.
  flame: (
    <path d="M5 15.8C5 11 5.8 8 7.6 5.6 9 7.6 10 9 10.6 10.6 11.2 7.5 12 4 13.6 1.6 15.5 6 19 10.5 19 15.8c0 3.6-3.1 6.6-7 6.6s-7-3-7-6.6z" />
  ),
  // Splot — krata z przeplatających się nitek (rodzaj tkania).
  weave: <path d="M2 5h20v3H2zM2 16h20v3H2zM5 2h3v20H5zM16 2h3v20h-3z" />,
  // Hantla (wytrzymałość, odporność na ścieranie). Talerze grube i wysokie,
  // żeby przy 12 px nie zredukowały się do kreski.
  durability: (
    <path d="M1 6.5h3.4v11H1zM4.4 8.5h2.6v7H4.4zM7 10.2h10v3.6H7zM17 8.5h2.6v7H17zM19.6 6.5h3.4v11h-3.4z" />
  ),
  // Trzy fale powietrza (oddychalność).
  breathable: (
    <path d="M2 5.2c2.5-2.6 5.5-2.6 8 0s5.5 2.6 8 0l0 2.2c-2.5 2.6-5.5 2.6-8 0s-5.5-2.6-8 0zM2 11.5c2.5-2.6 5.5-2.6 8 0s5.5 2.6 8 0l0 2.2c-2.5 2.6-5.5 2.6-8 0s-5.5-2.6-8 0zM2 17.8c2.5-2.6 5.5-2.6 8 0s5.5 2.6 8 0l0 2.2c-2.5 2.6-5.5 2.6-8 0s-5.5-2.6-8 0z" />
  ),
};

// Ikonka pigułki cechy. Rozmiar i kolor są stałe (w-3 h-3, currentColor) —
// pigułka dziedziczy kolor tekstu, więc ikonka zawsze pasuje do motywu.
export default function FabricPropertyIconSvg({ icon }: { icon: FabricPropertyIcon }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true">
      {ICONS[icon]}
    </svg>
  );
}
