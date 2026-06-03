import { Sigma, Thermometer, FlaskConical, Microscope, Activity } from 'lucide-react';
import { Topic } from '../../types';
import { cn } from '../../lib/utils';

function getIcon(name: string) {
  if (name.includes('Rate')) return Sigma;
  if (name.includes('Arrhenius')) return Thermometer;
  if (name.includes('Reactor')) return FlaskConical;
  if (name.includes('Enzyme')) return Microscope;
  return Activity;
}

const DIFFICULTY_VAR: Record<string, string> = {
  Easy: 'var(--success-text)',
  Medium: 'var(--warning-text)',
  Hard: 'var(--danger-text)',
};

export function TopicCard({
  topic,
  active,
  onClick,
  count,
  disabled = false,
}: {
  topic: Topic;
  active: boolean;
  onClick: () => void;
  /** Question count to display (e.g. filtered by difficulty). Defaults to the topic total. */
  count?: number;
  /** Greyed, non-clickable — e.g. no questions at the selected difficulty. */
  disabled?: boolean;
  key?: string | number;
}) {
  const Icon = getIcon(topic.name);
  const shownCount = count ?? topic.questionsCount ?? 0;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex flex-col p-4 rounded-2xl transition-[transform,opacity,box-shadow,background-color,border-color] duration-150 relative overflow-hidden text-left',
        disabled
          ? 'bg-bg-surface border border-border-subtle opacity-45 cursor-not-allowed'
          : active
          ? 'bg-accent-muted border-2 border-accent'
          : 'bg-bg-surface border border-border-subtle hover:border-border-medium hover:bg-bg-raised',
      )}
    >
      {active && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 blur-3xl rounded-full pointer-events-none" />
      )}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors',
            active
              ? 'bg-accent text-bg-page'
              : 'bg-bg-page text-text-tertiary group-hover:text-accent-text',
          )}
        >
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <h3 className="flex-1 text-sm font-semibold leading-snug text-text-primary line-clamp-2">
          {topic.name}
        </h3>
        {topic.difficulty && (
          <span
            className="w-2 h-2 shrink-0 rounded-full mt-1.5"
            style={{ backgroundColor: DIFFICULTY_VAR[topic.difficulty] }}
          />
        )}
      </div>

      <div className="mt-3">
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[11px] font-semibold tracking-[0.14em] uppercase">
            <span className={active ? 'text-accent-text' : 'text-text-tertiary'}>
              {shownCount} Questions
            </span>
            <span className={active ? 'text-accent-text' : 'text-text-tertiary'}>
              {topic.masteryState === 'scored'
                ? `${topic.mastery ?? 0}% Mastery`
                : topic.masteryState === 'in_progress'
                  ? 'In progress'
                  : 'Not started'}
            </span>
          </div>
          <div className="w-full h-1 bg-bg-sunken rounded-full overflow-hidden">
            <div
              style={{ width: topic.masteryState === 'scored' ? `${topic.mastery ?? 0}%` : topic.masteryState === 'in_progress' ? '12%' : '0%' }}
              className={cn(
                'h-full rounded-full transition-colors',
                topic.masteryState === 'scored'
                  ? active ? 'bg-accent' : 'bg-text-tertiary/40'
                  : 'bg-text-tertiary/20',
              )}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
