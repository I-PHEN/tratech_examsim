import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, ScanText, Wand2, RotateCcw, Check, Scissors } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { DraftReviewTable } from './DraftReviewTable';
import { StructureStep } from './StructureStep';

interface Job {
  id: string;
  status: string;
  mode: 'autonomous' | 'stepwise';
  source_type: string;
  reviewed_text: string | null;
  transcripts: { page_number: number; text: string }[] | null;
  total_drafts: number | null;
  error_message: string | null;
}

const STEPS = ['Extract', 'Review text', 'Review & publish'] as const;

function stepIndex(status: string): number {
  if (status === 'uploaded' || status === 'extracting') return 0;
  if (status === 'text_review') return 1;
  if (status === 'structuring') return 1; // manual structuring kept as a fallback only
  return 2; // ready_for_review / published
}

export function IngestionWizard({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const autoRef = useRef<string>(''); // last status auto-advanced (autonomous)

  const load = useCallback(async () => {
    try {
      const { job: j } = await apiGet<{ job: Job }>(`/api/ingestion/jobs/${jobId}`);
      setJob(j);
      setText(
        j.reviewed_text != null && j.reviewed_text.length > 0
          ? j.reviewed_text
          : (j.transcripts ?? []).map((t) => t.text).join('\n\n')
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while a stage is running.
  useEffect(() => {
    const active = job && (job.status === 'uploaded' || job.status === 'extracting');
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (active) pollRef.current = window.setInterval(load, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job, load]);

  const runStage = useCallback(
    async (stage: 'extract' | 'classify') => {
      setBusy(stage);
      setErr(null);
      try {
        await apiPost(`/api/ingestion/jobs/${jobId}/${stage}`, {});
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
        await load();
      }
    },
    [jobId, load]
  );

  // Autonomous: auto-advance once per resting status.
  useEffect(() => {
    if (!job || job.mode !== 'autonomous' || busy) return;
    if (job.status === 'uploaded' && autoRef.current !== 'uploaded') {
      autoRef.current = 'uploaded';
      runStage('extract');
    } else if (job.status === 'text_review' && autoRef.current !== 'text_review') {
      autoRef.current = 'text_review';
      runStage('classify');
    }
  }, [job, busy, runStage]);

  const saveText = async () => {
    setBusy('save');
    setErr(null);
    try {
      await apiPatch(`/api/ingestion/jobs/${jobId}/text`, { reviewed_text: text });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      await load();
    }
  };

  const splitManually = async () => {
    setBusy('structure');
    setErr(null);
    try {
      await apiPatch(`/api/ingestion/jobs/${jobId}/text`, { reviewed_text: text });
      await apiPost(`/api/ingestion/jobs/${jobId}/structure`, {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      await load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!job) {
    return (
      <div className="text-center text-text-secondary py-12">
        {err ?? 'Job not found.'}
      </div>
    );
  }

  const step = stepIndex(job.status);
  const autonomous = job.mode === 'autonomous';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Back to jobs
        </button>
      </div>

      {/* Step strip */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border',
                i === step
                  ? 'bg-bg-raised border-primary/30 text-primary'
                  : i < step
                    ? 'bg-bg-sunken border-border-subtle text-text-secondary'
                    : 'bg-bg-sunken border-border-subtle text-text-secondary/60'
              )}
            >
              {i < step ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
              {label}
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-6 h-px bg-border-subtle" />
            )}
          </div>
        ))}
      </div>

      {err && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs bg-red-500/10 text-red-500 border border-red-500/30">
          {err}
        </div>
      )}

      {/* STEP 0: Extract */}
      {step === 0 && (
        <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-8 text-center">
          {job.status === 'extracting' ? (
            <>
              <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-text-secondary">
                Running OCR / extraction… this can take a minute.
              </p>
            </>
          ) : job.status === 'failed' ? (
            <>
              <p className="text-sm text-red-500 mb-1 font-bold">Extraction failed</p>
              <p className="text-xs text-text-secondary mb-4 font-mono break-all">
                {job.error_message}
              </p>
              <button
                onClick={() => runStage('extract')}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Retry extraction
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <ScanText className="w-6 h-6" />
              </div>
              <p className="text-sm text-text-secondary mb-4">
                {autonomous
                  ? 'Autonomous mode — extraction will start automatically.'
                  : 'Extract the text from your upload, then you can review and correct it.'}
              </p>
              <button
                onClick={() => runStage('extract')}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
              >
                {busy === 'extract' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ScanText className="w-4 h-4" />
                )}
                Run extraction
              </button>
            </>
          )}
        </div>
      )}

      {/* STEP 1: Review extracted text */}
      {job.status === 'text_review' && (
        <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold uppercase tracking-widest text-sm text-text-primary">
              Extracted text — correct anything OCR missed
            </h4>
            <span className="text-xs text-text-secondary">
              {job.transcripts?.length ?? 0} page(s)
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full min-h-[360px] bg-bg-sunken border border-border-subtle rounded-xl p-4 text-sm text-text-primary font-mono leading-relaxed focus:border-primary focus:outline-none resize-y"
          />
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={saveText}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 bg-bg-raised border border-border-subtle text-text-primary px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-bg-sunken"
            >
              {busy === 'save' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Save corrections
            </button>
            <button
              onClick={splitManually}
              disabled={busy !== null}
              title="Split this text into individual questions yourself (---, Q#, or by cursor)"
              className="inline-flex items-center gap-2 bg-bg-raised border border-border-subtle text-text-primary px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-bg-sunken"
            >
              {busy === 'structure' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Scissors className="w-4 h-4" />
              )}
              Split manually
            </button>
            <button
              onClick={async () => {
                await saveText();
                await runStage('classify');
              }}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
            >
              {busy === 'classify' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              Save & let AI classify
            </button>
          </div>
        </div>
      )}

      {/* Manual split step — user picked "Split manually" from the text-review screen. */}
      {job.status === 'structuring' && <StructureStep jobId={jobId} onDone={load} />}

      {/* STEP 2: Review drafts & publish */}
      {step === 2 && job.status !== 'structuring' && <DraftReviewTable jobId={jobId} />}
    </div>
  );
}
