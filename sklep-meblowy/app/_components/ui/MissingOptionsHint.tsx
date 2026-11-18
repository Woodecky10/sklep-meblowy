"use client";

import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { MissingGroup } from "@/app/_lib/variant-missing";

type Props = {
  id: string;
  groups: MissingGroup[];
  attempted: boolean;
};

// Komunikat o brakujących opcjach: szary przed kliknięciem, czerwony po.
export default function MissingOptionsHint({ id, groups, attempted }: Props) {
  const locale = useClientLocale();
  const t = getDictionary(locale);
  if (groups.length === 0) return null;

  const prefix = attempted ? t.product.missingPrefix : t.product.toChoosePrefix;
  const cls = attempted
    ? "text-sm font-semibold text-red-600 dark:text-red-400"
    : "text-sm text-[var(--muted)]";
  const single = groups.length === 1 && !groups[0].title;

  return (
    <div
      id={id}
      data-testid="missing-options"
      data-attempted={attempted ? "true" : "false"}
      {...(attempted ? { role: "alert" } : {})}
      className={cls}
    >
      {single ? (
        <p>
          {prefix} {groups[0].labels.join(", ")}
        </p>
      ) : (
        <>
          <p>{prefix}</p>
          <ul>
            {groups.map((g, i) => (
              <li key={`${g.title ?? ""}-${i}`}>
                {g.title}: {g.labels.join(", ")}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
