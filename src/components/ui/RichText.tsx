import { Fragment, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { cn } from '../../lib/utils';
import { MermaidBlock } from './MermaidBlock';
import { JudeStep, JudeTabs } from './JudeBlocks';

const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];

const CUSTOM_LANGS = /language-(mermaid|jude-step|jude-tabs)/;
const MAX_BLOCK_DEPTH = 2;

// Mermaid diagram-type keywords. The model frequently emits a diagram inside a
// bare ``` fence (no `mermaid` language tag); detecting the keyword on the first
// line lets us still render it as a diagram instead of a raw code block.
const MERMAID_KEYWORDS =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|xychart-beta|block-beta|sankey-beta)\b/;

function detectFenceLang(raw: string): 'mermaid' | null {
  // Multi-line guard so single-backtick inline code is never misread.
  if (!raw.includes('\n')) return null;
  const first = raw.replace(/^\s+/, '').split('\n', 1)[0].trim();
  return MERMAID_KEYWORDS.test(first) ? 'mermaid' : null;
}

/**
 * LLMs frequently emit math with the bracket delimiters `\( … \)` / `\[ … \]`
 * instead of the `$ … $` / `$$ … $$` form `remark-math` understands — the
 * bracket form then renders as literal text. Normalise it to dollar delimiters
 * so math always renders. Function replacers avoid `$`-escaping in `replace`.
 */
function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, inner) => `$$${inner}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, inner) => `$${inner}$`);
}

/**
 * While a message is still streaming, the markdown buffer can end mid-token —
 * an unclosed ``` fence corrupts the rest of the document and a dangling $$
 * breaks math. Balance/strip those so the partial render stays clean; the real
 * content snaps in as soon as the closing delimiter arrives.
 */
function closeOpenBlocks(text: string): string {
  let out = text;
  if (((out.match(/```/g) ?? []).length) % 2 === 1) out += '\n```';
  if (((out.match(/\$\$/g) ?? []).length) % 2 === 1) {
    out = out.slice(0, out.lastIndexOf('$$'));
  }
  return out;
}

function classOf(node: ReactNode): string {
  const child = Array.isArray(node) ? node[0] : node;
  if (child && typeof child === 'object' && 'props' in child) {
    return String((child as { props?: { className?: string } }).props?.className ?? '');
  }
  return '';
}

// Pulls the raw text content out of a <pre>'s child <code> element so the `pre`
// override can recognise an untagged mermaid fence and strip its chrome.
function rawOf(node: ReactNode): string {
  const child = Array.isArray(node) ? node[0] : node;
  if (child && typeof child === 'object' && 'props' in child) {
    const c = (child as { props?: { children?: unknown } }).props?.children;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((x) => (typeof x === 'string' ? x : '')).join('');
  }
  return '';
}

function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block my-2 cursor-zoom-in"
        aria-label="Click to zoom"
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="max-h-[60vh] w-auto rounded-xl border border-border-subtle"
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out"
        >
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[92vw] rounded-xl shadow-2xl cursor-default"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl leading-none flex items-center justify-center"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

// Tailwind-styled element overrides so markdown matches the surrounding UI
// instead of pulling in default browser styles. `streaming`/`depth` drive the
// custom fenced-block dispatch (mermaid + interactive Jude blocks).
function buildComponents(streaming: boolean, depth: number): Components {
  return {
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }) => <h1 className="mt-3 mb-2 text-base font-black first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-3 mb-2 text-sm font-black uppercase tracking-wide first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-bold first:mt-0">{children}</h3>,
    strong: ({ children }) => <strong className="font-bold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-border-medium pl-3 text-text-secondary">{children}</blockquote>
    ),
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
        {children}
      </a>
    ),
    img: ({ src, alt }) => {
      const ok = typeof src === 'string' && /^(https?:|data:image\/)/i.test(src);
      if (!ok) {
        // Unresolved OCR placeholder (e.g. ![](img-0.jpeg)) — never show a
        // broken image; published questions attach the real diagram as an asset.
        return (
          <span className="inline-flex items-center gap-1 text-xs text-text-tertiary border border-border-subtle rounded px-1.5 py-0.5 align-middle">
            🖼 diagram{alt ? ` — ${alt}` : ''}
          </span>
        );
      }
      return <ZoomableImage src={src} alt={alt ?? ''} />;
    },
    code: ({ className, children }) => {
      const lang = /language-([\w-]+)/.exec(className ?? '')?.[1];
      const raw = String(children ?? '');
      if (depth < MAX_BLOCK_DEPTH) {
        if (lang === 'mermaid' || detectFenceLang(raw) === 'mermaid')
          return <MermaidBlock code={raw} streaming={streaming} />;
        if (lang === 'jude-step') return <JudeStep raw={raw} depth={depth} />;
        if (lang === 'jude-tabs') return <JudeTabs raw={raw} depth={depth} />;
      }
      return (
        <code className="font-mono text-[0.9em] bg-bg-sunken border border-border-subtle rounded px-1 py-0.5">
          {children}
        </code>
      );
    },
    pre: ({ children }) => {
      // Custom blocks render themselves — strip the <pre> chrome around them.
      // This also covers an untagged ``` fence whose content is a mermaid diagram.
      const isMermaid =
        depth < MAX_BLOCK_DEPTH && detectFenceLang(rawOf(children)) === 'mermaid';
      if (CUSTOM_LANGS.test(classOf(children)) || isMermaid) {
        return <>{children}</>;
      }
      return (
        <pre className="my-2 overflow-x-auto bg-bg-sunken border border-border-subtle rounded-lg p-3 text-sm">
          {children}
        </pre>
      );
    },
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border-subtle px-2 py-1 text-left font-bold">{children}</th>
    ),
    td: ({ children }) => <td className="border border-border-subtle px-2 py-1">{children}</td>,
  };
}

/**
 * Renders Markdown + LaTeX (KaTeX). For the AI tutor it also renders ```mermaid
 * diagrams and the interactive `jude-step` / `jude-tabs` blocks. Raw HTML is
 * intentionally NOT enabled (no rehype-raw), so no extra sanitizer is needed.
 */
export function RichText({
  children,
  className,
  inline = false,
  streaming = false,
  depth = 0,
}: {
  children: string | null | undefined;
  className?: string;
  inline?: boolean;
  streaming?: boolean;
  depth?: number;
}) {
  if (!children || !children.trim()) return null;

  let source = normalizeMath(children);
  if (streaming) source = closeOpenBlocks(source);
  const base = buildComponents(streaming, depth);
  const components: Components = inline
    ? { ...base, p: ({ children }) => <Fragment>{children}</Fragment> }
    : base;

  const md = (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {source}
    </ReactMarkdown>
  );

  if (inline) {
    return <span className={cn('rich-text', className)}>{md}</span>;
  }
  return <div className={cn('rich-text', className)}>{md}</div>;
}
