import type { MetadataRoute } from "next";
import { COMPANY } from "./_lib/company";

// Web App Manifest — ikona i nazwa przy „Dodaj do ekranu głównego" (Android/Chrome)
// oraz kolory paska/splash. Ikony (kremowy kafelek + monogram M) generowane z
// app/icon.svg do public/icon-192.png / icon-512.png. Next serwuje to jako
// /manifest.webmanifest i dokleja <link rel="manifest"> automatycznie.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${COMPANY.brandName} — meble tapicerowane`,
    short_name: COMPANY.brandName,
    description: "Polski producent mebli tapicerowanych premium.",
    start_url: "/",
    display: "standalone",
    background_color: "#ECE4D7",
    theme_color: "#1a1a2e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
