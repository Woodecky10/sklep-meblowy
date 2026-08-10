import type { Locale } from "@/app/_lib/i18n";
import { pl, type PlShape } from "./pl";
import { de } from "./de";

// Public type: full PL-shaped dictionary with string leaves.
export type Dictionary = PlShape;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Deep-merge a partial override onto base (2-level nesting).
 *  Liście to zwykle stringi, ale nie zawsze — `home.aboutItems` jest tablicą
 *  obiektów, stąd `unknown` zamiast `string`. Test na `!== ""` dotyczy pustych
 *  stringów (mechanizm fallbacku DE → PL) i tablic nie dotyczy: tablica z DE
 *  podmienia całą tablicę z PL, co jest właściwym zachowaniem. */
function deepMerge(base: Dictionary, override: DeepPartial<Dictionary>): Dictionary {
  const result = {} as Record<string, Record<string, unknown>>;
  for (const section of Object.keys(base) as Array<keyof Dictionary>) {
    const baseSection = base[section] as Record<string, unknown>;
    const overrideSection = (override[section] ?? {}) as Record<string, unknown>;
    result[section] = { ...baseSection };
    for (const key of Object.keys(overrideSection)) {
      const val = overrideSection[key];
      if (val !== undefined && val !== "") {
        result[section][key] = val;
      }
    }
  }
  return result as Dictionary;
}

export function getDictionary(locale: Locale): Dictionary {
  if (locale === "pl") return pl;
  return deepMerge(pl, de);
}
