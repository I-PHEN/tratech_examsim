// Deterministic, loss-less question splitter (frontend mirror of the backend
// `partitionByQuestionNumber`). The concatenation of the output equals the
// input minus trimming — it never rewrites, drops, or truncates content.

const QUESTION_HEAD_RE =
  /^\s*(?:(?:Q(?:uestion)?\s*\.?\s*)?\d{1,3}\s*[.)\]:]|\(\s*\d{1,3}\s*\)|\[\s*\d{1,3}\s*\])/i;

/** Split on lines that look like a question header (Q1, 1., 1), (2), [3]). */
export function splitByQuestionNumber(text: string): string[] {
  const lines = text.split('\n');
  const starts: number[] = [];
  lines.forEach((ln, i) => {
    if (QUESTION_HEAD_RE.test(ln)) starts.push(i);
  });
  if (starts.length <= 1) return [text.trim()].filter(Boolean);

  const preamble = starts[0] > 0 ? lines.slice(0, starts[0]).join('\n').trim() : '';
  const segments: string[] = [];
  for (let k = 0; k < starts.length; k++) {
    const from = starts[k];
    const to = k + 1 < starts.length ? starts[k + 1] : lines.length;
    let block = lines.slice(from, to).join('\n').trim();
    if (k === 0 && preamble) block = `${preamble}\n\n${block}`;
    if (block) segments.push(block);
  }
  return segments;
}

/** Manual marker split: a line containing only dashes (`---`). */
export function splitByMarker(text: string): string[] {
  return text
    .split(/\n\s*-{3,}\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
