// Kompresja zdjęcia jeśli >800 KB (web worker, nie blokuje UI). Fallback: oryginał.
// Wspólne dla edytorów admina (VariantsEditor/ProductEditor) i modala reklamacji.
export async function compressIfNeeded(file: File): Promise<File> {
  if (file.size < 800 * 1024) return file;
  try {
    const imageCompression = (await import("browser-image-compression")).default;
    return await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 2400,
      useWebWorker: true,
      fileType: file.type === "image/png" ? "image/jpeg" : file.type,
      initialQuality: 0.82,
    });
  } catch (err) {
    console.error("Kompresja nieudana:", err);
    return file;
  }
}
