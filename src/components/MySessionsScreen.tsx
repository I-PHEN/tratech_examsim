import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Search, History, CheckCircle2, ChevronRight, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { StudyMode } from '../types';
import { apiDelete, apiGet } from '../lib/apiClient';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { EmptyState } from './ui/EmptyState';
import { Pill } from './ui/Pill';
import { Button } from './ui/Button';

interface ApiSession {
  id: string;
  mode: 'practice' | 'diagnostic' | 'midsem' | 'full_exam';
  total_questions: number;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  duration_ms: number | null;
  course_name: string | null;
  topic_name: string | null;
  accuracy: number | null;
}

const MODE_DISPLAY: Record<ApiSession['mode'], string> = {
  practice: 'PRACTICE',
  diagnostic: 'DIAGNOSTIC',
  midsem: 'MIDSEM',
  full_exam: 'FULL_EXAM',
};

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MySessionsScreen({ onBack, onReview }: { onBack: () => void; onReview: (id: string) => void }) {
  const [filterMode, setFilterMode] = useState<StudyMode | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const itemsPerPage = 5;

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete(`/api/sessions/${pendingDelete.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterMode, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<ApiSession[]>('/api/sessions?limit=50')
      .then((rows) => {
        if (!cancelled) setSessions(rows);
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
  }, []);

  const filteredHistory = useMemo(() => {
    return sessions
      .filter((session) => session.finished_at !== null)
      .filter((session) => {
        if (filterMode !== 'ALL' && MODE_DISPLAY[session.mode] !== filterMode) return false;
        const q = searchQuery.toLowerCase();
        if (q) {
          const course = (session.course_name ?? '').toLowerCase();
          const topic = (session.topic_name ?? '').toLowerCase();
          if (!course.includes(q) && !topic.includes(q)) return false;
        }
        return true;
      });
  }, [sessions, filterMode, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / itemsPerPage));
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex-1 w-full flex justify-center py-6 md:py-12 px-4 h-full overflow-y-auto">
      <div className="w-full max-w-4xl space-y-8 animate-fade-in pb-12">
        <header className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors hover:-translate-x-1 duration-200"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm">Back</span>
            </button>
            <Pill tone="neutral" icon={<History className="w-3.5 h-3.5" />}>
              Session history
            </Pill>
          </div>

          <div>
            <h1 className="text-3xl md:text-4xl leading-tight font-display italic text-text-primary mb-2">
              My Sessions
            </h1>
            <p className="text-text-secondary text-base">Review your past performance, analyze mistakes, and track your growth over time.</p>
          </div>
        </header>

        <Card variant="default" padding="none" className="flex flex-col md:flex-row gap-4 p-3">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search by course or topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-page border border-border-subtle rounded-xl py-3 pl-12 pr-4 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide shrink-0 items-center px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary mr-2 shrink-0">Filter by</span>
            {(['ALL', 'PRACTICE', 'DIAGNOSTIC', 'MIDSEM', 'FULL_EXAM'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode as StudyMode | 'ALL')}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border',
                  filterMode === mode
                    ? 'bg-accent text-slate-950 border-accent'
                    : 'bg-bg-surface text-text-secondary border-border-subtle hover:bg-bg-raised hover:text-text-primary hover:border-border-medium'
                )}
              >
                {mode.replace('_', ' ')}
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {loading ? (
            <Spinner size="md" className="py-20" />
          ) : error ? (
            <div className="py-8 px-6 rounded-2xl border text-sm bg-[color:var(--danger-bg)] border-[color:var(--danger-border)] text-[color:var(--danger-text)]">
              Couldn’t load sessions: {error}
            </div>
          ) : paginatedHistory.length > 0 ? (
            paginatedHistory.map((session) => {
              const accuracy = (session.accuracy ?? 0) * 100;
              const score = session.score ?? 0;
              return (
                <Card
                  key={session.id}
                  variant="interactive"
                  padding="md"
                  onClick={() => onReview(session.id)}
                  className="group flex flex-col md:flex-row md:items-center gap-6"
                >
                  <div className="flex items-center gap-6 flex-1">
                    <div className="w-16 h-16 rounded-2xl bg-bg-sunken flex items-center justify-center shrink-0 border border-border-subtle relative transition-transform">
                      <svg className="absolute inset-0 w-full h-full overflow-visible -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="transparent" stroke="var(--border-subtle)" strokeWidth="4" />
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          fill="transparent"
                          stroke={accuracy >= 70 ? 'var(--accent)' : accuracy >= 50 ? 'var(--warning-text)' : 'var(--accent-danger)'}
                          strokeWidth="4"
                          strokeDasharray={`${(accuracy / 100) * 175.9} 175.9`}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <span
                        className={cn(
                          'text-sm font-black absolute tracking-tighter ml-0.5',
                          accuracy >= 50 && accuracy < 70 ? 'text-warning-text' : ''
                        )}
                        style={
                          accuracy >= 70
                            ? { color: 'var(--accent)' }
                            : accuracy < 50
                            ? { color: 'var(--accent-danger)' }
                            : undefined
                        }
                      >
                        {Math.round(accuracy)}%
                      </span>
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Pill tone="neutral">{MODE_DISPLAY[session.mode].replace('_', ' ')}</Pill>
                        <span className="text-[11px] text-text-tertiary">{formatDate(session.started_at)}</span>
                      </div>
                      <h3 className="font-semibold text-lg text-text-primary flex items-center gap-2">
                        {session.course_name ?? 'Unknown course'}
                      </h3>
                      <p className="text-sm text-text-secondary line-clamp-1">
                        {session.topic_name ?? 'All topics'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 md:gap-6 border-t md:border-t-0 md:border-l border-border-subtle pt-4 md:pt-0 md:pl-6 w-full md:w-auto">
                    <div className="flex flex-col gap-1 items-start md:items-end md:w-24">
                      <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.18em] flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Time
                      </span>
                      <span className="text-sm font-semibold text-text-primary">{formatDuration(session.duration_ms)}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-start md:items-end md:w-24">
                      <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.18em] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Score
                      </span>
                      <span className="text-sm font-semibold text-text-primary">
                        {score} / {session.total_questions}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError(null);
                        setPendingDelete(session);
                      }}
                      title="Delete this session"
                      className="w-8 h-8 rounded-full bg-bg-raised flex items-center justify-center border border-border-subtle text-text-tertiary hover:text-[color:var(--accent-danger)] hover:border-[color:var(--danger-border)] hover:bg-[color:var(--danger-bg)] transition-colors shrink-0 md:ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-bg-raised flex items-center justify-center border border-border-subtle group-hover:bg-accent group-hover:border-accent transition-colors shrink-0">
                      <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-slate-950 transition-colors" />
                    </div>
                  </div>
                </Card>
              );
            })
          ) : (
            <EmptyState
              icon={History}
              title={sessions.length === 0 ? 'No sessions yet' : 'No sessions match'}
              description={
                sessions.length === 0
                  ? 'Take your first practice session to see it here.'
                  : 'Try clearing your search or filter.'
              }
            />
          )}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8 pt-6 border-t border-border-subtle">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="hidden md:flex items-center gap-1 px-4">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center',
                      currentPage === i + 1
                        ? 'bg-accent text-slate-950'
                        : 'text-text-secondary hover:bg-bg-raised hover:text-text-primary'
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <div className="md:hidden px-4 text-xs font-semibold text-text-secondary">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 animate-fade-in"
          onClick={() => {
            if (!deleting) setPendingDelete(null);
          }}
        >
          <div
            className="w-full max-w-md bg-bg-surface border border-border-subtle rounded-2xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[color:var(--danger-bg)] text-[color:var(--accent-danger)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-text-primary mb-1">Delete this session?</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Deleting <span className="font-semibold text-text-primary">{pendingDelete.course_name ?? 'this session'}</span>{' '}
                  removes it permanently and updates your accuracy, time, and trend as if it never happened.
                  Past sessions are useful to see your progress — only delete if you really mean to.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="px-3 py-2 rounded-lg text-xs bg-[color:var(--danger-bg)] border border-[color:var(--danger-border)] text-[color:var(--danger-text)]">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 bg-[color:var(--accent-danger)] text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
