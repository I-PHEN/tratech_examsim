import 'dotenv/config';
import FormData from 'form-data';

const MISTRAL_API = 'https://api.mistral.ai/v1';

export interface OcrPage {
  page_number: number;
  text: string;
  images?: { id: string; base64: string }[];
}

function getKey(): string {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY not configured');
  return key;
}

/**
 * Decode an OCR image. Mistral returns `image_base64` either as a bare base64
 * string or a data URI. We recover the bytes and a best-effort MIME type
 * (from the data URI, else the image id's extension, else JPEG).
 */
export function decodeOcrImage(
  base64OrDataUrl: string,
  id: string
): { buffer: Buffer; mime: string } {
  let data = base64OrDataUrl;
  let mime = '';
  const m = /^data:([^;]+);base64,(.*)$/s.exec(base64OrDataUrl);
  if (m) {
    mime = m[1];
    data = m[2];
  }
  if (!mime) {
    const ext = (id.split('.').pop() ?? '').toLowerCase();
    mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
  }
  return { buffer: Buffer.from(data, 'base64'), mime };
}

async function callOcr(document: Record<string, unknown>): Promise<OcrPage[]> {
  const key = getKey();
  const res = await fetch(`${MISTRAL_API}/ocr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-ocr-latest', document, include_image_base64: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral OCR error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { pages: Array<{ index: number; markdown: string; images?: Array<{ id: string; image_base64: string }> }> };
  return (data.pages ?? []).map((p) => ({
    page_number: p.index + 1,
    text: p.markdown ?? '',
    ...(p.images && p.images.length > 0
      ? { images: p.images.map((img) => ({ id: img.id, base64: img.image_base64 })) }
      : {}),
  }));
}

export async function ocrPdf(pdfBuffer: Buffer): Promise<OcrPage[]> {
  const key = getKey();

  // 1. Upload PDF to Mistral Files API
  const fd = new FormData();
  fd.append('file', pdfBuffer, { filename: 'document.pdf', contentType: 'application/pdf' });
  fd.append('purpose', 'ocr');

  const uploadRes = await fetch(`${MISTRAL_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, ...fd.getHeaders() },
    body: fd.getBuffer(),
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Mistral file upload error ${uploadRes.status}: ${text}`);
  }
  const { id: fileId } = (await uploadRes.json()) as { id: string };

  try {
    // 2. Get signed URL
    const urlRes = await fetch(`${MISTRAL_API}/files/${fileId}/url?expiry=1`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!urlRes.ok) {
      const text = await urlRes.text();
      throw new Error(`Mistral signed URL error ${urlRes.status}: ${text}`);
    }
    const { url: signedUrl } = (await urlRes.json()) as { url: string };

    // 3. Run OCR
    return await callOcr({ type: 'document_url', document_url: signedUrl });
  } finally {
    // 4. Clean up temp file (best-effort)
    await fetch(`${MISTRAL_API}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => {});
  }
}

export async function ocrImage(base64: string, mimeType: string): Promise<OcrPage[]> {
  return callOcr({ type: 'image_url', image_url: `data:${mimeType};base64,${base64}` });
}
