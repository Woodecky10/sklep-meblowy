"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { removeOgImage, updateOgImage } from "./actions";

// Karta „Zdjęcie do udostępnień" w /admin/wyglad.
//
// Podgląd jest w PROPORCJI 1200×630 (kadr Facebooka), nie w proporcji zdjęcia —
// żeby od razu było widać, co zostanie ucięte. Slajd hero ma 3:2, więc przy
// wejściu w ten kadr znika ~21% wysokości; bez podglądu w docelowych
// proporcjach to niespodzianka dopiero po wklejeniu linku.

// Satori (renderer og:image) rasteryzuje wyłącznie JPEG i PNG — na WebP i AVIF
// wywala się i kafelek znika z CAŁEGO sklepu. Zamiast odsyłać Olę z takim
// plikiem, konwertujemy w przeglądarce: `browser-image-compression` przepuszcza
// wszystko, co przeglądarka umie zdekodować, i oddaje JPEG.
const TARGET_TYPE = "image/jpeg";
// Kafelek renderuje się w 1200 px szerokości. 2000 px daje zapas na kadrowanie
// (zdjęcie pionowe traci na szerokość), a i tak schodzi z wagi pliku.
const MAX_DIMENSION = 2000;

export default function OgImageCard({ initialUrl }: { initialUrl: string | null }) {
  const [savedUrl, setSavedUrl] = useState<string | null>(initialUrl);
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, startAction] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirm = useConfirm();
  const router = useRouter();

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Zwolnij obiekt URL podglądu, żeby nie przeciekał przy kolejnych wyborach.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function flash(next: NonNullable<Toast>) {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;

    setPreparing(true);
    try {
      const imageCompression = (await import("browser-image-compression")).default;
      // Konwersja jest BEZWARUNKOWA (także dla małych plików) — jej celem jest
      // format, nie waga. Pominięcie jej dla lekkiego WebP przepuściłoby plik,
      // na którym render kafelka się wywala.
      const converted = await imageCompression(picked, {
        maxSizeMB: 1,
        maxWidthOrHeight: MAX_DIMENSION,
        useWebWorker: true,
        fileType: TARGET_TYPE,
        initialQuality: 0.85,
      });
      const named = new File([converted], "og.jpg", { type: TARGET_TYPE });
      setFile(named);
      setLocalPreview(URL.createObjectURL(named));
    } catch {
      flash({
        type: "error",
        message: "Nie udało się przygotować zdjęcia. Spróbuj innego pliku.",
      });
    } finally {
      setPreparing(false);
    }
  }

  function handleSave() {
    if (!file) return;
    startAction(async () => {
      const fd = new FormData();
      fd.set("image", file, file.name);
      const res = await updateOgImage(fd);
      if (res.ok) {
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        flash({ type: "success", message: res.message ?? "Zapisano" });
        router.refresh();
      } else {
        flash({ type: "error", message: res.error });
      }
    });
  }

  function handleRemove() {
    startAction(async () => {
      const ok = await confirm({
        title: "Usunąć zdjęcie udostępnień?",
        message:
          "Kafelek na Facebooku wróci wtedy do zdjęcia z pierwszego slajdu na stronie głównej.",
        confirmLabel: "Usuń",
      });
      if (!ok) return;
      const res = await removeOgImage();
      if (res.ok) {
        setSavedUrl(null);
        setFile(null);
        setLocalPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        flash({ type: "success", message: res.message ?? "Usunięto" });
        router.refresh();
      } else {
        flash({ type: "error", message: res.error });
      }
    });
  }

  const shown = localPreview ?? savedUrl;

  return (
    <>
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}
      <Card>
        <h2 className="font-display text-xl text-[var(--fg)] mb-1">Zdjęcie do udostępnień</h2>
        <p className="text-sm text-[var(--muted)] mb-5 leading-relaxed">
          To zdjęcie widać, gdy ktoś wklei link do sklepu na Facebooku, w Messengerze
          czy na WhatsAppie. Najlepiej działa zdjęcie mebla we wnętrzu — nazwę sklepu
          Facebook dopisuje sam pod obrazkiem, więc napisy na zdjęciu nie są potrzebne.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <Field
              label="Wybierz zdjęcie"
              hint="Dowolny format z aparatu lub telefonu — przygotujemy je automatycznie."
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={preparing || busy}
                className="w-full text-sm text-[var(--fg)] file:mr-3 file:px-4 file:py-2 file:rounded-full file:border file:border-[var(--border)] file:bg-[var(--card-bg)] file:text-[var(--fg)] file:text-xs file:font-sans file:uppercase file:tracking-widest file:cursor-pointer hover:file:border-[var(--color-gold)]"
              />
            </Field>

            {preparing && (
              <p className="text-xs text-[var(--color-gold)]">Przygotowuję zdjęcie…</p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!file || preparing || busy}
                className="px-5 py-2.5 rounded-full bg-[var(--color-navy)] text-[var(--color-cream)] text-xs font-sans uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              >
                {busy ? "Zapisuję…" : "Zapisz zdjęcie"}
              </button>
              {savedUrl && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={busy}
                  className="px-5 py-2.5 rounded-full border border-[var(--border)] text-[var(--fg)] text-xs font-sans uppercase tracking-widest disabled:opacity-40 hover:border-[var(--color-gold)]"
                >
                  Usuń zdjęcie
                </button>
              )}
            </div>

            {!savedUrl && (
              <p className="text-xs text-[var(--muted)] leading-snug">
                Nie wybrano zdjęcia — kafelek pokazuje teraz zdjęcie z pierwszego
                slajdu na stronie głównej. Zmiana kolejności slajdów zmieni więc
                także to, co widać na Facebooku.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
              Tak zobaczy to Facebook
            </span>
            {/* Kadr 1200×630 — dokładnie ten, który wytnie renderer. */}
            <div className="relative aspect-[1200/630] rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--color-navy)]">
              {shown ? (
                <Image
                  src={shown}
                  alt="Podgląd kafelka udostępnień"
                  fill
                  sizes="600px"
                  className="object-cover"
                  // Podgląd bywa `blob:` (świeżo wybrany plik) — optymalizator
                  // Next nie potrafi go pobrać.
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-center px-6">
                  <span className="text-xs text-[var(--color-cream)] opacity-70">
                    Brak zdjęcia — kafelek weźmie pierwszy slajd ze strony głównej
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--muted)] leading-snug">
              Zdjęcie jest przycinane do tego kadru od środka — to, co wystaje poza
              ramkę, nie będzie widoczne.
            </p>
          </div>
        </div>

        <p className="text-xs text-[var(--muted)] mt-5 leading-snug border-t border-[var(--border)] pt-4">
          Po zmianie Facebook przez jakiś czas pokazuje stary obrazek z własnej
          pamięci. Żeby zobaczyć nowy od razu, wklej adres sklepu w narzędziu
          &bdquo;Sharing Debugger&rdquo; na developers.facebook.com i kliknij
          &bdquo;Scrape Again&rdquo;.
        </p>
      </Card>
    </>
  );
}
