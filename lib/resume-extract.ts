// Browser-only: turns an uploaded resume file into plain text.
//
// PRIVACY: everything here runs on the user's device. The file (a PDF, a
// Word document, or a photo of the resume) never leaves the browser and
// never reaches an LLM: it holds the name, phone and address in full. Only
// the structured result the user reviews and saves goes to the database.
//
// Each library is imported on demand, so pages that never upload a resume
// do not download them. OCR (tesseract.js) fetches its engine and English
// language data (~10 MB) from the jsDelivr CDN the first time; the browser
// caches it after that. The image itself is processed locally.

export type ExtractMethod = "text" | "pdf" | "docx" | "ocr";
export type ExtractProgress = { label: string; percent: number | null };
export type ExtractResult = { text: string; method: ExtractMethod };

export const ACCEPTED_RESUME_TYPES = ".pdf,.docx,.txt,.md,image/*";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** A text PDF with less than this is almost certainly a scan. */
const MIN_PDF_TEXT_CHARS = 80;
/** Resumes are 1-3 pages; OCR is slow, so stop there. */
const MAX_OCR_PAGES = 4;

export class ResumeExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeExtractError";
  }
}

export async function extractResumeText(file: File, onProgress: (p: ExtractProgress) => void = () => {}): Promise<ExtractResult> {
  if (file.size > MAX_FILE_BYTES) throw new ResumeExtractError("That file is larger than 15 MB. Try a smaller PDF or photo.");
  const name = file.name.toLowerCase();

  if (file.type === "application/pdf" || name.endsWith(".pdf")) return extractPdf(file, onProgress);
  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocx(file, onProgress);
  }
  if (name.endsWith(".doc") || file.type === "application/msword") {
    throw new ResumeExtractError("Old Word files (.doc) can't be read. In Word, use Save As > PDF or .docx, then upload that.");
  }
  if (file.type.startsWith("image/")) return { text: await ocr([file], onProgress), method: "ocr" };
  if (file.type.startsWith("text/") || /\.(txt|md)$/.test(name)) return { text: await file.text(), method: "text" };
  throw new ResumeExtractError("Use a PDF, Word (.docx), photo (JPG or PNG) or text file.");
}

async function extractDocx(file: File, onProgress: (p: ExtractProgress) => void): Promise<ExtractResult> {
  onProgress({ label: "Reading Word document…", percent: null });
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { text: value, method: "docx" };
}

async function extractPdf(file: File, onProgress: (p: ExtractProgress) => void): Promise<ExtractResult> {
  onProgress({ label: "Reading PDF…", percent: null });
  const pdfjs = await import("pdfjs-dist");
  // Run pdf.js on the main thread ("fake worker"): a resume is a few pages,
  // and this avoids serving a separate worker file through the bundler.
  const globals = globalThis as { pdfjsWorker?: unknown };
  globals.pdfjsWorker ??= await import("pdfjs-dist/build/pdf.worker.min.mjs");

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // hasEOL marks the end of a visual line; keeping line breaks keeps
      // headings like "Skills" on their own line for the parser.
      pages.push(content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : "")).join(""));
    }
    const text = pages.join("\n\n");
    if (text.replace(/\s+/g, "").length >= MIN_PDF_TEXT_CHARS) return { text, method: "pdf" };

    // A scanned PDF: render the pages and OCR them.
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, MAX_OCR_PAGES); i++) {
      onProgress({ label: `Preparing scanned page ${i}…`, percent: null });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 }); // ~150 dpi: enough for OCR
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      canvases.push(canvas);
    }
    return { text: await ocr(canvases, onProgress), method: "ocr" };
  } finally {
    await task.destroy();
  }
}

async function ocr(images: (File | HTMLCanvasElement)[], onProgress: (p: ExtractProgress) => void) {
  onProgress({ label: "Loading the text scanner (first time can take a minute)…", percent: null });
  const { createWorker } = await import("tesseract.js");
  let page = 0;
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        const label = images.length > 1 ? `Scanning page ${page + 1} of ${images.length}…` : "Scanning text…";
        onProgress({ label, percent: Math.round(((page + m.progress) / images.length) * 100) });
      } else if (m.status.startsWith("loading")) {
        onProgress({ label: "Downloading the text scanner (first time only)…", percent: Math.round(m.progress * 100) });
      }
    },
  });
  try {
    const texts: string[] = [];
    for (; page < images.length; page++) {
      const { data } = await worker.recognize(images[page]);
      texts.push(data.text);
    }
    return texts.join("\n\n");
  } finally {
    await worker.terminate();
  }
}
