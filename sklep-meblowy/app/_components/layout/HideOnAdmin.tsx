"use client";

import { usePathname } from "next/navigation";

// Ukrywa publiczny chrome (TopBar/Navbar/Footer/CookieBanner) na trasach panelu
// admina. Serwerowe komponenty przekazywane jako children — client component
// tylko decyduje, czy je wyrenderować. usePathname działa też w SSR, więc na
// /admin chrome nie pojawia się nawet na pierwszej klatce (brak migotania).
export default function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = /(^|\/de)\/admin(\/|$)/.test(pathname ?? "");
  if (isAdmin) return null;
  return <>{children}</>;
}
