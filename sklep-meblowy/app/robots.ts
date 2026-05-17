import type { MetadataRoute } from "next";
import { COMPANY } from "@/app/_lib/company";

// robots.txt — informuje crawlery co indeksować a co pomijać.
// Linkujemy też do sitemap.xml żeby Google szybciej znalazł listę URLi.
export default function robots(): MetadataRoute.Robots {
  const BASE = `https://${COMPANY.domain}`;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",       // panel admina
          "/konto/",       // strona konta klienta (loginwall)
          "/checkout/",    // payment flow
          "/koszyk",       // user-specific
          "/ulubione",     // loginwall
          "/logowanie",
          "/rejestracja",
          "/reset-hasla",
          "/zapomnialem-hasla",
          "/api/",         // endpointy JSON
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
