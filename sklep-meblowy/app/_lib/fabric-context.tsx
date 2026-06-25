"use client";

import { createContext, useContext, type ReactNode } from "react";

// Mapa PL→DE nazw tkanin, seedowana z serwera w root layout (getFabricDeMap).
// Komponenty klienckie renderujące wartość wariantu „Tkanina" biorą ją stąd.
const FabricLabelContext = createContext<Record<string, string>>({});

export function FabricLabelProvider({
  map,
  children,
}: {
  map: Record<string, string>;
  children: ReactNode;
}) {
  return <FabricLabelContext.Provider value={map}>{children}</FabricLabelContext.Provider>;
}

export function useFabricLabels(): Record<string, string> {
  return useContext(FabricLabelContext);
}
