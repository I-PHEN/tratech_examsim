import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'default' | 'raised' | 'interactive';
type Padding = 'none' | 'sm' | 'md' | 'lg';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  padding?: Padding;
  children: ReactNode;
};

function variantClasses(variant: Variant): string {
  switch (variant) {
    case 'default':
      return 'bg-bg-surface border border-border-subtle';
    case 'raised':
      return 'bg-bg-raised border border-border-medium';
    case 'interactive':
      return 'bg-bg-surface border border-border-subtle hover:border-border-medium hover:bg-bg-raised cursor-pointer';
  }
}

function paddingClasses(p: Padding): string {
  switch (p) {
    case 'none':
      return '';
    case 'sm':
      return 'p-4';
    case 'md':
      return 'p-6';
    case 'lg':
      return 'p-6 md:p-8';
  }
}

export function Card({
  variant = 'default',
  padding = 'lg',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-2xl transition-[transform,opacity,box-shadow,background-color,border-color] duration-150',
        variantClasses(variant),
        paddingClasses(padding),
        className,
      )}
    >
      {children}
    </div>
  );
}
