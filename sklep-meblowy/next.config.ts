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
};

export default nextConfig;

