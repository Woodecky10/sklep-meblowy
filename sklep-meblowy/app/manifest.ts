import type { MetadataRoute } from "next";
import { COMPANY } from "@/app/_lib/company";

// Web App Manifest — ikona i nazwa przy „Dodaj do ekranu głównego" (Android/iOS).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: COMPANY.brandName,
    short_name: COMPANY.brandName,
    description: "Meble premium — sofy, narożniki, łóżka, fotele.",
    start_url: "/",
    display: "browser",
    background_color: "#ECE4D7",
    theme_color: "#ECE4D7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
