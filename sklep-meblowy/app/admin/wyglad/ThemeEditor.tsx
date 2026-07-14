"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import {
  DEFAULT_THEME_SETTINGS,
  FONT_PAIRS,
  THEME_PRESETS,
  resolveThemeTokens,
  type FontPairKey,
  type ThemeOverrides,
  type ThemePresetKey,
  type ThemeSettings,
  type ThemeTokens,
} from "@/app/_lib/theme";
import { resetThemeSettings, updateThemeSettings } from "./actions";

// Tokeny → zmienne CSS scope'owane na kontener podglądu. Elementy w środku
// używają var(--...) tak samo jak realna strona — podgląd = prawdziwy render.
function cssVars(t: ThemeTokens): CSSProperties {
  return {
    "--color-navy": t.navy,
    "--color-navy-light": t.navyLight,
    "--color-gold": t.gold,
    "--color-gold-light": t.goldLight,
    "--color-cream": t.cream,
    "--color-gold-text": t.goldText,
    "--bg": t.bg,
    "--fg": t.fg,
    "--card-bg": t.cardBg,
    "--border": t.border,
    "--muted": t.muted,
  } as CSSProperties;
}

const OVERRIDE_FIELDS: { key: keyof ThemeOverrides; label: string; hint: string }[] = [
  { key: "navy", label: "Kolor główny (nagłówki, przyciski, stopka)", hint: "Domyślnie granat" },
  { key: "gold", label: "Kolor akcentu (linki, wyróżnienia, ceny)", hint: "Domyślnie złoto" },
  { key: "cream", label: "Tło strony", hint: "Domyślnie krem" },
];

export default function ThemeEditor({
  initialSettings,
}: {
  initialSettings: ThemeSettings;
}) {
  const [preset, setPreset] = useState<ThemePresetKey>(initialSettings.preset);
  const [overrides, setOverrides] = useState<ThemeOverrides>(initialSettings.overrides);
  const [fontPair, setFontPair] = useState<FontPairKey>(initialSettings.fontPair);
  const [toast, setToast] = useState<Toast>(null);
  const [saving, startSave] = useTransition();
  const confirm = useConfirm();
  const router = useRouter();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settings: ThemeSettings = { preset, overrides, fontPair };
  const tokens = resolveThemeTokens(settings);
  const fonts = FONT_PAIRS[fontPair];

  // Sprzątanie timera toasta przy odmontowaniu (brak setState po unmount).
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  function showToast(t: Toast) {
    // Kasujemy poprzedni timer — inaczej szybki drugi toast bywa zamykany
    // przedwcześnie przez timer poprzedniego.
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    if (t) toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  function save() {
    startSave(async () => {
      const res = await updateThemeSettings({
        preset,
        overrides: overrides as Record<string, string>,
        fontPair,
      });
      showToast(
        res.ok
          ? { type: "success", message: res.message ?? "Zapisano" }
          : { type: "error", message: res.error }
      );
      if (res.ok) router.refresh();
    });
  }

  async function reset() {
    const ok = await confirm({
      title: "Przywrócić domyślny wygląd?",
      message: "Motyw, kolory i fonty wrócą do ustawień początkowych (granat + złoto, Inter + Playfair).",
      danger: true,
    });
    if (!ok) return;
    startSave(async () => {
      const res = await resetThemeSettings();
      if (res.ok) {
        setPreset(DEFAULT_THEME_SETTINGS.preset);
        setOverrides({});
        setFontPair(DEFAULT_THEME_SETTINGS.fontPair);
        router.refresh();
      }
      showToast(
        res.ok
          ? { type: "success", message: res.message ?? "Przywrócono" }
          : { type: "error", message: res.error }
      );
    });
  }

  return (
    <div className="flex flex-col gap-8" data-guard-section>
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Wygląd</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Wybierz motyw kolorów i fonty całego sklepu. Podgląd poniżej pokazuje
          zmiany od razu — na sklep trafią dopiero po kliknięciu „Zapisz”.
        </p>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* ── Motywy ── */}
      <Card>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-4">Motyw kolorów</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.values(THEME_PRESETS).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPreset(p.key);
                setOverrides({}); // zmiana motywu czyści ręczne kolory
              }}
              aria-pressed={preset === p.key}
              className={`flex flex-col gap-3 p-4 rounded-2xl border text-left transition-colors ${
                preset === p.key
                  ? "border-[var(--color-gold)] ring-1 ring-[var(--color-gold)]"
                  : "border-[var(--border)] hover:border-[var(--color-gold)]"
              }`}
            >
              <span className="flex gap-1.5">
                <span className="w-8 h-8 rounded-full border border-black/10" style={{ background: p.light.navy }} />
                <span className="w-8 h-8 rounded-full border border-black/10" style={{ background: p.light.gold }} />
                <span className="w-8 h-8 rounded-full border border-black/10" style={{ background: p.light.bg }} />
              </span>
              <span className="text-sm font-semibold text-[var(--fg)]">{p.label}</span>
            </button>
          ))}
        </div>

        {/* ── Własne kolory ── */}
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-sans uppercase tracking-widest text-[var(--color-gold-text)]">
            Dostosuj pojedyncze kolory (opcjonalnie)
          </summary>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {OVERRIDE_FIELDS.map(({ key, label, hint }) => (
              <Field key={key} label={label} hint={hint}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={overrides[key] ?? THEME_PRESETS[preset].light[key]}
                    onChange={(e) => setOverrides({ ...overrides, [key]: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-[var(--border)] bg-transparent cursor-pointer"
                    aria-label={label}
                  />
                  {overrides[key] && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...overrides };
                        delete next[key];
                        setOverrides(next);
                      }}
                      className="text-xs text-[var(--muted)] hover:text-[var(--fg)] underline"
                    >
                      Wyczyść
                    </button>
                  )}
                </div>
              </Field>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)] mt-3">
            Czytelność tekstu jest chroniona automatycznie — odcień akcentu do
            tekstu przyciemniamy/rozjaśniamy, aż spełni normę kontrastu (WCAG AA).
          </p>
        </details>
      </Card>

      {/* ── Fonty ── */}
      <Card>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-4">Fonty</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(FONT_PAIRS) as [FontPairKey, (typeof FONT_PAIRS)[FontPairKey]][]).map(
            ([key, pair]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFontPair(key)}
                aria-pressed={fontPair === key}
                className={`p-4 rounded-2xl border text-left transition-colors ${
                  fontPair === key
                    ? "border-[var(--color-gold)] ring-1 ring-[var(--color-gold)]"
                    : "border-[var(--border)] hover:border-[var(--color-gold)]"
                }`}
              >
                <span className="block text-2xl text-[var(--fg)]" style={{ fontFamily: pair.display }}>
                  Meble Mollien
                </span>
                <span className="block text-sm text-[var(--muted)] mt-1" style={{ fontFamily: pair.sans }}>
                  Sofy, narożniki i łóżka premium. {pair.label}
                </span>
              </button>
            )
          )}
        </div>
      </Card>

      {/* ── Podgląd na żywo ── */}
      <Card>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-4">Podgląd</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PreviewPanel title="Tryb jasny" tokens={tokens.light} fonts={fonts} />
          <PreviewPanel title="Tryb ciemny" tokens={tokens.dark} fonts={fonts} />
        </div>
      </Card>

      {/* ── Akcje ── */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          data-guard-save
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz wygląd"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--fg)] underline"
        >
          Przywróć domyślne
        </button>
      </div>
    </div>
  );
}

