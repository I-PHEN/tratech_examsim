import { useEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  maxHeightPx?: number;
};

export function AutoGrowTextarea({ maxHeightPx = 280, className, value, style, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
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
      className={cn(className)}
      style={{ overflowY: 'auto', ...style }}
      {...rest}
    />
  );
}
