import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serwujemy zdjęcia jako oryginały wprost z CDN Supabase, z pominięciem
    // optymalizatora obrazów Vercela (/_next/image). Powód: na planie Hobby
    // optymalizator ma miesięczny limit — po jego przekroczeniu zwracał 402
    // (OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED) i część zdjęć się nie
    // ładowała. Zdjęcia są już kompresowane do ~1MB przy uploadzie, więc
    // podanie oryginału z CDN Supabase jest w pełni wystarczające.
    unoptimized: true,
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

