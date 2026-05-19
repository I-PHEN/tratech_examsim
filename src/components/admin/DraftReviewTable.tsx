import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Save, Trash2, Send, Plus, Sparkles, ImageUp, Eye, EyeOff } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { RichText } from '../ui/RichText';

interface DraftData {
  type: 'mcq' | 'calc';
  prompt: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  topic_id?: string;
  exam_scope?: 'midsem' | 'final' | 'both';
  options?: Array<{ text: string; is_correct: boolean }>;
  correct_answer?: string;
  answer_type?: 'exact' | 'range';
  answer_tolerance?: number;
  unit?: string;
  explanation?: string;
  source_reference?: string;
  solution_image_path?: string;
  solution_image_mime?: string;
}

interface Draft {
  id: string;
  draft_data: DraftData;
  status: 'pending' | 'rejected' | 'published';
  source_page: number | null;
  ai_confidence: number | null;
}

interface Job {
  id: string;
  program_course_id: string | null;
  status: string;
  source_type: string;
  total_drafts: number;
}

interface Topic {
  id: string;
  name: string;
}

interface PublishResult {
  published_count: number;
  skipped: Array<{ draft_id: string; reason: string }>;
}

interface DraftRowProps {
  draft: Draft;
  topics: Topic[];
  jobId: string;
  onChange: (next: Draft) => void;
  onSave: () => Promise<void>;
  onReject: () => Promise<void>;
}

