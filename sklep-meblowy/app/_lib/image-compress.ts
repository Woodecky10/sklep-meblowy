// Kompresja zdjęcia jeśli >800 KB. Fallback: oryginał.
// Wspólne dla edytorów admina (VariantsEditor/ProductEditor) i modala reklamacji.
// useWebWorker: false — worker ładowałby kod przez importScripts, co blokuje CSP
// (script-src 'strict-dynamic'). Na głównym wątku kompresja jest CSP-safe; koszt
// to chwilowe zajęcie UI przy wgrywaniu (admin-only, pomijalne).
export async function compressIfNeeded(file: File): Promise<File> {
  if (file.size < 800 * 1024) return file;
  try {
    const imageCompression = (await import("browser-image-compression")).default;
    return await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 2400,
      useWebWorker: false,
      fileType: file.type === "image/png" ? "image/jpeg" : file.type,
      initialQuality: 0.82,
    });
  } catch (err) {
    console.error("Kompresja nieudana:", err);
    return file;
  }
}

// Zdjęcie do PUBLICZNEJ opinii. Inaczej niż compressIfNeeded, przekodowanie
// jest BEZWARUNKOWE i nie ma fallbacku „zwróć oryginał" — z dwóch powodów,
// z których żaden nie dotyczy rozmiaru pliku:
//
// 1. EXIF z GPS-em. Zdjęcie z telefonu niesie współrzędne. W reklamacji ląduje
//    w panelu Julii; w opinii ląduje na STRONIE GŁÓWNEJ sklepu, czyli
//    opublikowalibyśmy adres domowy klientki. Przerysowanie przez canvas
//    metadane gubi, ale tylko wtedy, gdy faktycznie następuje — a
//    compressIfNeeded przepuszcza plik poniżej 800 KB nietknięty.
// 2. HEIC z iPhone'a. validateImageUpload przyjmuje wyłącznie JPG/PNG/WebP/AVIF,
//    więc bez konwersji klientka z iPhonem dostaje „nieprawidłowy format"
//    i nie doda nic (ten sam problem, co „zdjęcia się nie dodają" w panelu).
//
// Dlatego przy błędzie RZUCAMY zamiast zwracać oryginał: fallback przepuściłby
// jedno i drugie. Wołający ma pokazać komunikat, co zrobić.
export async function prepareReviewPhoto(file: File): Promise<File> {
  const imageCompression = (await import("browser-image-compression")).default;
  return await imageCompression(file, {
    maxSizeMB: 1,
    // 1600 px wystarcza na miniaturę na home, siatkę na /opinie i podgląd
    // w panelu; 2400 px z compressIfNeeded jest dla zdjęć produktowych admina.
    maxWidthOrHeight: 1600,
    // useWebWorker: false — worker ładowałby kod przez importScripts, co blokuje
    // CSP (script-src 'strict-dynamic'). Tak samo jak w compressIfNeeded.
    useWebWorker: false,
    fileType: "image/jpeg",
    initialQuality: 0.82,
  });
}
