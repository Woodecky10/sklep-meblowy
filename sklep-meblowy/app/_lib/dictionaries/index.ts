import type { Locale } from "@/app/_lib/i18n";
import { pl, type PlShape } from "./pl";
import { de } from "./de";

// Public type: full PL-shaped dictionary with string leaves.
export type Dictionary = PlShape;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Deep-merge a partial override onto base (2-level nesting). */
function deepMerge(base: Dictionary, override: DeepPartial<Dictionary>): Dictionary {
  const result = {} as Record<string, Record<string, string>>;
  for (const section of Object.keys(base) as Array<keyof Dictionary>) {
    const baseSection = base[section] as Record<string, string>;
    const overrideSection = (override[section] ?? {}) as Record<string, string>;
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
