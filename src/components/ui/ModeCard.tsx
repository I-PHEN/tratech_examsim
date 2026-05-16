import { LucideIcon } from 'lucide-react';

export function ModeCard({
  title,
  description,
  tag,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  tag: string;
  icon: LucideIcon;
  color?: 'primary' | 'secondary' | 'tertiary';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col text-left group bg-bg-surface rounded-2xl p-5 border border-border-subtle hover:border-border-medium hover:bg-bg-raised transition-[transform,opacity,box-shadow,background-color,border-color] duration-150 relative overflow-hidden h-auto"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-accent-hover opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex justify-between items-start mb-3">
        <div className="w-10 h-10 rounded-xl bg-bg-page text-accent flex items-center justify-center transition-transform duration-150 group-hover:scale-110">
          <Icon className="w-5 h-5" />
        </div>
        <span className="px-3 py-1 rounded-full bg-bg-page text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary border border-border-subtle">
          {tag}
        </span>
      </div>
      <h3 className="text-lg font-semibold mb-1.5 text-text-primary group-hover:translate-x-0.5 transition-transform">
        {title}
      </h3>
      <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">{description}</p>
    </button>
  );
}
