import { describe, it, expect } from 'vitest';
import { extractDiagrams, type OcrAssetRef } from './ingestionService';

function ref(over: Partial<OcrAssetRef>): OcrAssetRef {
  return {
    page_number: 1,
    img_id: 'img-0',
    storage_path: 'job/ocr-images/p1-img-0',
    mime: 'image/jpeg',
    ...over,
  };
}

describe('extractDiagrams', () => {
  it('matches a ref by exact img_id, strips placeholder, returns the ref', () => {
    const manifest = [ref({ img_id: 'img-0', storage_path: 'job/p1-img-0.jpeg' })];
    const text = 'Before\n\n![](img-0)\n\nAfter';
    const { cleaned, refs } = extractDiagrams(text, manifest, 1);
    expect(cleaned).not.toContain('![](img-0)');
    expect(cleaned).toContain('Before');
    expect(cleaned).toContain('After');
    expect(refs).toHaveLength(1);
    expect(refs[0].storage_path).toBe('job/p1-img-0.jpeg');
  });

  it('matches a ref by basename when img_id includes extension', () => {
    const manifest = [
      ref({ img_id: 'img-0.jpeg', storage_path: 'job/ocr-images/p1-img-0.jpeg' }),
    ];
    const text = 'See ![](img-0.jpeg) below.';
    const { cleaned, refs } = extractDiagrams(text, manifest, 1);
    expect(cleaned).not.toContain('![](img-0.jpeg)');
    expect(refs).toHaveLength(1);
    expect(refs[0].img_id).toBe('img-0.jpeg');
  });

  it('drops orphan placeholder and falls back to page-level diagrams', () => {
    const manifest = [
      ref({ page_number: 1, img_id: 'img-real', storage_path: 'job/p1-real.jpeg' }),
    ];
    const text = 'Question with ![](ghost.jpeg) reference.';
    const { cleaned, refs } = extractDiagrams(text, manifest, 1);
    expect(cleaned).not.toContain('![](ghost.jpeg)');
    expect(cleaned).not.toContain('ghost');
    expect(refs).toHaveLength(1);
    expect(refs[0].storage_path).toBe('job/p1-real.jpeg');
  });

  it('on mixed matched + orphan refs, strips both and dedupes page fallback', () => {
    const manifest = [
      ref({ page_number: 1, img_id: 'img-0', storage_path: 'job/p1-img-0.jpeg' }),
      ref({ page_number: 1, img_id: 'img-1', storage_path: 'job/p1-img-1.jpeg' }),
    ];
    const text = 'A ![](img-0) B ![](ghost) C';
    const { cleaned, refs } = extractDiagrams(text, manifest, 1);
    expect(cleaned).not.toContain('![](img-0)');
    expect(cleaned).not.toContain('![](ghost)');
    expect(cleaned).toContain('A');
    expect(cleaned).toContain('B');
    expect(cleaned).toContain('C');
    // matched ref + page-fallback for orphan, but the matched one is NOT
    // double-added by the fallback pass.
    const paths = refs.map((r) => r.storage_path).sort();
    expect(paths).toEqual(['job/p1-img-0.jpeg', 'job/p1-img-1.jpeg']);
  });

  it('returns text unchanged and empty refs when manifest is empty', () => {
    const text = 'No diagrams here ![](img-0).';
    const { cleaned, refs } = extractDiagrams(text, [], 1);
    expect(cleaned).toBe(text);
    expect(refs).toEqual([]);
  });

  it('attaches page diagrams when text has no refs but sourcePage is set', () => {
    const manifest = [
      ref({ page_number: 2, img_id: 'img-7', storage_path: 'job/p2-img-7.jpeg' }),
    ];
    const text = 'Plain question text with no image markers.';
    const { cleaned, refs } = extractDiagrams(text, manifest, 2);
    expect(cleaned).toBe('Plain question text with no image markers.');
    expect(refs).toHaveLength(1);
    expect(refs[0].storage_path).toBe('job/p2-img-7.jpeg');
  });

  it('matches by basename when placeholder target has a slash path', () => {
    const manifest = [
      ref({ img_id: 'img-0.jpeg', storage_path: 'job/ocr-images/p1-img-0.jpeg' }),
    ];
    const text = 'See ![](sub/dir/img-0.jpeg) below.';
    const { cleaned, refs } = extractDiagrams(text, manifest, 1);
    expect(cleaned).not.toContain('![](sub/dir/img-0.jpeg)');
    expect(refs).toHaveLength(1);
    expect(refs[0].storage_path).toBe('job/ocr-images/p1-img-0.jpeg');
  });

  it('strips orphan placeholder even with sourcePage null and no fallback possible', () => {
    const manifest = [
      ref({ page_number: 5, img_id: 'img-99', storage_path: 'job/p5-img-99.jpeg' }),
    ];
    const text = 'See diagram ![diagram](https://example.com/missing.png) here.';
    const { cleaned, refs } = extractDiagrams(text, manifest, null);
    expect(cleaned).not.toContain('![diagram]');
    expect(cleaned).not.toContain('missing.png');
    expect(refs).toEqual([]);
  });
});
