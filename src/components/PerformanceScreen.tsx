import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Target, Clock, BrainCircuit, Sparkles } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiGet } from '../lib/apiClient';
import { cn } from '../lib/utils';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { EmptyState } from './ui/EmptyState';

interface Overview {
  total_attempted: number;
  total_correct: number;
  accuracy: number;
  total_time_ms: number;
  sessions_completed: number;
}

interface TrendPoint {
  session_id: string;
  mode: string;
  accuracy: number;
  finished_at: string;
}

function formatHours(ms: number): { h: number; m: number } {
  const totalMin = Math.round(ms / 60000);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

export function PerformanceScreen({
  onBack,
  yearLevel,
  semester,
}: {
  onBack: () => void;
  yearLevel?: number;
  semester?: number;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'period' | 'all'>('period');

  // Build the period query suffix only when scope === 'period' AND we actually
  // have a current period from the profile. In 'all' mode we drop it entirely.
  const periodQs = useMemo(() => {
    if (scope !== 'period') return '';
    const parts: string[] = [];
    if (yearLevel != null) parts.push(`year_level=${yearLevel}`);
    if (semester != null) parts.push(`semester=${semester}`);
    return parts.length ? `&${parts.join('&')}` : '';
  }, [scope, yearLevel, semester]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<Overview>(`/api/analytics/overview?${periodQs.replace(/^&/, '')}`),
      apiGet<TrendPoint[]>(`/api/analytics/accuracy-trend?limit=10${periodQs}`),
    ])
      .then(([o, t]) => {
        if (!cancelled) {
          setOverview(o);
          setTrend(t);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodQs]);

  const chartData = useMemo(
    () =>
      trend.map((p, i) => ({
        name: `S${i + 1}`,
        accuracy: Math.round(p.accuracy * 100),
      })),
    [trend]
  );

  const time = overview ? formatHours(overview.total_time_ms) : { h: 0, m: 0 };

  if (loading) {
    return (
      <div className="flex-1 w-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 w-full flex items-center justify-center px-4">
        <div className="max-w-md py-8 px-6 rounded-2xl border text-sm text-center bg-[color:var(--danger-bg)] border-[color:var(--danger-border)] text-[color:var(--danger-text)]">
          Couldn’t load analytics: {error}
        </div>
      </div>
    );
  }

  const empty = !overview || overview.total_attempted === 0;

  return (
    <div className="flex-1 w-full flex justify-center py-6 md:py-12 px-4 h-full overflow-y-auto">
      <div className="w-full max-w-5xl space-y-8 animate-fade-in pb-12">
        <header className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-bg-surface border border-border-subtle flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-display italic text-text-primary leading-tight">Performance Overview</h1>
            <p className="text-sm md:text-base text-text-secondary mt-1">Analyze your progress and identify areas for improvement.</p>
          </div>
          {(yearLevel != null || semester != null) && (
            <div
              role="tablist"
              aria-label="Period scope"
              className="hidden sm:inline-flex bg-bg-surface border border-border-subtle rounded-full p-1 text-xs font-semibold"
            >
              {(['period', 'all'] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={scope === k}
                  onClick={() => setScope(k)}
                  className={cn(
                    'px-3 py-1.5 rounded-full transition-colors',
                    scope === k ? 'bg-accent text-slate-950' : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  {k === 'period' ? 'This semester' : 'All-time'}
                </button>
              ))}
            </div>
          )}
        </header>
        {(yearLevel != null || semester != null) && (
          <div className="sm:hidden flex justify-center">
            <div role="tablist" aria-label="Period scope" className="inline-flex bg-bg-surface border border-border-subtle rounded-full p-1 text-xs font-semibold">
              {(['period', 'all'] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={scope === k}
                  onClick={() => setScope(k)}
                  className={cn(
                    'px-3 py-1.5 rounded-full transition-colors',
                    scope === k ? 'bg-accent text-slate-950' : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  {k === 'period' ? 'This semester' : 'All-time'}
                </button>
              ))}
            </div>
          </div>
        )}

        {empty ? (
          <EmptyState
            icon={Sparkles}
            title="No data yet"
            description="Take your first session to start tracking your performance here."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              <Card variant="default" padding="md" className="flex flex-col gap-4 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-[0.07] group-hover:opacity-15 transition-opacity text-accent">
                  <Target className="w-24 h-24" />
                </div>
                <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-[0.18em] relative z-10">Total Questions</p>
                <h3 className="text-4xl font-bold text-text-primary relative z-10">
                  {overview.total_attempted.toLocaleString()}
                </h3>
                <div className="flex items-center gap-2 text-sm text-text-tertiary relative z-10 mt-auto pt-4">
                  <span>{overview.total_correct.toLocaleString()} correct</span>
                </div>
              </Card>
              <Card variant="default" padding="md" className="flex flex-col gap-4 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-[0.07] group-hover:opacity-15 transition-opacity text-accent">
                  <BrainCircuit className="w-24 h-24" />
                </div>
                <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-[0.18em] relative z-10">Average Accuracy</p>
                <h3 className="text-4xl font-bold text-text-primary relative z-10">
                  {Math.round(overview.accuracy * 100)}%
                </h3>
                <div className="flex items-center gap-2 text-sm text-text-tertiary relative z-10 mt-auto pt-4">
                  <span>across all sessions</span>
                </div>
              </Card>
              <Card variant="default" padding="md" className="flex flex-col gap-4 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-[0.07] group-hover:opacity-15 transition-opacity text-accent">
                  <Clock className="w-24 h-24" />
                </div>
                <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-[0.18em] relative z-10">Time Learning</p>
                <h3 className="text-4xl font-bold text-text-primary relative z-10">
                  {time.h}
                  <span className="text-2xl text-text-tertiary">h</span> {time.m}
                  <span className="text-2xl text-text-tertiary">m</span>
                </h3>
                <div className="flex items-center gap-2 text-sm text-text-tertiary relative z-10 mt-auto pt-4">
                  <span>Across {overview.sessions_completed} session{overview.sessions_completed === 1 ? '' : 's'}</span>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <Card variant="default" padding="md" className="flex flex-col">
                <div className="mb-6">
                  <h2 className="text-xl font-display italic text-text-primary">Accuracy Trend</h2>
                  <p className="text-sm text-text-secondary">Your performance over your last {chartData.length} session{chartData.length === 1 ? '' : 's'}</p>
                </div>
                <div className="flex-1 min-h-[300px] w-full">
                  {chartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-text-tertiary">
                      Finish a session to see your trend.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorAccuracy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                        <XAxis dataKey="name" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                        <YAxis stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} dx={-10} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--bg-sunken)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          }}
                          itemStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
                          labelStyle={{ color: 'var(--text-secondary)' }}
                        />
                        <Area type="monotone" dataKey="accuracy" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorAccuracy)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
