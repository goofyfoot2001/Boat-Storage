// Small preview pictures for documents: a shrunk copy of an image, or the first page of a PDF.
// Word, Excel and other files can't be drawn in a browser, so they get a colored type tile instead.

const THUMB_WIDTH = 160; // shown at about 40px wide; extra for sharp phone screens

/** Can we make a preview for this kind of file? */
export const canThumb = (mime: string | null | undefined) => !!mime && (mime === "application/pdf" || mime.startsWith("image/"));

/** A small JPEG preview, or null if this kind of file has none (or it couldn't be read). */
export async function makeDocThumb(file: Blob, mime: string | null | undefined): Promise<Blob | null> {
  try {
    if (mime === "application/pdf") return await pdfFirstPage(file);
    if (mime?.startsWith("image/")) return await shrink(await createImageBitmap(file));
  } catch {
    // An unreadable or password-protected file just gets the plain type tile.
  }
  return null;
}

async function pdfFirstPage(file: Blob) {
  // PDF.js is big, so it's only loaded the first time a PDF needs a preview.
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await pdf.getPage(1);
    const scale = THUMB_WIDTH / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return toJpeg(canvas);
  } finally {
    pdf.destroy();
  }
}

async function shrink(bitmap: ImageBitmap) {
  const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return toJpeg(canvas);
}

function toJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("no preview"))), "image/jpeg", 0.8));
}

/** Color for a file-type tile when there's no preview. */
export function typeColor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "#C0392B";
  if (["doc", "docx", "rtf", "odt", "pages", "txt"].includes(ext)) return "#2B5797";
  if (["xls", "xlsx", "csv", "ods", "numbers"].includes(ext)) return "#1E7145";
  if (["ppt", "pptx", "odp", "key"].includes(ext)) return "#D24726";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "#9B59B6";
  return "#5A6B80";
}
