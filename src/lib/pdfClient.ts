import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export interface PdfRenderProgress {
  page: number;
  totalPages: number;
}

export async function renderPdfToBlobs(
  file: File,
  options: { scale?: number; maxPages?: number; onProgress?: (p: PdfRenderProgress) => void } = {}
): Promise<Blob[]> {
  const scale = options.scale ?? 2.0;
  const buf = await file.arrayBuffer();

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const totalPages = options.maxPages ? Math.min(doc.numPages, options.maxPages) : doc.numPages;

  const blobs: Blob[] = [];
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!blob) throw new Error(`Failed to encode page ${pageNumber} as PNG`);
    blobs.push(blob);

    options.onProgress?.({ page: pageNumber, totalPages });

    page.cleanup();
  }

  await doc.cleanup();
  await doc.destroy();
  return blobs;
}
