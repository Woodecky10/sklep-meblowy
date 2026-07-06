"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isProductPath } from "@/app/_lib/routes";

// Widoczność paska zaufania w stopce: wszędzie POZA kartami produktu (tam
// jest już pod opisem). Children = zrenderowany serwerowo <TrustBar> — ten
// wrapper tylko decyduje o pokazaniu, TrustBar zostaje server componentem.
export default function FooterTrustBar({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isProductPath(pathname)) return null;
  return <>{children}</>;
}
