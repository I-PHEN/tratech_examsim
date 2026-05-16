import { useState } from 'react';
import { Upload, Loader2, FileText, Image as ImageIcon, Type } from 'lucide-react';
import { apiPost, apiUpload } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { CourseSelect } from './CourseSelect';

type Mode = 'pdf' | 'image' | 'text';
type DocType = 'past_paper' | 'slides' | 'handwritten';

const DOC_TYPES: { value: DocType; label: string; hint: string }[] = [
  { value: 'past_paper', label: 'Past Paper', hint: 'All questions extracted' },
  { value: 'slides', label: 'Slides', hint: 'Filters out lecture notes' },
  { value: 'handwritten', label: 'Handwritten', hint: 'Lenient on formatting' },
];

export function IngestionUpload({ onCreated }: { onCreated: () => void }) {
  const [programCourseId, setProgramCourseId] = useState<string>('');

  const [mode, setMode] = useState<Mode>('pdf');
  const [docType, setDocType] = useState<DocType>('past_paper');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [model, setModel] = useState<string>('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string>('Start Ingestion');
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const reset = () => {
    setFile(null);
    setText('');
  };

  const submit = async () => {
    if (!programCourseId) {
      setMsg({ text: 'Pick a course first.', type: 'err' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      if (mode === 'text') {
        if (text.trim().length < 10) throw new Error('Paste at least 10 characters of text');
        setSubmitStatus('Uploading…');
        await apiPost('/api/ingestion/jobs', {
          source_type: 'text',
          text,
          program_course_id: programCourseId,
          doc_type: docType,
          ...(model.trim() ? { model: model.trim() } : {}),
        });
      } else {
        if (!file) throw new Error('Pick a file first');
        const fd = new FormData();
        fd.append('source_type', mode);
        fd.append('program_course_id', programCourseId);
        fd.append('doc_type', docType);
        if (model.trim()) fd.append('model', model.trim());
        fd.append('files', file);

        setSubmitStatus('Uploading…');
        await apiUpload('/api/ingestion/jobs', fd);
      }
      setMsg({ text: 'Job created. OCR + extraction running in the background.', type: 'ok' });
      reset();
      onCreated();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : String(err), type: 'err' });
    } finally {
      setSubmitting(false);
      setSubmitStatus('Start Ingestion');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-surface-container-low border border-border-subtle rounded-2xl p-5 flex flex-col">
        <div className="flex gap-2 mb-4">
          {(['pdf', 'image', 'text'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); reset(); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all',
                mode === m
                  ? 'bg-bg-raised text-primary border border-primary/20'
                  : 'bg-surface-container-low text-text-secondary border border-border-subtle hover:bg-bg-raised'
              )}
            >
              {m === 'pdf' && <FileText className="w-3.5 h-3.5" />}
              {m === 'image' && <ImageIcon className="w-3.5 h-3.5" />}
              {m === 'text' && <Type className="w-3.5 h-3.5" />}
              {m === 'pdf' ? 'PDF' : m === 'image' ? 'Image' : 'Text Paste'}
            </button>
          ))}
        </div>

        {mode === 'text' ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste raw question text here..."
            className="flex-1 min-h-[180px] bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none resize-none"
          />
        ) : (
          <label className="flex-1 min-h-[180px] cursor-pointer flex flex-col items-center justify-center gap-3 bg-bg-sunken border border-dashed border-border-subtle rounded-xl px-4 py-6 hover:border-primary/40 hover:bg-bg-raised/40 transition-colors">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-bold text-text-primary">
                {file ? file.name : mode === 'pdf' ? 'Click to select a PDF' : 'Click to select an image'}
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {mode === 'pdf'
                  ? 'Past papers, slides, or scanned exams · up to 100 MB'
                  : 'A photo or scan of a question paper · JPG or PNG'}
              </p>
            </div>
            <input
              type="file"
              hidden
              accept={mode === 'pdf' ? 'application/pdf' : 'image/*'}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <button
          disabled={submitting || !programCourseId}
          onClick={submit}
          className="mt-4 bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitStatus}
        </button>

        {msg && (
          <div
            className={cn(
              'mt-3 px-3 py-2 rounded-lg text-xs font-medium',
              msg.type === 'ok'
                ? 'bg-tertiary/10 text-tertiary border border-tertiary/30'
                : 'bg-red-500/10 text-red-500 border border-red-500/30'
            )}
          >
            {msg.text}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4">
          <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary mb-3">
            Target Course
          </h4>
          <CourseSelect value={programCourseId} onChange={setProgramCourseId} compact />
        </div>

        <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4">
          <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary mb-2">
            Source Type
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt.value}
                onClick={() => setDocType(dt.value)}
                title={dt.hint}
                className={cn(
                  'px-2 py-1.5 rounded-lg border text-xs font-bold transition-all text-center',
                  docType === dt.value
                    ? 'bg-bg-raised border-primary/30 text-primary'
                    : 'bg-bg-sunken border-border-subtle text-text-secondary hover:bg-bg-raised'
                )}
              >
                {dt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-3 w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors"
          >
            <span>Advanced</span>
            <span>{advancedOpen ? '–' : '+'}</span>
          </button>
          {advancedOpen && (
            <div className="mt-2">
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="model override (e.g. anthropic/claude-sonnet-4-5)"
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:border-primary focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
