import { useEffect, useRef, useState } from 'react';

// Mermaid is ~500KB — load it lazily the first time a diagram appears so it
// never lands in the main bundle.
let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
const loadMermaid = () => (mermaidPromise ??= import('mermaid'));

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

  useEffect(() => {
    if (streaming || !trimmed) return;
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
        const { svg } = await mermaid.render(idRef.current, trimmed);
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [trimmed, streaming]);

  if (streaming) return <DiagramSkeleton />;

  if (error) {
    return (
      <pre className="my-2 overflow-x-auto rounded-lg border border-border-subtle bg-bg-sunken p-3 text-xs text-text-tertiary">
        {trimmed}
      </pre>
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
