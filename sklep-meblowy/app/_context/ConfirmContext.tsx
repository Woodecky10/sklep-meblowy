"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ConfirmDialog from "@/app/_components/ui/ConfirmDialog";

export type ConfirmOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ConfirmContext = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm musi być użyte wewnątrz <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; opts: ConfirmOptions }>({
    open: false,
    opts: { message: "" },
  });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const settle = useCallback((result: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false }));
    r?.(result);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    // Nowe wywołanie w trakcie otwartego dialogu: poprzednie → false.
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, opts });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={state.open}
        opts={state.opts}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}