const DraftRow: React.FC<DraftRowProps> = ({ draft, topics, jobId, onChange, onSave, onReject }) => {
  const [saving, setSaving] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [fmtBusy, setFmtBusy] = useState<'prompt' | 'explanation' | null>(null);
  const [preview, setPreview] = useState<Set<'prompt' | 'explanation'>>(new Set());
  const d = draft.draft_data;

  const togglePreview = (k: 'prompt' | 'explanation') =>
    setPreview((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const formatField = async (field: 'prompt' | 'explanation') => {
    const value = field === 'prompt' ? d.prompt : d.explanation;
    if (!value || !value.trim()) return;
    setFmtBusy(field);
    try {
      const { formatted } = await apiPost<{ formatted: string }>(`/api/ingestion/format`, {
        text: value,
      });
      update({ [field]: formatted } as Partial<DraftData>);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setFmtBusy(null);
    }
  };

  const onSolutionImage = async (file: File) => {
    setOcrBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await apiUpload<{ text: string; storage_path: string; mime_type: string }>(
        `/api/ingestion/jobs/${jobId}/ocr-image`,
        fd
      );
      update({
        solution_image_path: r.storage_path,
        solution_image_mime: r.mime_type,
        // Prefill the worked solution only if empty — never clobber edits.
        ...(d.explanation && d.explanation.trim() ? {} : { explanation: r.text }),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setOcrBusy(false);
    }
  };

  const update = (patch: Partial<DraftData>) =>
    onChange({ ...draft, draft_data: { ...d, ...patch } });

  const updateOption = (i: number, patch: Partial<{ text: string; is_correct: boolean }>) => {
    const opts = [...(d.options ?? [])];
    opts[i] = { ...opts[i], ...patch };
    if (patch.is_correct === true) {
      for (let j = 0; j < opts.length; j++) if (j !== i) opts[j].is_correct = false;
    }
    update({ options: opts });
  };

  const addOption = () => {
    update({ options: [...(d.options ?? []), { text: '', is_correct: false }] });
  };

  const removeOption = (i: number) => {
    const opts = [...(d.options ?? [])];
    opts.splice(i, 1);
    update({ options: opts });
  };

  if (draft.status !== 'pending') {
    return (
      <div className="border border-border-subtle rounded-2xl p-4 opacity-60">
        <span className="text-xs font-bold uppercase text-text-secondary">{draft.status}</span>
        <p className="text-sm text-text-primary mt-2 line-clamp-2">{d.prompt}</p>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border-subtle rounded-2xl p-5 bg-bg-surface space-y-4">
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>
          {draft.source_page != null ? `Page ${draft.source_page}` : 'Source: n/a'}
          {draft.ai_confidence != null && ` • confidence ${(draft.ai_confidence * 100).toFixed(0)}%`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs bg-primary text-on-primary px-3 py-1.5 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-500/20"
          >
            <Trash2 className="w-3 h-3" />
            Reject
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-end gap-3 text-text-secondary">
          <button
            onClick={() => formatField('prompt')}
            disabled={fmtBusy !== null}
            title="AI clean-up formatting (Markdown + LaTeX)"
            className="flex items-center gap-1 text-xs hover:text-primary disabled:opacity-50"
          >
            {fmtBusy === 'prompt' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Format
          </button>
          <button
            onClick={() => togglePreview('prompt')}
            title="Toggle rendered preview"
            className="flex items-center gap-1 text-xs hover:text-text-primary"
          >
            {preview.has('prompt') ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            Preview
          </button>
        </div>
        {preview.has('prompt') ? (
          <div className="bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary min-h-[80px]">
            <RichText>{d.prompt}</RichText>
          </div>
        ) : (
          <textarea
            value={d.prompt}
            onChange={(e) => update({ prompt: e.target.value })}
            className="w-full bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none min-h-[80px]"
          />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-xs">
          <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">Type</span>
          <select
            value={d.type}
            onChange={(e) => update({ type: e.target.value as 'mcq' | 'calc' })}
            className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="mcq">MCQ</option>
            <option value="calc">Calc</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">Difficulty</span>
          <select
            value={d.difficulty ?? ''}
            onChange={(e) => update({ difficulty: e.target.value as 'easy' | 'medium' | 'hard' })}
            className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="">—</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">Topic</span>
          <select
            value={d.topic_id ?? ''}
            onChange={(e) => update({ topic_id: e.target.value || undefined })}
            className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="">—</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">Exam Scope</span>
          <select
            value={d.exam_scope ?? ''}
            onChange={(e) => update({ exam_scope: e.target.value as 'midsem' | 'final' | 'both' })}
            className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="">—</option>
            <option value="midsem">Midsem</option>
            <option value="final">Final</option>
            <option value="both">Both</option>
          </select>
        </label>
      </div>

      {d.type === 'mcq' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-bold uppercase tracking-wider">Options</span>
            <button
              onClick={addOption}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              disabled={(d.options?.length ?? 0) >= 6}
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {(d.options ?? []).map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${draft.id}`}
                checked={o.is_correct}
                onChange={() => updateOption(i, { is_correct: true })}
                className="accent-primary"
              />
              <input
                value={o.text}
                onChange={(e) => updateOption(i, { text: e.target.value })}
                className="flex-1 bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
              />
              <button
                onClick={() => removeOption(i)}
                className="text-red-500 hover:text-red-400"
                disabled={(d.options?.length ?? 0) <= 2}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-xs md:col-span-2">
            <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">Correct Answer</span>
            <input
              value={d.correct_answer ?? ''}
              onChange={(e) => update({ correct_answer: e.target.value })}
              className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label className="text-xs">
            <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">Answer Type</span>
            <select
              value={d.answer_type ?? 'exact'}
              onChange={(e) => update({ answer_type: e.target.value as 'exact' | 'range' })}
              className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="exact">Exact</option>
              <option value="range">Range</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
              {d.answer_type === 'range' ? 'Tolerance' : 'Unit'}
            </span>
            {d.answer_type === 'range' ? (
              <input
                type="number"
                step="any"
                value={d.answer_tolerance ?? ''}
                onChange={(e) => update({ answer_tolerance: parseFloat(e.target.value) || undefined })}
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
              />
            ) : (
              <input
                value={d.unit ?? ''}
                onChange={(e) => update({ unit: e.target.value })}
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
              />
            )}
          </label>
        </div>
      )}

      <div className="text-xs block">
        <div className="flex items-center justify-between mb-1">
          <span className="text-text-secondary font-bold uppercase tracking-wider">
            Worked solution / explanation (optional)
          </span>
          <div className="flex items-center gap-3 text-text-secondary">
            <button
              onClick={() => formatField('explanation')}
              disabled={fmtBusy !== null || !d.explanation?.trim()}
              title="AI clean-up formatting (Markdown + LaTeX)"
              className="flex items-center gap-1 hover:text-primary disabled:opacity-40"
            >
              {fmtBusy === 'explanation' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Format
            </button>
            <button
              onClick={() => togglePreview('explanation')}
              title="Toggle rendered preview"
              className="flex items-center gap-1 hover:text-text-primary"
            >
              {preview.has('explanation') ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              Preview
            </button>
          </div>
        </div>
        {preview.has('explanation') ? (
          <div className="bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary min-h-[60px]">
            <RichText>{d.explanation ?? ''}</RichText>
          </div>
        ) : (
          <textarea
            value={d.explanation ?? ''}
            onChange={(e) => update({ explanation: e.target.value })}
            className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary min-h-[60px]"
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs block">
          <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
            Source / reference (optional)
          </span>
          <input
            value={d.source_reference ?? ''}
            onChange={(e) => update({ source_reference: e.target.value || undefined })}
            placeholder="e.g. 2021 Final Exam, Q3"
            className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <div className="text-xs">
          <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
            Handwritten solution image (optional)
          </span>
          <label className="flex items-center gap-2 cursor-pointer bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:border-primary/40">
            {ocrBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageUp className="w-4 h-4" />
            )}
            <span className="truncate">
              {d.solution_image_path
                ? 'Attached — replace'
                : ocrBusy
                  ? 'Reading image…'
                  : 'Upload & OCR to solution'}
            </span>
            <input
              type="file"
              hidden
              accept="image/*"
              disabled={ocrBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSolutionImage(f);
              }}
            />
          </label>
          <p className="text-[10px] text-text-secondary mt-1">
            OCR fills the worked solution. The single answer above stays the only marking input.
          </p>
        </div>
      </div>
    </div>
  );
};

export function DraftReviewTable({
  jobId,
  onBack,
}: {
  jobId: string;
  onBack: () => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [bulkApplying, setBulkApplying] = useState<'midsem' | 'final' | 'both' | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkFilling, setBulkFilling] = useState(false);
  const [bulkTopic, setBulkTopic] = useState('');
  const [bulkDifficulty, setBulkDifficulty] = useState('');
  const [bulkSource, setBulkSource] = useState('');
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { job: j, drafts: ds } = await apiGet<{ job: Job; drafts: Draft[] }>(
        `/api/ingestion/jobs/${jobId}`
      );
      setJob(j);
      setDrafts(ds);
      if (j.program_course_id) {
        const ts = await apiGet<Topic[]>(`/api/topics?program_course_id=${j.program_course_id}`);
        setTopics(ts);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const updateDraft = (next: Draft) => {
    setDrafts((prev) => prev.map((d) => (d.id === next.id ? next : d)));
  };

  const saveDraft = async (draft: Draft) => {
    await apiPatch(`/api/ingestion/drafts/${draft.id}`, { draft_data: draft.draft_data });
  };

  const rejectDraft = async (draft: Draft) => {
    await apiDelete(`/api/ingestion/drafts/${draft.id}`);
    setDrafts((prev) => prev.map((d) => (d.id === draft.id ? { ...d, status: 'rejected' } : d)));
  };

  const bulkApplyScope = async (scope: 'midsem' | 'final' | 'both') => {
    const pending = drafts.filter((d) => d.status === 'pending');
    if (pending.length === 0) return;
    setBulkApplying(scope);
    setBulkMsg(null);
    try {
      const updated = pending.map((d) => ({
        ...d,
        draft_data: { ...d.draft_data, exam_scope: scope },
      }));
      await Promise.all(
        updated.map((d) =>
          apiPatch(`/api/ingestion/drafts/${d.id}`, { draft_data: d.draft_data })
        )
      );
      setDrafts((prev) =>
        prev.map((d) =>
          d.status === 'pending'
            ? { ...d, draft_data: { ...d.draft_data, exam_scope: scope } }
            : d
        )
      );
      setBulkMsg(`Applied ${scope} to ${pending.length} drafts.`);
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkApplying(null);
    }
  };

  const bulkFill = async () => {
    const patch: Partial<DraftData> = {};
    if (bulkTopic) patch.topic_id = bulkTopic;
    if (bulkDifficulty) patch.difficulty = bulkDifficulty as DraftData['difficulty'];
    if (bulkSource.trim()) patch.source_reference = bulkSource.trim();
    if (Object.keys(patch).length === 0) {
      setBulkMsg('Pick a topic, difficulty, or source first.');
      return;
    }
    const pending = drafts.filter((d) => d.status === 'pending');
    if (pending.length === 0) return;
    setBulkFilling(true);
    setBulkMsg(null);
    try {
      const updated = pending.map((d) => ({
        ...d,
        draft_data: { ...d.draft_data, ...patch },
      }));
      await Promise.all(
        updated.map((d) =>
          apiPatch(`/api/ingestion/drafts/${d.id}`, { draft_data: d.draft_data })
        )
      );
      setDrafts((prev) =>
        prev.map((d) =>
          d.status === 'pending' ? { ...d, draft_data: { ...d.draft_data, ...patch } } : d
        )
      );
      setBulkMsg(`Applied to ${pending.length} drafts.`);
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkFilling(false);
    }
  };

  const aiFillDetails = async () => {
    setVerifying(true);
    try {
      for (const dr of drafts.filter((x) => x.status === 'pending')) {
        await apiPatch(`/api/ingestion/drafts/${dr.id}`, { draft_data: dr.draft_data });
      }
      await apiPost(`/api/ingestion/jobs/${jobId}/verify`, {});
      await load();
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  };

  const publishAll = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      for (const d of drafts.filter((x) => x.status === 'pending')) {
        await apiPatch(`/api/ingestion/drafts/${d.id}`, { draft_data: d.draft_data });
      }
      const result = await apiPost<PublishResult>(`/api/ingestion/jobs/${jobId}/publish`, {});
      setPublishResult(result);
      await load();
    } catch (err) {
      setPublishResult({
        published_count: 0,
        skipped: [{ draft_id: '', reason: err instanceof Error ? err.message : String(err) }],
      });
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const pendingCount = drafts.filter((d) => d.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Back to jobs
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={aiFillDetails}
            disabled={verifying || publishing || pendingCount === 0}
            className="flex items-center gap-2 bg-bg-raised border border-border-subtle text-text-primary px-4 py-2 rounded-xl font-bold disabled:opacity-50 hover:bg-bg-sunken"
            title="Re-run AI completeness check + repair over the pending drafts"
          >
            {verifying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Let AI fill details
          </button>
          <button
            onClick={publishAll}
            disabled={publishing || pendingCount === 0}
            className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-xl font-bold disabled:opacity-50"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Publish {pendingCount} pending
          </button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="mb-6 bg-surface-container-low border border-border-subtle rounded-2xl px-5 py-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Bulk set exam scope:
            </span>
            {(['midsem', 'final', 'both'] as const).map((s) => (
              <button
                key={s}
                onClick={() => bulkApplyScope(s)}
                disabled={bulkApplying !== null}
                className="flex items-center gap-1.5 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken disabled:opacity-50 capitalize"
              >
                {bulkApplying === s && <Loader2 className="w-3 h-3 animate-spin" />}
                {s}
              </button>
            ))}
            {bulkMsg && (
              <span className="text-xs text-tertiary ml-auto">{bulkMsg}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border-subtle">
            <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Apply to all:
            </span>
            <select
              value={bulkTopic}
              onChange={(e) => setBulkTopic(e.target.value)}
              className="text-xs bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-text-primary"
            >
              <option value="">Topic…</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={bulkDifficulty}
              onChange={(e) => setBulkDifficulty(e.target.value)}
              className="text-xs bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-text-primary"
            >
              <option value="">Difficulty…</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <input
              value={bulkSource}
              onChange={(e) => setBulkSource(e.target.value)}
              placeholder="Source / reference…"
              className="text-xs bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-text-primary flex-1 min-w-[160px]"
            />
            <button
              onClick={bulkFill}
              disabled={bulkFilling}
              className="flex items-center gap-1.5 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken disabled:opacity-50"
            >
              {bulkFilling && <Loader2 className="w-3 h-3 animate-spin" />}
              Apply
            </button>
          </div>
        </div>
      )}

      {publishResult && (
        <div
          className={cn(
            'mb-6 px-4 py-3 rounded-xl text-sm',
            publishResult.published_count > 0
              ? 'bg-tertiary/10 text-tertiary border border-tertiary/30'
              : 'bg-red-500/10 text-red-500 border border-red-500/30'
          )}
        >
          <p className="font-bold">Published: {publishResult.published_count}</p>
          {publishResult.skipped.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-bold uppercase tracking-wider mb-1">Skipped:</p>
              <ul className="text-xs space-y-0.5">
                {publishResult.skipped.slice(0, 10).map((s, i) => (
                  <li key={i}>
                    {s.draft_id.slice(0, 8) || '—'}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {drafts.length === 0 ? (
        <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-12 text-center text-text-secondary">
          {job?.status === 'extracting' || job?.status === 'pending'
            ? 'Extraction in progress…'
            : job?.status === 'failed'
            ? 'Job failed. No drafts produced.'
            : 'No drafts found.'}
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => (
            <DraftRow
              key={d.id}
              draft={d}
              topics={topics}
              jobId={jobId}
              onChange={updateDraft}
              onSave={() => saveDraft(d)}
              onReject={() => rejectDraft(d)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