// Makieta fragmentu strony w danym zestawie tokenów (scoped CSS vars).
function PreviewPanel({
  title,
  tokens,
  fonts,
}: {
  title: string;
  tokens: ThemeTokens;
  fonts: { sans: string; display: string };
}) {
  return (
    <div>
      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">{title}</p>
      <div
        style={{ ...cssVars(tokens), fontFamily: fonts.sans }}
        className="rounded-2xl overflow-hidden border border-[var(--border)]"
      >
        {/* Pasek nawigacji */}
        <div className="bg-[var(--color-navy)] text-white/85 text-xs px-4 py-2 flex justify-between">
          <span>kontakt@mollien.pl</span>
          <span>Polski producent mebli</span>
        </div>
        <div className="bg-[var(--bg)] p-5 flex flex-col gap-4">
          {/* Nagłówek sekcji */}
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-1">
              Kolekcje
            </p>
            <p className="text-xl font-bold text-[var(--fg)]" style={{ fontFamily: fonts.display }}>
              Znajdź swój styl
            </p>
          </div>
          {/* Karta produktu */}
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 max-w-[240px] mx-auto w-full">
            <div className="aspect-[4/3] rounded-lg bg-[var(--color-navy)] mb-3 flex items-center justify-center">
              <span className="text-[var(--color-gold)] text-2xl" style={{ fontFamily: fonts.display }}>M</span>
            </div>
            <p className="text-sm font-semibold text-[var(--fg)]" style={{ fontFamily: fonts.display }}>
              Sofa VEGAS
            </p>
            <p className="text-xs text-[var(--muted)]">Tkanina · 3 rozmiary</p>
            <p className="text-sm font-bold text-[var(--color-gold-text)] mt-1">3 299 zł</p>
          </div>
          {/* Dekoracyjny przycisk makiety — nieinteraktywny (span), poza tabem
              i pomijany przez czytniki (aria-hidden). */}
          <span
            aria-hidden="true"
            className="self-center px-5 py-2.5 bg-[var(--color-navy)] text-white text-xs uppercase tracking-widest rounded-full"
          >
            Przeglądaj kolekcję
          </span>
        </div>
      </div>
    </div>
  );
}
