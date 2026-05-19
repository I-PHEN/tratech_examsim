import { Fragment } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { cn } from '../../lib/utils';

const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];

// Tailwind-styled element overrides so markdown matches the surrounding UI
// instead of pulling in default browser styles.
const blockComponents: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
  img: ({ src, alt }) => {
    const ok =
      typeof src === 'string' && /^(https?:|data:image\/)/i.test(src);
    if (!ok) {
      // Unresolved OCR placeholder (e.g. ![](img-0.jpeg)) — never show a
      // broken image; published questions attach the real diagram as an asset.
      return (
        <span className="inline-flex items-center gap-1 text-xs text-text-tertiary border border-border-subtle rounded px-1.5 py-0.5 align-middle">
          🖼 diagram{alt ? ` — ${alt}` : ''}
        </span>
      );
    }
    return (
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        className="my-2 max-h-80 rounded-xl border border-border-subtle"
      />
    );
  },
  code: ({ children }) => (
    <code className="font-mono text-[0.9em] bg-bg-sunken border border-border-subtle rounded px-1 py-0.5">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto bg-bg-sunken border border-border-subtle rounded-lg p-3 text-sm">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border-subtle px-2 py-1 text-left font-bold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-border-subtle px-2 py-1">{children}</td>
  ),
};

// Inline variant: unwrap the top-level paragraph so the content drops cleanly
// into option chips, table cells, and inline answer slots.
const inlineComponents: Components = {
  ...blockComponents,
  p: ({ children }) => <Fragment>{children}</Fragment>,
};

/**
 * Renders admin-curated Markdown + LaTeX (KaTeX) text. Raw HTML is intentionally
 * NOT enabled (no rehype-raw), so no extra sanitizer is needed.
 */
export function RichText({
  children,
  className,
  inline = false,
}: {
  children: string | null | undefined;
  className?: string;
  inline?: boolean;
}) {
  if (!children || !children.trim()) return null;

  const md = (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={inline ? inlineComponents : blockComponents}
    >
      {children}
    </ReactMarkdown>
  );

  if (inline) {
    return <span className={cn('rich-text', className)}>{md}</span>;
  }
  return <div className={cn('rich-text', className)}>{md}</div>;
}
