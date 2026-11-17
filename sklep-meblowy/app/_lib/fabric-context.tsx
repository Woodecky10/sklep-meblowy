"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FabricValueMeta } from "./variants";

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

// Mapa wartość „Nazwa Numer" → URL zdjęcia próbki, seedowana w root layout
// (getFabricImageMap). Używana przez VariantSelector do okrągłych próbek.
const FabricImageContext = createContext<Record<string, string>>({});

export function FabricImageProvider({
  map,
  children,
}: {
  map: Record<string, string>;
  children: ReactNode;
}) {
  return <FabricImageContext.Provider value={map}>{children}</FabricImageContext.Provider>;
}

export function useFabricImages(): Record<string, string> {
  return useContext(FabricImageContext);
}

// Mapa wartość wariantu → metadane tkaniny (slug, grupa cenowa) — seed na
// karcie produktu (getFabricMetaMap). Selektor grupuje próbki w karty grup.
const FabricMetaContext = createContext<Record<string, FabricValueMeta>>({});

export function FabricMetaProvider({
  map,
  children,
}: {
  map: Record<string, FabricValueMeta>;
  children: ReactNode;
}) {
  return <FabricMetaContext.Provider value={map}>{children}</FabricMetaContext.Provider>;
}

export function useFabricMeta(): Record<string, FabricValueMeta> {
  return useContext(FabricMetaContext);
}

// Dopłaty grup tkanin właściwe dla mebla (rozmiar do dopłat): id produktu →
// kod grupy → zł. Seed na karcie produktu dla produktu głównego i składników
// zestawów (groupSurchargesByProduct). Nagłówek grupy w selektorze bierze stąd
// kwotę produktu, który renderuje; brak wpisu = globalna z useFabricMeta.
const ProductGroupSurchargesContext = createContext<Record<string, Record<string, number>>>({});

export function ProductGroupSurchargesProvider({
  map,
  children,
}: {
  map: Record<string, Record<string, number>>;
  children: ReactNode;
}) {
  return (
    <ProductGroupSurchargesContext.Provider value={map}>{children}</ProductGroupSurchargesContext.Provider>
  );
}

export function useProductGroupSurcharges(): Record<string, Record<string, number>> {
  return useContext(ProductGroupSurchargesContext);
}
