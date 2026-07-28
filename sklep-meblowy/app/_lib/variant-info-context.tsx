"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { VariantInfoEntry } from "./variant-info";

// Mapa (opcja+wartosc) → {info, info_de}, seedowana serwerowo na karcie produktu.
const VariantInfoContext = createContext<Record<string, VariantInfoEntry>>({});

export function VariantInfoProvider({
  map,
  children,
}: {
  map: Record<string, VariantInfoEntry>;
  children: ReactNode;
}) {
  return <VariantInfoContext.Provider value={map}>{children}</VariantInfoContext.Provider>;
}

export function useVariantInfo(): Record<string, VariantInfoEntry> {
  return useContext(VariantInfoContext);
}
