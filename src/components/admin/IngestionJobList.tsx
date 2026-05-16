import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, ChevronRight } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { cn } from '../../lib/utils';

export interface IngestionJob {
  id: string;
  source_type: 'pdf' | 'image' | 'text';
  status: 'pending' | 'extracting' | 'ready_for_review' | 'published' | 'failed';
  total_drafts: number;
  error_message: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<IngestionJob['status'], string> = {
  pending: 'bg-text-secondary/10 text-text-secondary border-text-secondary/20',
  extracting: 'bg-primary/10 text-primary border-primary/20',
  ready_for_review: 'bg-tertiary/10 text-tertiary border-tertiary/30',
  published: 'bg-green-500/10 text-green-500 border-green-500/30',
  failed: 'bg-red-500/10 text-red-500 border-red-500/30',
};

export function IngestionJobList({
  refreshKey,
  onSelect,
}: {
  refreshKey: number;
  onSelect: (jobId: string) => void;
}) {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const pollTimer = useRef<number | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await apiGet<IngestionJob[]>('/api/ingestion/jobs?limit=30');
      setJobs(data);
    } catch (err) {
      console.error('Failed to load jobs', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs, refreshKey]);

  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'extracting' || j.status === 'pending');
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

  if (jobs.length === 0) {
    return (
      <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-12 text-center text-text-secondary">
        No ingestion jobs yet. Upload something to get started.
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low border border-border-subtle rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <h4 className="font-bold uppercase tracking-widest text-sm text-text-primary">
          Recent Jobs
        </h4>
        <button
          onClick={fetchJobs}
          className="text-text-secondary hover:text-text-primary"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="divide-y divide-border-subtle">
        {jobs.map((j) => (
          <button
            key={j.id}
            onClick={() => onSelect(j.id)}
            className="w-full flex items-start justify-between gap-3 px-6 py-4 hover:bg-bg-raised transition-colors text-left"
          >
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="uppercase text-xs font-bold tracking-wider text-text-secondary">
                  {j.source_type}
                </span>
                <span
                  className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded-md border',
                    STATUS_STYLES[j.status]
                  )}
                >
                  {j.status.replace('_', ' ')}
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
            </div>
            <ChevronRight className="w-4 h-4 text-text-secondary shrink-0 mt-1" />
          </button>
        ))}
      </div>
    </div>
  );
}
