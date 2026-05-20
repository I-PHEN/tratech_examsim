import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, ChevronRight, Archive, ArchiveRestore } from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';
import { cn } from '../../lib/utils';

export interface IngestionJob {
  id: string;
  source_type: 'pdf' | 'image' | 'text';
  status: string;
  total_drafts: number;
  error_message: string | null;
  created_at: string;
  archived_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-text-secondary/10 text-text-secondary border-text-secondary/20',
  uploaded: 'bg-text-secondary/10 text-text-secondary border-text-secondary/20',
  extracting: 'bg-primary/10 text-primary border-primary/20',
  text_review: 'bg-tertiary/10 text-tertiary border-tertiary/30',
  ready_for_review: 'bg-tertiary/10 text-tertiary border-tertiary/30',
  published: 'bg-green-500/10 text-green-500 border-green-500/30',
  failed: 'bg-red-500/10 text-red-500 border-red-500/30',
};
const STATUS_FALLBACK = 'bg-text-secondary/10 text-text-secondary border-text-secondary/20';
const ACTIVE_STATUSES = new Set(['pending', 'uploaded', 'extracting']);

export function IngestionJobList({
  refreshKey,
  onSelect,
}: {
  refreshKey: number;
  onSelect: (jobId: string) => void;
}) {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await apiGet<IngestionJob[]>(
        `/api/ingestion/jobs?limit=30&archived=${showArchived ? 'true' : 'false'}`
      );
      setJobs(data);
    } catch (err) {
      console.error('Failed to load jobs', err);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs, refreshKey]);

  const archive = async (jobId: string) => {
    setBusyId(jobId);
    try {
      await apiPost(`/api/ingestion/jobs/${jobId}/archive`, {});
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      console.error('Failed to archive job', err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const unarchive = async (jobId: string) => {
    setBusyId(jobId);
    try {
      await apiPost(`/api/ingestion/jobs/${jobId}/unarchive`, {});
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      console.error('Failed to unarchive job', err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    const hasActive = jobs.some((j) => ACTIVE_STATUSES.has(j.status));
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (hasActive) {
      pollTimer.current = window.setInterval(fetchJobs, 5000);
    }
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [jobs, fetchJobs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
      <h4 className="font-bold uppercase tracking-widest text-sm text-text-primary">
        {showArchived ? 'Archived Jobs' : 'Recent Jobs'}
      </h4>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary px-2 py-1 rounded-md border border-border-subtle hover:bg-bg-raised"
        >
          {showArchived ? 'Show active' : 'Show archived'}
        </button>
        <button
          onClick={fetchJobs}
          className="text-text-secondary hover:text-text-primary"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (jobs.length === 0) {
    return (
      <div className="bg-surface-container-low border border-border-subtle rounded-3xl overflow-hidden">
        {header}
        <div className="p-12 text-center text-text-secondary">
          {showArchived
            ? 'No archived jobs.'
            : 'No ingestion jobs yet. Upload something to get started.'}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low border border-border-subtle rounded-3xl overflow-hidden">
      {header}
      <div className="divide-y divide-border-subtle">
        {jobs.map((j) => (
          <div
            key={j.id}
            className="w-full flex items-start justify-between gap-3 px-6 py-4 hover:bg-bg-raised transition-colors"
          >
            <button
              onClick={() => onSelect(j.id)}
              className="flex flex-col gap-1.5 min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="uppercase text-xs font-bold tracking-wider text-text-secondary">
                  {j.source_type}
                </span>
                <span
                  className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded-md border',
                    STATUS_STYLES[j.status] ?? STATUS_FALLBACK
                  )}
                >
                  {j.status.replace(/_/g, ' ')}
                </span>
                {j.total_drafts > 0 && (
                  <span className="text-xs text-text-secondary">
                    {j.total_drafts} drafts
                  </span>
                )}
                <span className="text-xs text-text-secondary">
                  {new Date(j.created_at).toLocaleString()}
                </span>
              </div>
              {j.error_message && (
                <div className="text-xs text-red-500/90 font-mono bg-red-500/5 border border-red-500/20 rounded-md px-2 py-1.5 break-all whitespace-pre-wrap">
                  {j.error_message}
                </div>
              )}
            </button>
            <div className="flex items-center gap-2 shrink-0 mt-1">
              {showArchived ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    unarchive(j.id);
                  }}
                  disabled={busyId === j.id}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded-md border border-border-subtle hover:bg-bg-sunken disabled:opacity-50"
                  title="Restore from archive"
                >
                  {busyId === j.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArchiveRestore className="w-3.5 h-3.5" />
                  )}
                  Restore
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    archive(j.id);
                  }}
                  disabled={busyId === j.id}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded-md border border-border-subtle hover:bg-bg-sunken disabled:opacity-50"
                  title="Archive job"
                >
                  {busyId === j.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                  Archive
                </button>
              )}
              <ChevronRight className="w-4 h-4 text-text-secondary" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
