"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_RECHECK_DELAYS_MS } from "@/app/_lib/order-events";

// Renderowany TYLKO, gdy płatność online jest jeszcze w toku (shouldAwaitPayment).
// Odświeża dane strony z serwera; gdy notyfikacja P24 oznaczy zamówienie jako
// opłacone, serwer przestaje ten komponent renderować, a w jego miejsce pojawiają
// się PixelEventOnce / GaEventOnce — dopiero wtedy zakup idzie do Meta i GA4.
// Zmienia się też nagłówek z „Płatność w toku" na „Zamówienie przyjęte".
//
// Dodatkowo sprawdza przy powrocie na kartę: BLIK potwierdza się w aplikacji
// banku, więc klient często wraca tu po czasie dłuższym niż harmonogram.
export default function AwaitPayment() {
  const router = useRouter();

  useEffect(() => {
    let step = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (step >= PAYMENT_RECHECK_DELAYS_MS.length) return;
      timer = setTimeout(() => {
        step += 1;
        router.refresh();
        schedule();
      }, PAYMENT_RECHECK_DELAYS_MS[step]);
    };
    schedule();

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
