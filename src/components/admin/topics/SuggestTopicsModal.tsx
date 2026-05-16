import { useState } from 'react';
import { X, Loader2, Sparkles, FileText, Type } from 'lucide-react';
import { apiPost } from '../../../lib/apiClient';
import { renderPdfToBlobs } from '../../../lib/pdfClient';
import { cn } from '../../../lib/utils';

interface ProposedTopic {
  name: string;
  description: string;
  confidence: number;
  selected: boolean;
}

interface Props {
  programCourseId: string;
  onClose: () => void;
  onSaved: (count: number) => void;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return btoa(
    new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), '')
  );
}

export function SuggestTopicsModal({ programCourseId, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<'text' | 'pdf'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'rendering' | 'analyzing' | 'review' | 'saving'>('idle');
  const [progress, setProgress] = useState('');
  const [proposed, setProposed] = useState<ProposedTopic[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const analyze = async () => {
    setErr(null);
    setProposed([]);

    try {
      let payload: Record<string, unknown>;
      if (mode === 'text') {
        if (text.trim().length < 10) throw new Error('Paste at least 10 characters of syllabus text');
        payload = { source_type: 'text', program_course_id: programCourseId, text };
      } else {
        if (!file) throw new Error('Pick a PDF first');
        setStatus('rendering');
        const blobs = await renderPdfToBlobs(file, {
          maxPages: 20,
          onProgress: ({ page, totalPages }) => setProgress(`Rendering page ${page} of ${totalPages}…`),
        });
        const images = await Promise.all(blobs.map(blobToBase64));
        payload = { source_type: 'images', program_course_id: programCourseId, images };
      }

      setStatus('analyzing');
      setProgress('Analyzing with AI…');
      const res = await apiPost<{ topics: Array<Omit<ProposedTopic, 'selected'>> }>(
        '/api/topic-suggestions',
        payload
      );
      setProposed(
        res.topics.map((t) => ({ ...t, selected: t.confidence >= 0.6 }))
      );
      setStatus('review');
      setProgress('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus('idle');
    }
  };

  const toggle = (i: number) => {
    setProposed((p) => p.map((t, idx) => (idx === i ? { ...t, selected: !t.selected } : t)));
  };

  const updateField = (i: number, field: 'name' | 'description', value: string) => {
    setProposed((p) => p.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  };

  const saveSelected = async () => {
    const toSave = proposed.filter((t) => t.selected && t.name.trim());
    if (toSave.length === 0) {
      setErr('Pick at least one topic');
      return;
    }
    setStatus('saving');
    setErr(null);
    try {
      await Promise.all(
        toSave.map((t) =>
          apiPost('/api/topics', {
            program_course_id: programCourseId,
            name: t.name.trim(),
            ...(t.description.trim() ? { description: t.description.trim() } : {}),
          })
        )
      );
      onSaved(toSave.length);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus('review');
    }
  };

  const busy = status === 'rendering' || status === 'analyzing' || status === 'saving';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-bg-surface border border-border-subtle rounded-3xl max-w-3xl w-full p-6 shadow-2xl my-8 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="font-bold uppercase tracking-widest text-sm text-text-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Suggest Topics from Syllabus
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {status === 'idle' && (
            <>
              <div className="flex gap-2">
                {(['text', 'pdf'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all',
                      mode === m
                        ? 'bg-bg-raised text-primary border border-primary/20'
                        : 'bg-surface-container-low text-text-secondary border border-border-subtle hover:bg-bg-raised'
                    )}
                  >
                    {m === 'text' ? <Type className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                    {m === 'text' ? 'Paste text' : 'Upload PDF'}
                  </button>
                ))}
              </div>
              {mode === 'text' ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  placeholder="Paste the course syllabus, outline, or table of contents here…"
                  className="w-full bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none resize-none"
                />
              ) : (
                <label className="block cursor-pointer">
                  <div className="border border-dashed border-border-subtle rounded-xl py-12 text-center hover:bg-bg-raised transition-colors">
                    <p className="text-sm text-text-secondary">
                      {file ? file.name : 'Click to pick a PDF syllabus'}
                    </p>
                  </div>
                  <input
                    type="file"
                    hidden
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </>
          )}

          {busy && (
            <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">{progress || 'Working…'}</span>
            </div>
          )}

          {status === 'review' && (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">
                {proposed.length} topics proposed. Uncheck any you don't want; edit names or descriptions inline.
              </p>
              {proposed.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    'border rounded-2xl p-3 transition-colors',
                    t.selected ? 'border-primary/30 bg-primary/5' : 'border-border-subtle opacity-50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={t.selected}
                      onChange={() => toggle(i)}
                      className="mt-1 accent-primary"
                    />
                    <div className="flex-1 space-y-2 min-w-0">
                      <input
                        value={t.name}
                        onChange={(e) => updateField(i, 'name', e.target.value)}
                        className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1 text-sm font-bold text-text-primary focus:border-primary focus:outline-none"
                      />
                      <textarea
                        value={t.description}
                        onChange={(e) => updateField(i, 'description', e.target.value)}
                        rows={2}
                        className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-secondary focus:border-primary focus:outline-none resize-none"
                      />
                      <p className="text-[10px] text-text-tertiary">
                        AI confidence: {(t.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {err && (
            <div className="bg-red-500/10 text-red-500 border border-red-500/30 rounded-xl px-3 py-2 text-xs">
              {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-border-subtle shrink-0">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-bold text-text-secondary hover:bg-bg-raised disabled:opacity-50"
          >
            Cancel
          </button>
          {status === 'idle' && (
            <button
              onClick={analyze}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 flex items-center gap-2"
            >
              <Sparkles className="w-3 h-3" />
              Analyze
            </button>
          )}
          {status === 'review' && (
            <button
              onClick={saveSelected}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              Save selected
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
