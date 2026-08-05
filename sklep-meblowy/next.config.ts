import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Optymalizator obrazów Vercela (/_next/image) jest WŁĄCZONY — plan Pro
    // (od 2026-08-05). Wcześniej stało tu `unoptimized: true`, bo limit planu
    // Hobby powodował 402 (OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED) i część
    // zdjęć się nie ładowała. Gdyby limit znów kiedyś zaczął boleć, to jest
    // miejsce do wyłączenia — ale wtedy patrz na komponenty niżej, bo część
    // wróciła z <img> na next/image właśnie dzięki tej zmianie.

    // WebP zamiast AVIF: dokumentacja Next 16 rekomenduje WebP do większości
    // zastosowań (AVIF koduje ~50% dłużej i mnoży wersje w cache przy tej
    // samej liczbie zdjęć). Zysk na wadze i tak bierze się głównie ze
    // skalowania do realnego rozmiaru, nie z samego formatu.
    formats: ["image/webp"],

    // 31 dni zamiast domyślnych 4h. Bezpieczne, bo ścieżki uploadu to
    // `${Date.now()}-${randomUUID()}.${ext}` (admin/*/actions.ts) — podmiana
    // zdjęcia tworzy NOWY URL, więc pod danym adresem treść nigdy się nie
    // zmienia. Długi TTL wprost obcina liczbę ponownych transformacji, za
    // które Vercel liczy sobie na Pro.
    minimumCacheTTL: 2678400,

    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "tlvgsddpiikolgdwuwmc.supabase.co" },
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

