// pdf.js ships its worker as a plain .mjs without types. lib/resume-extract.ts
// imports it only for its side effect of registering globalThis.pdfjsWorker.
declare module "pdfjs-dist/build/pdf.worker.min.mjs";
