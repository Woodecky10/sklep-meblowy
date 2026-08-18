"use client";

import { useEffect, useState } from "react";
import { readCollapsed, writeCollapsed } from "@/app/_lib/section-collapse";
import { uploadProductImage } from "../actions";

export { compressIfNeeded } from "@/app/_lib/image-compress";

// Shared helpers dla ProductEditor i VariantsEditor.

export const inputClass =
  "w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:border-[var(--color-gold)] focus:outline-none";

export type Toast = { type: "success" | "error"; message: string } | null;

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

// Wspólny wrapper uploadu zdjęcia produktu dla RichTextEditor (opis produktu,
// sekcje opisu, tłumaczenia DE). Zachowuje komunikat błędu z server action,
// żeby edytor pokazał konkretny powód nieudanego uploadu.
export async function uploadProductImageFile(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.set("image", file, file.name);
  const res = await uploadProductImage(fd);
  if (!res.ok) return { ok: false, error: res.error };
  const url = (res.data as { url: string } | undefined)?.url;
  return url ? { ok: true, url } : { ok: false, error: "Brak URL po uploadzie" };
}

export function Field({
  label,
  hint,
  children,
  required,
  className,
  composite,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
  // Patrz bliźniak w app/admin/_shared.tsx — ten sam prop i ten sam powód:
  // `<label>` bez `for` aktywuje pierwszy etykietowalny element potomka, czyli
  // przy RichTextEditorze przycisk „Pogrubienie". Klikniecie w napis etykiety
  // pogrubiało zaznaczony tekst (zgłoszenie 2026-08-18).
  //
  // ⚠️ Ten `Field` jest DUPLIKATEM tego z app/admin/_shared.tsx — dokładnie tą
  // rozbieżnością, przed którą ostrzega komentarz na górze tamtego pliku.
  // Poprawka musiała wejść w OBA. Przy następnym dotknięciu tego modułu warto
  // je scalić, zamiast utrzymywać dwie kopie tej samej pułapki.
  composite?: boolean;
}) {
  const Wrapper = composite ? "div" : "label";
  return (
    <Wrapper className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-[var(--muted)]">{hint}</span>}
    </Wrapper>
  );
}

export function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-7 h-7 flex items-center justify-center rounded-full text-white transition-colors disabled:opacity-30 ${
        danger ? "bg-red-600/80 hover:bg-red-600" : "bg-white/20 hover:bg-white/30"
      }`}
    >
      {children}
    </button>
  );
}

// Zwijana sekcja edytora produktu. Renderuje standardową kartę z klikalnym
// nagłówkiem (chevron + tytuł). Stan zapamiętywany w localStorage per storageKey
// (wspólnie dla wszystkich produktów). Start rozwinięty (SSR-safe); po
// zamontowaniu ustawiany zapamiętany stan (możliwe jednoklatkowe mignięcie —
// akceptowalne w adminie). headerAside pozostaje widoczne także po zwinięciu;
// klik w akcję w headerAside nie zwija sekcji (osobny element, nie przycisk toggle).
export function CollapsibleSection({
  title,
  storageKey,
  headerAside,
  bodyClassName = "flex flex-col gap-5",
  children,
}: {
  title: string;
  storageKey: string;
  headerAside?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Sync z zapamiętanego stanu localStorage PO zamontowaniu. localStorage nie
    // istnieje przy SSR, a czytanie go w inicjalizatorze useState dałoby rozjazd
    // hydracji (serwer: rozwinięte, klient: zwinięte). To uzasadniony wyjątek od
    // reguły „nie wywołuj setState w efekcie".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readCollapsed(storageKey));
  }, [storageKey]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      writeCollapsed(storageKey, next);
      return next;
    });
  }

  return (
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 text-left"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-[var(--muted)] transition-transform ${collapsed ? "" : "rotate-90"}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
            {title}
          </h2>
        </button>
        {headerAside && <div className="shrink-0">{headerAside}</div>}
      </div>
      {/* Ukrywamy przez CSS (display:none), NIE odmontowujemy — zachowuje stan
          niekontrolowanych pól (defaultValue) w sekcji „Podstawowe dane" przy
          zwinięciu/rozwinięciu. */}
      <div className={collapsed ? "hidden" : bodyClassName}>{children}</div>
    </section>
  );
}
