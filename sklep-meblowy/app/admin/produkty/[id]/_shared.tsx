"use client";

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

// Kompresja zdjęcia jeśli >800 KB (wzór z SliderEditor).
// Web worker w tle, nie blokuje UI. Fallback: zwraca oryginał gdy padło.
export async function compressIfNeeded(file: File): Promise<File> {
  if (file.size < 800 * 1024) return file;
  try {
    const imageCompression = (await import("browser-image-compression")).default;
    const compressed = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 2400,
      useWebWorker: true,
      fileType: file.type === "image/png" ? "image/jpeg" : file.type,
      initialQuality: 0.82,
    });
    return compressed;
  } catch (err) {
    console.error("Kompresja nieudana:", err);
    return file;
  }
}
