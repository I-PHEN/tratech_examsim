import { memo, useEffect, useMemo, useRef, useState } from 'react';

// Mermaid is ~500KB — load it lazily the first time a diagram appears so it
// never lands in the main bundle.
let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
const loadMermaid = () => (mermaidPromise ??= import('mermaid'));

// Rendered SVGs are cached by (theme + source). mermaid.render does an expensive
// parse + layout, and the component re-mounts constantly (expanding a review
// row, navigating prev/next), so without this the same diagram re-renders every
// time. With it, a diagram is rendered once and reused instantly thereafter.
const svgCache = new Map<string, string>();
// mermaid.initialize is global; run it once per theme, not on every render.
let mermaidInitTheme: string | null = null;

const currentTheme = (): 'dark' | 'neutral' =>
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'neutral';

// Warm the (large) mermaid import ahead of time so the first diagram a user
// opens doesn't pay the network/parse cost on the click. Safe to call often.
export function preloadMermaid(): void {
  loadMermaid().catch(() => {});
}

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
function MermaidBlockImpl({ code, streaming }: { code: string; streaming?: boolean }) {
  const idRef = useRef(`jude-mmd-${Math.random().toString(36).slice(2)}`);
  const trimmed = code.trim();
  const prepared = useMemo(() => prepareMermaid(trimmed), [trimmed]);
  const theme = currentTheme();
  const cacheKey = `${theme}\n${prepared}`;
  // Synchronous cache hit → the diagram is on screen at first paint, no skeleton.
  const [svg, setSvg] = useState<string | null>(() =>
    prepared ? svgCache.get(cacheKey) ?? null : null
  );
  const [error, setError] = useState(false);
  // DEV-only diagnostic: time from mount to the diagram being ready.
  const [diagMs, setDiagMs] = useState<number | null>(null);

  useEffect(() => {
    if (streaming || !prepared) return;
    const cached = svgCache.get(cacheKey);
    if (cached) {
      setSvg(cached);
      if (import.meta.env.DEV) setDiagMs(0);
      return;
    }
    let cancelled = false;
    setError(false);
    const t0 = performance.now();
    loadMermaid()
      .then(async ({ default: mermaid }) => {
        if (mermaidInitTheme !== theme) {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
          mermaidInitTheme = theme;
        }
        const { svg: out } = await mermaid.render(idRef.current, prepared);
        svgCache.set(cacheKey, out);
        if (!cancelled) {
          setSvg(out);
          if (import.meta.env.DEV) setDiagMs(Math.round(performance.now() - t0));
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [prepared, streaming, theme, cacheKey]);

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
    <>
      {import.meta.env.DEV && diagMs != null && (
        <div className="inline-block text-[10px] font-mono text-sky-500 bg-sky-500/10 border border-sky-500/30 rounded px-1.5 py-0.5">
          🗺 diagram {diagMs}ms{diagMs === 0 ? ' (cached)' : ''}
        </div>
      )}
    <div
      className="my-3 flex justify-center overflow-x-auto rounded-xl border border-border-subtle bg-bg-raised p-3 [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
    </>
  );
}

// Memoised so a parent re-render never re-runs the (expensive, async) mermaid
// render unless the diagram source or streaming flag actually changes.
export const MermaidBlock = memo(MermaidBlockImpl);
