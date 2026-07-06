"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

// Globalny system toastów (audyt 2026-06-11 LOW #11): spójne, nieblokujące
// powiadomienia zamiast natywnego alert(). Wcześniej każdy edytor admina miał
// własną kopię ToastView — to wspólna infra dla strony klienta (CartToast
// zostaje osobno, bo jest sprzężony z kontekstem koszyka).

export type ToastType = "success" | "error" | "info";

type ToastItem = { id: number; message: string; type: ToastType };

// Klasy obwódki + kropki per typ toasta — w jednej mapie zamiast zagnieżdżonych
// ternarów, spójnie z innymi mapami stylów w repo (np. ADMIN_STATUS_LABELS).
const TOAST_STYLES: Record<ToastType, { border: string; dot: string }> = {
  success: { border: "border-emerald-300 dark:border-emerald-800", dot: "bg-emerald-500" },
  error: { border: "border-red-300 dark:border-red-800", dot: "bg-red-500" },
  info: { border: "border-[var(--border)]", dot: "bg-[var(--color-gold)]" },
};

const ToastContext = createContext<
  ((message: string, type?: ToastType) => void) | null
>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast musi być użyte wewnątrz <ToastProvider>");
  return ctx;
}

const VISIBLE_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Monotoniczny licznik id — bez Date.now()/random (deterministyczny).
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((list) => [...list, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {/* bottom-24, żeby toasty siedziały NAD pływającym przyciskiem powrotu
          na górę (bottom-6 + h-12) i nie zasłaniały go */}
      <div
        className="fixed bottom-24 right-4 sm:right-6 z-[70] flex flex-col gap-2 w-[calc(100%-2rem)] sm:w-80"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const t = getDictionary(useClientLocale());
  const [visible, setVisible] = useState(false);

  // Fade-in po pierwszym paint, auto-hide, usunięcie po fade-out (jak CartToast).
  // Deps [toast.id, onDismiss] stabilne → timery ustawiają się raz na toast.
  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 20);
    const hide = setTimeout(() => setVisible(false), VISIBLE_MS);
    const remove = setTimeout(() => onDismiss(toast.id), VISIBLE_MS + 300);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, [toast.id, onDismiss]);

  const style = TOAST_STYLES[toast.type];

  return (
    <div
      role="status"
      className={`bg-[var(--card-bg)] border ${style.border} rounded-2xl shadow-2xl p-4 flex items-start gap-3 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      <span className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${style.dot}`} />
      <p className="flex-1 min-w-0 text-sm text-[var(--fg)]">{toast.message}</p>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(toast.id), 300);
        }}
        aria-label={t.common.close}
        className="shrink-0 -mr-1 -mt-1 w-6 h-6 flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
