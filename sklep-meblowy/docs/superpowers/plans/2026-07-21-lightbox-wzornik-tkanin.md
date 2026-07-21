# Lightbox zdjęć na stronie tkaniny — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na `/tkaniny/[slug]` klik zdjęcia (próbka wzornika lub zdjęcie z produkcji) otwiera pełny podgląd w lightboxie; zdjęcia z produkcji z podpiętym produktem mają osobny link do karty produktu.

**Architecture:** Jeden wspólny, sterowany komponent `ImageLightbox` (overlay + strzałki + Esc/klik-tło/X, `useModal`), używany przez dwa komponenty klienckie: `FabricSwatchGrid` (wzornik) i `FabricProductionPhotos` (zdjęcia z produkcji). Server-component strony przekazuje dane; czysta `swatchImages` wybiera klikalne próbki. Spec: `docs/superpowers/specs/2026-07-21-lightbox-wzornik-tkanin-design.md`.

**Tech Stack:** Next.js App Router (ZMODYFIKOWANY — patrz Global Constraints), React client components, Tailwind (`var(--...)`), vitest.

## Global Constraints

- Repo root `sklep-meblowy/`, apka w `sklep-meblowy/sklep-meblowy/` — ścieżki względem WEWNĘTRZNEGO folderu; komendy stamtąd.
- `AGENTS.md`: zmodyfikowany Next.js — wzorce z istniejącego kodu, nie z pamięci.
- Branch: `feat/lightbox-wzornik-tkaniny` (już istnieje, zawiera commit specu; bazuje na main z PR #71/#73).
- Zero migracji, zero nowych stringów PL/DE — reużywamy klucze a11y: `t.a11y.zoomImage`, `t.a11y.prevImage`, `t.a11y.nextImage`, `t.common.close` (wszystkie już używane w `app/_components/ui/ImageGallery.tsx`).
- Zdjęcia renderujemy surowym `<img>` z `// eslint-disable-next-line @next/next/no-img-element` (spójnie z obecną stroną tkaniny; bez `next/Image`).
- Lightbox: bez zoomu/panu; overlay `fixed inset-0 z-[100] bg-black/90`; obraz `object-contain max-h-[85vh]`; `useModal(open, { onClose, containerRef, trapFocus:true })`.
- Weryfikacja per task: `npx tsc --noEmit` + `npm run lint` + `npm test`. NIE `npm run build` gdy działa `next dev` (build w ostatnim tasku).
- Push/PR/merge: konto gh `Woodecky10` (sprawdzić `gh auth status` — potrafi wrócić na mwlo1403). Stopka commitów: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Czysta `swatchImages` (TDD)

**Files:**
- Create: `app/_lib/fabric-swatch-images.ts`
- Test: Create `app/_lib/__tests__/fabric-swatch-images.test.ts`

**Interfaces:**
- Produces (Task 3): `type SwatchImage = { code: string; url: string }`, `swatchImages(colors: string[], images: Record<string, string>): SwatchImage[]`.

- [ ] **Step 1: Failujący test**

`app/_lib/__tests__/fabric-swatch-images.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { swatchImages } from "../fabric-swatch-images";

describe("swatchImages", () => {
  it("zwraca próbki mające zdjęcie, w kolejności colors", () => {
    const res = swatchImages(
      ["02", "04", "09"],
      { "09": "https://x.co/9.jpg", "02": "https://x.co/2.jpg" }
    );
    expect(res).toEqual([
      { code: "02", url: "https://x.co/2.jpg" },
      { code: "09", url: "https://x.co/9.jpg" },
    ]);
  });
  it("pomija kody bez URL oraz URL nie-http(s)", () => {
    const res = swatchImages(
      ["02", "04", "05"],
      { "02": "https://x.co/2.jpg", "04": "", "05": "javascript:alert(1)" }
    );
    expect(res).toEqual([{ code: "02", url: "https://x.co/2.jpg" }]);
  });
  it("pusta mapa / brak kolorów → []", () => {
    expect(swatchImages(["02"], {})).toEqual([]);
    expect(swatchImages([], { "02": "https://x.co/2.jpg" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Potwierdź FAIL**

Run: `npx vitest run app/_lib/__tests__/fabric-swatch-images.test.ts`
Expected: FAIL — moduł nie istnieje.

- [ ] **Step 3: Implementacja**

`app/_lib/fabric-swatch-images.ts`:

```ts
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
```

- [ ] **Step 4: PASS + commit**

Run: `npx vitest run app/_lib/__tests__/fabric-swatch-images.test.ts` → PASS; `npm test` → PASS; `npx tsc --noEmit` → czysto.

```bash
git add app/_lib/fabric-swatch-images.ts app/_lib/__tests__/fabric-swatch-images.test.ts
git commit -m "feat(tkaniny): swatchImages — czysty wybor klikalnych probek wzornika"
```

---

### Task 2: Wspólny `ImageLightbox` (klient)

**Files:**
- Create: `app/_components/ui/ImageLightbox.tsx`

**Interfaces:**
- Consumes: `useModal` (`app/_lib/useModal.ts`, sygnatura `useModal<E>(active, { onClose, containerRef, trapFocus })`), `useClientLocale` (`app/_lib/useClientLocale`), `getDictionary` (`app/_lib/dictionaries`).
- Produces (Task 3): `type LightboxImage = { src: string; caption?: string }`; default export
  `ImageLightbox({ images, index, onClose, onIndexChange, alt }: { images: LightboxImage[]; index: number | null; onClose: () => void; onIndexChange: (i: number) => void; alt: string })`.

- [ ] **Step 1: Implementacja**

`app/_components/ui/ImageLightbox.tsx` (brak testu jednostkowego — komponent UI; weryfikacja tsc/lint/build + smoke):

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useModal } from "@/app/_lib/useModal";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

export type LightboxImage = { src: string; caption?: string };

// Wspólny, sterowany lightbox (wzornik + zdjęcia z produkcji tkaniny). Prosty:
// pełny obraz object-contain, strzałki, Esc/klik-tło/X. Bez zoomu/panu (to ma
// ImageGallery produktu). index === null → nic nie renderuje.
export default function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
  alt,
}: {
  images: LightboxImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  alt: string;
}) {
  const t = getDictionary(useClientLocale());
  const ref = useRef<HTMLDivElement>(null);
  const open = index !== null;

  // scroll-lock + Escape + focus-trap (jak ImageGallery).
  useModal(open, { onClose, containerRef: ref, trapFocus: true });

  // Strzałki klawiatury ←/→ tylko gdy otwarty i jest >1 zdjęcie.
  useEffect(() => {
    if (!open || images.length < 2 || index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") onIndexChange((index! + 1) % images.length);
      if (e.key === "ArrowLeft") onIndexChange((index! - 1 + images.length) % images.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onIndexChange]);

  if (index === null || !images[index]) return null;
  const current = images[index];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
    >
      <figure
        className="relative max-w-5xl w-full flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.src}
          alt={alt}
          className="max-w-full max-h-[85vh] object-contain select-none"
          draggable={false}
        />
        {current.caption && (
          <figcaption className="text-sm font-sans text-white/80">{current.caption}</figcaption>
        )}
      </figure>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index - 1 + images.length) % images.length);
            }}
            aria-label={t.a11y.prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index + 1) % images.length);
            }}
            aria-label={t.a11y.nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t.common.close}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
```

Uwaga: potwierdź, że `t.a11y.prevImage`, `t.a11y.nextImage`, `t.common.close` istnieją (są używane w `app/_components/ui/ImageGallery.tsx`). Jeśli którejś ścieżki brakuje w typie `PlShape` — użyj tej z ImageGallery 1:1.

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → czysto / PASS.

```bash
git add app/_components/ui/ImageLightbox.tsx
git commit -m "feat(tkaniny): ImageLightbox — wspolny prosty lightbox (overlay, strzalki, Esc)"
```

---

### Task 3: `FabricSwatchGrid` + `FabricProductionPhotos` + podmiana na stronie

**Files:**
- Create: `app/_components/ui/FabricSwatchGrid.tsx`
- Create: `app/_components/ui/FabricProductionPhotos.tsx`
- Modify: `app/tkaniny/[slug]/page.tsx` (wzornik: linie ~121-147; zdjęcia z produkcji: ~149-185; importy)

**Interfaces:**
- Consumes: `swatchImages`/`SwatchImage` (Task 1); `ImageLightbox`/`LightboxImage` (Task 2); `useClientLocale`, `getDictionary`, `LocalizedLink`.
- Produces (strona): `FabricSwatchGrid({ colors, images, name }: { colors: string[]; images: Record<string, string>; name: string })`; `FabricProductionPhotos({ photos, fabricName }: { photos: { url: string; product: { id: string; name: string } | null }[]; fabricName: string })`.

- [ ] **Step 1: `FabricSwatchGrid.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { swatchImages } from "@/app/_lib/fabric-swatch-images";
import ImageLightbox from "@/app/_components/ui/ImageLightbox";

// Wzornik: siatka próbek kolorów. Próbka ze zdjęciem → klik otwiera lightbox
// (zestaw = próbki mające zdjęcie, kolejność wg swatchImages). Próbka bez
// zdjęcia → placeholder z numerem (nieklikalny).
export default function FabricSwatchGrid({
  colors,
  images,
  name,
}: {
  colors: string[];
  images: Record<string, string>;
  name: string;
}) {
  const t = getDictionary(useClientLocale());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const clickable = swatchImages(colors, images);
  const lightboxImages = clickable.map((s) => ({ src: s.url, caption: s.code }));
  // kod → pozycja w liście klikalnych (do otwarcia lightboxa na właściwym zdjęciu).
  const indexByCode = new Map(clickable.map((s, i) => [s.code, i]));

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {colors.map((code) => {
          const img = images[code];
          const idx = indexByCode.get(code);
          const tile = (
            <span className="relative w-full aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={`${name} ${code}`} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-sm text-[var(--muted)]">
                  {code}
                </span>
              )}
            </span>
          );
          return (
            <figure key={code} className="flex flex-col items-center gap-2 text-center">
              {idx !== undefined ? (
                <button
                  type="button"
                  onClick={() => setOpenIndex(idx)}
                  aria-label={t.a11y.zoomImage}
                  className="w-full cursor-pointer rounded-xl hover:ring-2 hover:ring-[var(--color-gold)]/40 transition-all"
                >
                  {tile}
                </button>
              ) : (
                tile
              )}
              <figcaption className="text-xs text-[var(--muted)]">{code}</figcaption>
            </figure>
          );
        })}
      </div>
      <ImageLightbox
        images={lightboxImages}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onIndexChange={setOpenIndex}
        alt={name}
      />
    </>
  );
}
```

- [ ] **Step 2: `FabricProductionPhotos.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import ImageLightbox from "@/app/_components/ui/ImageLightbox";

// Zdjęcia z produkcji: każde zdjęcie klikalne → lightbox (zestaw = wszystkie).
// Pod zdjęciem z podpiętym aktywnym produktem osobny link do karty produktu
// (klik zdjęcia = podgląd, klik nazwy = przejście do produktu).
export default function FabricProductionPhotos({
  photos,
  fabricName,
}: {
  photos: { url: string; product: { id: string; name: string } | null }[];
  fabricName: string;
}) {
  const t = getDictionary(useClientLocale());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const lightboxImages = photos.map((p) => ({
    src: p.url,
    caption: p.product?.name,
  }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {photos.map((p, i) => (
          <div key={i} className="group flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={t.a11y.zoomImage}
              className="relative block aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg)] cursor-pointer hover:ring-2 hover:ring-[var(--color-gold)]/40 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.product?.name ?? fabricName}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
            {p.product && (
              <LocalizedLink
                href={`/produkt/${p.product.id}`}
                className="text-sm font-sans text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
              >
                {p.product.name} <span aria-hidden="true">→</span>
              </LocalizedLink>
            )}
          </div>
        ))}
      </div>
      <ImageLightbox
        images={lightboxImages}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onIndexChange={setOpenIndex}
        alt={fabricName}
      />
    </>
  );
}
```

- [ ] **Step 3: Podmiana w `app/tkaniny/[slug]/page.tsx`**

1. Importy (po `LocalizedLink`):

```tsx
import FabricSwatchGrid from "@/app/_components/ui/FabricSwatchGrid";
import FabricProductionPhotos from "@/app/_components/ui/FabricProductionPhotos";
```

2. Wzornik — zastąp CAŁY `<div className="grid grid-cols-3 ...">…</div>` (obecnie linie ~126-145, z `figure`ami) jednym wywołaniem (nagłówek `<h2>` i `<section>` zostają):

```tsx
          <FabricSwatchGrid
            colors={colors}
            images={fabric.color_images ?? {}}
            name={pickLocalized(fabric.name, fabric.name_de, locale)}
          />
```

3. Zdjęcia z produkcji — przed `return` zbuduj listę z rozwiązanym produktem, a w JSX zastąp CAŁY `<div className="grid grid-cols-2 ...">…</div>` (obecnie ~154-183) komponentem. Po bloku liczącym `linkedProducts` dodaj:

```tsx
  const productionPhotos = photos.map((p) => {
    const prod = p.product_id ? linkedProducts.get(p.product_id) : undefined;
    return {
      url: p.url,
      product: prod ? { id: prod.id, name: pickLocalized(prod.name, prod.name_de, locale) } : null,
    };
  });
```

a w sekcji zdjęć z produkcji (nagłówek `<h2>` zostaje):

```tsx
          <FabricProductionPhotos
            photos={productionPhotos}
            fabricName={pickLocalized(fabric.name, fabric.name_de, locale)}
          />
```

Usuń teraz nieużywane w server-componentcie: import `LocalizedLink` pozostaje (używany w breadcrumb). Sprawdź, że po podmianie nie zostają nieużywane zmienne (`img`/`alt`/`product` z dawnej pętli znikają razem z `div`).

- [ ] **Step 4: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → czysto / PASS. (lint wychwyci ewentualne nieużyte importy/zmienne po podmianie.)

```bash
git add app/_components/ui/FabricSwatchGrid.tsx app/_components/ui/FabricProductionPhotos.tsx "app/tkaniny/[slug]/page.tsx"
git commit -m "feat(tkaniny): klikalne zdjecia wzornika i produkcji -> lightbox"
```

---

### Task 4: Weryfikacja końcowa + PR + merge (KONTROLER)

**Files:** brak nowych.

- [ ] **Step 1: Pełne checki** (upewnij się, że `next dev` NIE działa)

```bash
npm test && npm run lint && npm run build
```

Expected: 653+ testów PASS (+3 nowe z Task 1), lint 0 błędów, build OK (`/tkaniny/[slug]` się kompiluje).

- [ ] **Step 2: Push + PR + merge (konto Woodecky10)**

```bash
gh auth switch --user Woodecky10
git push -u origin feat/lightbox-wzornik-tkaniny
gh pr create --repo Woodecky10/sklep-meblowy --base main --head feat/lightbox-wzornik-tkaniny --title "feat(tkaniny): lightbox zdjec (wzornik + zdjecia z produkcji)" --body "Spec: sklep-meblowy/docs/superpowers/specs/2026-07-21-lightbox-wzornik-tkanin-design.md

- klik probki wzornika (ze zdjeciem) -> lightbox; nawigacja miedzy probkami majacymi zdjecie
- klik zdjecia z produkcji -> lightbox; przy podpietym aktywnym produkcie osobny link (nazwa) -> /produkt/[id]
- wspolny ImageLightbox (overlay, strzalki, Esc/klik-tlo/X, useModal); bez zoomu; surowy <img> object-contain
- czysta swatchImages + test; reuzyte klucze a11y; zero migracji i nowych stringow PL/DE

Weryfikacja: 656/656 testow, lint 0 bledow, build OK. Review per-task + whole-branch.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merge robi KONTROLER (flow merge=deploy zaakceptowany dla tej rodziny zmian). Brak migracji → po merge tylko smoke (bez list_tables).

- [ ] **Step 3: Po deployu (KONTROLER)** — pojedynczy curl (rate limit): `https://mollien.pl/tkaniny/<slug-tkaniny-ze-zdjeciami>` → 200; smoke wizualny (Playwright/ręcznie): klik próbki i zdjęcia z produkcji otwiera pełny podgląd, Esc/tło/X zamyka, strzałki działają, link produktu prowadzi do karty. Deploy propaguje ~2-3 min.

---

## Self-review (wykonany przy pisaniu planu)

- Spec coverage: swatchImages (T1), ImageLightbox (T2), FabricSwatchGrid + FabricProductionPhotos + podmiana strony (T3), weryfikacja+PR (T4). Przypadki brzegowe: wzornik bez zdjęć (brak klikalnych, `swatchImages`→[]), zdjęcie bez produktu (brak linku), produkt zdezaktywowany (server → `product:null`), pojedyncze zdjęcie (brak strzałek — `images.length>1` gate), klik linku ≠ lightbox (osobny element pod przyciskiem).
- Typy spójne: `SwatchImage`, `swatchImages`, `LightboxImage`, `ImageLightbox` props (`images/index/onClose/onIndexChange/alt`), `FabricSwatchGrid`/`FabricProductionPhotos` propsy — jednolite T1→T3.
- Placeholdery: brak; komponenty podane w całości. Klucze a11y reużyte (uwaga w T2 by potwierdzić ścieżki wg ImageGallery).
- YAGNI: bez zoomu/panu; bez nowych stringów; bez migracji.
