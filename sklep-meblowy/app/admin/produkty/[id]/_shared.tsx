"use client";

export { compressIfNeeded } from "@/app/_lib/image-compress";

// Shared helpers dla ProductEditor i VariantsEditor.

export const inputClass =
  "w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:border-[var(--color-gold)] focus:outline-none";

export type Toast = { type: "success" | "error"; message: string } | null;

export function Field({
  label,
  hint,
  children,
  required,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-[var(--muted)]">{hint}</span>}
    </label>
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

