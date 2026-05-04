import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "tlvgsddpiikolgdwuwmc.supabase.co" },
      // BaseLinker — CDN ze zdjęciami produktów synchronizowanych z BL
      { protocol: "https", hostname: "upload.cdn.baselinker.com" },
      { protocol: "https", hostname: "*.cdn.baselinker.com" },
    ],
  },
  // Server Actions: domyślny limit 1MB to za mało na zdjęcia z telefonu.
  // Klient kompresuje do ~1MB przed uploadem, ale 10MB to bezpieczny zapas
  // gdyby kompresja nie zadziałała (np. PNG z dużą paletą).
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

