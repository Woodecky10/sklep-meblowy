// Czysta logika guarda niezapisanych zmian panelu admina — bez DOM, testowalna
// vitestem w node. Komponent UnsavedChangesGuard (app/admin) ekstrahuje fakty
// z DOM/zdarzeń do tych struktur i deleguje decyzje tutaj.
// Spec: docs/superpowers/specs/2026-07-06-admin-unsaved-guard-design.md

export type DirtyTargetInfo = {
  isFileInput: boolean;
  inIgnored: boolean;
  unitKind: "form" | "section" | null;
};

// Edycja oznacza jednostkę jako brudną tylko gdy: leży w jednostce śledzenia,
// nie jest uploadem pliku (zapisuje się sam) i nie leży w [data-guard-ignore]
// (wyszukiwarki, auto-zapisujące się sekcje).
export function shouldMarkDirty(info: DirtyTargetInfo): boolean {
  return info.unitKind !== null && !info.isFileInput && !info.inIgnored;
}

export type LinkClickInfo = {
  sameOrigin: boolean;
  samePageHash: boolean;
  modifier: boolean;
  targetBlank: boolean;
  hasDownload: boolean;
  mainButton: boolean;
};

// Przechwytujemy tylko zwykłą nawigację lewym przyciskiem do wewnętrznego URL.
// Nowa karta / download / kotwica nie porzucają stanu strony; obcy origin
// łapie beforeunload.
export function shouldInterceptLink(info: LinkClickInfo, dirtyCount: number): boolean {
  return (
    dirtyCount > 0 &&
    info.sameOrigin &&
    !info.samePageHash &&
    !info.modifier &&
    !info.targetBlank &&
    !info.hasDownload &&
    info.mainButton
  );
}

export const SETTLE_INTERVAL_MS = 150;
export const SETTLE_TIMEOUT_MS = 10_000;

export type SettleState = { consecutiveIdle: number; elapsedMs: number };

// Zapis „ustał", gdy 2 kolejne odczyty nie widzą świeżo-zablokowanych
// przycisków (edytory blokują przyciski na czas useTransition).
export function nextSettleState(
  prev: SettleState,
  anyStillSaving: boolean
): { state: SettleState; settled: boolean; timedOut: boolean } {
  const state: SettleState = {
    consecutiveIdle: anyStillSaving ? 0 : prev.consecutiveIdle + 1,
    elapsedMs: prev.elapsedMs + SETTLE_INTERVAL_MS,
  };
  return {
    state,
    settled: state.consecutiveIdle >= 2,
    timedOut: prev.elapsedMs >= SETTLE_TIMEOUT_MS,
  };
}

// Po „Zapisz i wyjdź": nawigujemy tylko gdy zapisy zakończone bez błędu.
// Toast błędu / niedokończona walidacja / timeout → zostajemy, żeby użytkownik
// widział co się stało (bez nawigacji w ciemno).
export function decideAfterSave(info: {
  errorToastVisible: boolean;
  anyStillDirty: boolean;
  timedOut: boolean;
}): "leave" | "stay" {
  if (info.errorToastVisible || info.anyStillDirty || info.timedOut) return "stay";
  return "leave";
}
