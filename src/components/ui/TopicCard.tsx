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
}: {
  topic: Topic;
  active: boolean;
  onClick: () => void;
  key?: string | number;
}) {
  const Icon = getIcon(topic.name);

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col p-6 rounded-2xl transition-[transform,opacity,box-shadow,background-color,border-color] duration-150 relative overflow-hidden h-auto min-h-40 text-left',
        active
          ? 'bg-accent-muted border-2 border-accent'
          : 'bg-bg-surface border border-border-subtle hover:border-border-medium hover:bg-bg-raised',
      )}
    >
      {active && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 blur-3xl rounded-full pointer-events-none" />
      )}
      <div className="flex justify-between items-start mb-auto">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
            active
              ? 'bg-accent text-bg-page'
              : 'bg-bg-page text-text-tertiary group-hover:text-accent-text',
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        {topic.difficulty && (
          <span
            className="w-2 h-2 rounded-full mt-1"
            style={{ backgroundColor: DIFFICULTY_VAR[topic.difficulty] }}
          />
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-base font-semibold mb-4 leading-tight text-text-primary">
          {topic.name}
        </h3>
        <div className="pt-4 border-t border-border-subtle space-y-2">
          <div className="flex justify-between items-center text-[11px] font-semibold tracking-[0.14em] uppercase">
            <span className={active ? 'text-accent-text' : 'text-text-tertiary'}>
              {topic.questionsCount ?? 0} Questions
            </span>
            <span className={active ? 'text-accent-text' : 'text-text-tertiary'}>
              {topic.mastery ?? 0}% Mastery
            </span>
          </div>
          <div className="w-full h-1 bg-bg-sunken rounded-full overflow-hidden">
            <div
              style={{ width: `${topic.mastery ?? 0}%` }}
              className={cn(
                'h-full rounded-full transition-colors',
                active ? 'bg-accent' : 'bg-text-tertiary/40',
              )}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
