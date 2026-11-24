"use client";

import { useSyncExternalStore } from "react";
import { christmasCountdown } from "@/app/_lib/christmas-guarantee";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

// Pasek „Dostawa przed świętami" z licznikiem do końca terminu zamówień.
// Renderowany tylko dla produktów z gwarancją (patrz christmas-guarantee.ts) —
// o tym decyduje serwer w page.tsx, ten komponent sam niczego nie sprawdza.
//
// WYDAJNOŚĆ (wymóg właściciela: pasek nie może obniżyć wyniku PageSpeed):
// - zero bibliotek i zero obrazków — sam tekst i CSS;
// - stałe wymiary: serwer renderuje ten sam układ z „--" zamiast cyfr, a kafelki
//   mają stałą szerokość i cyfry tabelaryczne, więc wstawienie cyfr po
//   hydratacji niczego nie przesuwa (CLS = 0);
// - animacje wyłącznie na transform/opacity (kompozytor, bez layoutu i paint
//   całej strony), wyłączone przy prefers-reduced-motion — style w globals.css;
// - jeden wspólny interwał 1 s, działający tylko, gdy pasek jest na stronie.
//
// Czas bierzemy przez useSyncExternalStore, nie przez useState+useEffect:
// serwer nie zna zegara klienta, więc snapshot serwerowy to „brak czasu"
// (null) i hydratacja nie ma czego porównywać — bez ostrzeżeń o niezgodności.
function subscribe(onTick: () => void): () => void {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const getNowSecond = () => Math.floor(Date.now() / 1000);
const getServerSecond = () => null;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export default function ChristmasCountdown() {
  const locale = useClientLocale();
  const t = getDictionary(locale).product;
  const nowSecond = useSyncExternalStore<number | null>(subscribe, getNowSecond, getServerSecond);

  const parts = nowSecond === null ? null : christmasCountdown(nowSecond * 1000);
  // Klient doczekał końca terminu z otwartą kartą — obietnica już nie
  // obowiązuje, więc pasek znika od razu, bez odświeżania strony.
  if (nowSecond !== null && parts === null) return null;

  const units: { key: string; value: string; label: string }[] = [
    {
      key: "d",
      value: parts ? String(parts.days) : "--",
      label: parts?.days === 1 ? t.christmasDayOne : t.christmasDays,
    },
    { key: "h", value: parts ? pad(parts.hours) : "--", label: t.christmasHours },
    { key: "m", value: parts ? pad(parts.minutes) : "--", label: t.christmasMinutes },
    { key: "s", value: parts ? pad(parts.seconds) : "--", label: t.christmasSeconds },
  ];

  return (
    <div
      data-testid="christmas-countdown"
      className="xmas-bar relative overflow-hidden mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-gold)] px-3.5 py-3"
    >
      <div className="min-w-0 flex-[1_1_170px]">
        <p className="font-sans text-sm font-semibold leading-snug text-[var(--fg)]">{t.christmasTitle}</p>
        <p className="font-sans text-[13px] leading-snug text-[var(--muted)]">{t.christmasSubtitle}</p>
      </div>
      {/* aria-hidden: cyfry zmieniają się co sekundę, a termin jest już w
          tekście obok — czytnik ekranu nie ma tego odczytywać w kółko. */}
      <div aria-hidden className="flex gap-1.5">
        {units.map((u) => (
          <div
            key={u.key}
            className="w-[46px] h-[50px] overflow-hidden rounded-lg bg-[var(--color-navy)] border border-[var(--color-gold)]/40 flex flex-col items-center justify-center"
          >
            {/* key = wartość: zmiana cyfry montuje element na nowo i CSS sam
                odtwarza animację „wskoczenia" — bez JS-owego sterowania klasą. */}
            <b
              key={u.value}
              className="xmas-digit block font-sans text-[19px] leading-[1.1] font-bold tabular-nums text-[var(--color-cream)]"
            >
              {u.value}
            </b>
            <span className="font-sans text-[10px] leading-tight uppercase tracking-wider text-[var(--color-gold-light)]">
              {u.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
