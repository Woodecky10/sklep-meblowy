"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_EUR_RATE } from "./eur-constants";

// Kurs PLN->EUR dostarczony z serwera (seed w root layout). Komponenty klienckie
// pokazujące ceny biorą go stąd, zamiast wołać DB.
const RateContext = createContext<number>(DEFAULT_EUR_RATE);

export function RateProvider({
  rate,
  children,
}: {
  rate: number;
  children: ReactNode;
}) {
  return <RateContext.Provider value={rate}>{children}</RateContext.Provider>;
}

export function useEurRate(): number {
  return useContext(RateContext);
}
