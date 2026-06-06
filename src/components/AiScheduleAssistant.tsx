import { useState } from 'react';
import { Sparkles, Send, X, Loader2 } from 'lucide-react';
import { apiPost } from '../lib/apiClient';
import { Button } from './ui/Button';
import { describeDraft, type AiScheduleProposal } from '../lib/scheduleDraft';

interface AiDraftResponse {
  proposals: AiScheduleProposal[];
  message: string;
}

interface Props {
  /** Open the create form pre-filled from this draft (course locked). */
  onEditDraft: (draft: AiScheduleProposal) => void;
  /** Persist a draft via the existing create API; resolves on success. */
  onSaveDraft: (draft: AiScheduleProposal) => Promise<void>;
  /** Called after one or more drafts are saved, so the list can refresh. */
  onSaved: () => void;
}

export function AiScheduleAssistant({ onEditDraft, onSaveDraft, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<AiScheduleProposal[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  async function handleSend() {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    setDrafts([]);
    try {
      const res = await apiPost<AiDraftResponse>('/api/schedules/ai-draft', {
        text: t,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        today: new Date().toISOString().slice(0, 10),
      });
      setDrafts(res.proposals);
      setMessage(res.message || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t draft that — try rephrasing.');
    } finally {
      setLoading(false);
    }
  }

  function removeDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveOne(idx: number) {
    setSavingIdx(idx);
    setError(null);
    try {
      await onSaveDraft(drafts[idx]);
      removeDraft(idx);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that schedule.');
    } finally {
      setSavingIdx(null);
    }
  }

  async function saveAll() {
    setSavingAll(true);
    setError(null);
    const remaining = [...drafts];
    const failed: AiScheduleProposal[] = [];
    for (const d of remaining) {
      try {
        await onSaveDraft(d);
      } catch {
        failed.push(d);
      }
    }
    setDrafts(failed);
    if (failed.length > 0) setError(`${failed.length} schedule(s) could not be saved.`);
    setSavingAll(false);
    onSaved();
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-bg-raised/40 transition-colors"
      >
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="font-semibold text-sm text-text-primary">Ask Jude to schedule</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border-subtle pt-4">
          <div className="flex items-start gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
              }}
              rows={2}
              placeholder='e.g. "reactor design Mon/Wed/Fri 6pm" or "thermo exam June 20, I’m weak on entropy"'
              className="flex-1 bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none placeholder:text-text-tertiary resize-none"
            />
            <Button variant="primary" size="sm" onClick={handleSend} loading={loading} disabled={loading || !text.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-[11px] text-text-tertiary">
            Here, Jude only helps you schedule practice — for tutoring, open a question in Review and tap “Ask Jude”.
          </p>

          {error && (
            <div className="px-3 py-2 rounded-lg text-xs bg-[color:var(--danger-bg)] border border-[color:var(--danger-border)] text-[color:var(--danger-text)]">
              {error}
            </div>
          )}

          {message && drafts.length === 0 && !loading && (
            <div className="px-3 py-2 rounded-lg text-xs bg-bg-raised text-text-secondary">{message}</div>
          )}

          {drafts.length > 0 && (
            <div className="space-y-2">
              {drafts.map((d, idx) => (
                <div key={idx} className="rounded-xl border border-border-subtle bg-bg-raised px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary leading-snug">{describeDraft(d)}</p>
                    <button
                      type="button"
                      aria-label="Remove draft"
                      onClick={() => removeDraft(idx)}
                      className="p-0.5 rounded text-text-tertiary hover:text-text-primary"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {d.why && <p className="text-xs text-text-secondary mt-0.5">{d.why}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="primary" size="sm" onClick={() => saveOne(idx)} loading={savingIdx === idx} disabled={savingAll || savingIdx !== null}>
                      Save
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onEditDraft(d)} disabled={savingAll || savingIdx !== null}>
                      Edit
                    </Button>
                  </div>
                </div>
              ))}

              {drafts.length > 1 && (
                <Button variant="secondary" size="sm" onClick={saveAll} disabled={savingAll || savingIdx !== null}>
                  {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : `Save all (${drafts.length})`}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
