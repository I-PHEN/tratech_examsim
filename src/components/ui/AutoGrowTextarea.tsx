import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  maxHeightPx?: number;
};

export function AutoGrowTextarea({ maxHeightPx = 280, value, style, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
  }, [value, maxHeightPx]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      style={{ overflowY: 'auto', ...style }}
      {...rest}
    />
  );
}
