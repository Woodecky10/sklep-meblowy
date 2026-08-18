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
          "/probki",       // zamawianie próbek (loginwall — bot dostaje 307 na /logowanie)
          "/logowanie",
          "/rejestracja",
          "/reset-hasla",
          "/zapomnialem-hasla",
          "/opinia/",      // link z jednorazowym tokenem z maila
          "/api/",         // endpointy JSON
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
