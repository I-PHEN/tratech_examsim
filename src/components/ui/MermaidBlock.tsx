import { useEffect, useMemo, useRef, useState } from 'react';

// Mermaid is ~500KB — load it lazily the first time a diagram appears so it
// never lands in the main bundle.
let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
const loadMermaid = () => (mermaidPromise ??= import('mermaid'));

// Mermaid's flowchart parser rejects unquoted parentheses / symbols inside node
// labels — `A[Charge (8 min)]` throws "Parse error". LLMs emit these constantly.
// We auto-quote every node label in flowchart/graph diagrams before rendering,
// turning `A[Charge (8 min)]` into `A["Charge (8 min)"]` so it always renders.
const FLOWCHART_SHAPES: ReadonlyArray<readonly [string, string]> = [
  ['[[', ']]'],
  ['[(', ')]'],
  ['([', '])'],
  ['((', '))'],
  ['{{', '}}'],
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['>', ']'],
];

const RISKY_LABEL = /[()[\]{}<>#&]/;

function quoteLabel(inner: string): string {
  const t = inner.trim();
  if (!t) return inner;
  // Already wrapped in quotes — leave it alone.
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return inner;
  // Nothing the parser would choke on — no need to touch it.
  if (!RISKY_LABEL.test(t)) return inner;
  return `"${t.replace(/"/g, '&quot;')}"`;
}

function isFlowchart(src: string): boolean {
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('%%')) continue;
    return /^(flowchart|graph)\b/.test(t);
  }
  return false;
}

/**
 * For flowchart/graph diagrams, quote every node label so unquoted parentheses
 * and symbols don't break the parser. A single linear scan: a shape opener is
 * only recognised directly after an identifier char (the node id), so labels,
 * `style`/`classDef` lines and edge syntax are left untouched.
 */
function prepareMermaid(src: string): string {
  if (!isFlowchart(src)) return src;
  let out = '';
  let i = 0;
  while (i < src.length) {
    const prev = out.length ? out[out.length - 1] : '';
    let matched = false;
    if (/[A-Za-z0-9_]/.test(prev)) {
      for (const [open, close] of FLOWCHART_SHAPES) {
        if (src.startsWith(open, i)) {
          const end = src.indexOf(close, i + open.length);
          if (end !== -1) {
            out += open + quoteLabel(src.slice(i + open.length, end)) + close;
            i = end + close.length;
            matched = true;
            break;
          }
        }
      }
    }
    if (!matched) {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

function DiagramSkeleton() {
  return (
    <div className="my-3 flex items-center justify-center rounded-xl border border-border-subtle bg-bg-raised px-3 py-6 text-xs text-text-tertiary">
      Rendering diagram…
    </div>
  );
}

/**
 * Renders a ```mermaid fenced block as an inline SVG diagram. Used only by
 * RichText. While the surrounding message is still streaming, partial mermaid
 * syntax throws on every keystroke, so we show a skeleton until the block is
 * complete. Any render error falls back to the raw code — never a crash.
 */
export function MermaidBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const idRef = useRef(`jude-mmd-${Math.random().toString(36).slice(2)}`);
  const trimmed = code.trim();
  const prepared = useMemo(() => prepareMermaid(trimmed), [trimmed]);

  useEffect(() => {
    if (streaming || !prepared) return;
    let cancelled = false;
    setError(false);
    loadMermaid()
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme:
            document.documentElement.getAttribute('data-theme') === 'dark'
              ? 'dark'
              : 'neutral',
        });
        const { svg } = await mermaid.render(idRef.current, prepared);
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [prepared, streaming]);

  if (streaming) return <DiagramSkeleton />;

  if (error) {
    return (
      <div className="my-2 overflow-hidden rounded-lg border border-border-subtle bg-bg-sunken">
        <div className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wide text-text-tertiary">
          Diagram source
        </div>
        <pre className="overflow-x-auto p-3 text-xs text-text-tertiary">{trimmed}</pre>
      </div>
    );
  }

  if (!svg) return <DiagramSkeleton />;

  return (
    <div
      className="my-3 flex justify-center overflow-x-auto rounded-xl border border-border-subtle bg-bg-raised p-3 [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
