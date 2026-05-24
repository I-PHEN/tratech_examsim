import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Save, Trash2, Send, Plus, Sparkles, ImageUp, Maximize2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Keyboard, KeyRound, Split, Layers, Combine } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { FormattedTextField } from './FormattedTextField';

interface DraftData {
  type: 'mcq' | 'calc';
  prompt: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  topic_id?: string;
  exam_scope?: 'midsem' | 'final' | 'both';
  options?: Array<{ text: string; is_correct: boolean }>;
  correct_answer?: string;
  answer_type?: 'exact' | 'range' | 'written';
  answer_tolerance?: number;
  unit?: string;
  explanation?: string;
  source_reference?: string;
  solution_image_path?: string;
  solution_image_mime?: string;
  /** Review-only: fields pre-filled from an uploaded markscheme. */
  ai_matched?: { correct_answer?: boolean; explanation?: boolean };
  /** A not-yet-split draft whose prompt holds several sub-parts (e.g. ["a","b"]). */
  part_labels?: string[];
  /** Multi-part grouping — sub-parts of one source question share a group_key. */
  group_key?: string;
  part_label?: string;
  part_index?: number;
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
  markscheme_path?: string | null;
}

interface Topic {
  id: string;
  name: string;
}

interface PublishResult {
  published_count: number;
  skipped: Array<{ draft_id: string; reason: string }>;
}

// === Metadata shortcut options — letter in brackets is the keyboard key ===
const TYPE_OPTS = [
  { key: 'C', value: 'calc' as const, label: 'Calc' },
  { key: 'M', value: 'mcq' as const, label: 'MCQ' },
];
const DIFFICULTY_OPTS = [
  { key: '1', value: 'easy' as const, label: 'Easy' },
  { key: '2', value: 'medium' as const, label: 'Medium' },
  { key: '3', value: 'hard' as const, label: 'Hard' },
];
const SCOPE_OPTS = [
  { key: 'S', value: 'midsem' as const, label: 'Midsem' },
  { key: 'F', value: 'final' as const, label: 'Final' },
  { key: 'B', value: 'both' as const, label: 'Both' },
];
const ANSWER_TYPE_OPTS = [
  { key: 'E', value: 'exact' as const, label: 'Exact' },
  { key: 'R', value: 'range' as const, label: 'Range' },
  { key: 'W', value: 'written' as const, label: 'Written' },
];

/** Inline shortcut-keyed pill group — replaces a metadata <select>. */
function ShortcutPills<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: { key: string; value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="text-xs">
      <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all',
                active
                  ? 'bg-bg-raised border-primary/30 text-primary'
                  : 'bg-bg-sunken border-border-subtle text-text-secondary hover:bg-bg-raised'
              )}
            >
              <kbd
                className={cn(
                  'px-1 rounded text-[10px] font-mono leading-tight',
                  active ? 'bg-primary/15 text-primary' : 'bg-bg-raised text-text-tertiary'
                )}
              >
                {o.key}
              </kbd>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Amber "AI matched" badge for markscheme-prefilled fields. */
function AiMatchedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wide"
      title="Pre-filled from the uploaded markscheme — verify before publishing"
    >
      <Sparkles className="w-2.5 h-2.5" />
      AI matched
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded bg-bg-sunken border border-border-subtle text-[10px] font-mono font-bold text-text-primary">
      {children}
    </kbd>
  );
}

const LEGEND_ROWS: { label: string; items: { k: string; desc: string }[] }[] = [
  { label: 'Type', items: [{ k: 'C', desc: 'Calc' }, { k: 'M', desc: 'MCQ' }] },
  {
    label: 'Difficulty',
    items: [{ k: '1', desc: 'Easy' }, { k: '2', desc: 'Medium' }, { k: '3', desc: 'Hard' }],
  },
  {
    label: 'Exam scope',
    items: [{ k: 'S', desc: 'Midsem' }, { k: 'F', desc: 'Final' }, { k: 'B', desc: 'Both' }],
  },
  {
    label: 'Answer type',
    items: [{ k: 'E', desc: 'Exact' }, { k: 'R', desc: 'Range' }, { k: 'W', desc: 'Written' }],
  },
  {
    label: 'Actions',
    items: [
      { k: 'Enter', desc: 'Save & next' },
      { k: 'X', desc: 'Reject & next' },
      { k: 'Esc', desc: 'Collapse' },
      { k: 'Tab', desc: 'Cycle answer fields' },
    ],
  },
];

const LEGEND_STORAGE_KEY = 'examsim.reviewShortcutsLegendOpen';

/** Collapsible keyboard-shortcut legend. Visible on first load, then remembered. */
function KeyboardLegend() {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(LEGEND_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      localStorage.setItem(LEGEND_STORAGE_KEY, String(next));
      return next;
    });
  };
  return (
    <div className="mb-4 bg-surface-container-low border border-border-subtle rounded-2xl">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3 text-text-secondary hover:text-text-primary"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
          <Keyboard className="w-4 h-4" />
          Keyboard shortcuts
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-5 pb-4 pt-3 border-t border-border-subtle space-y-2">
          <p className="text-[11px] text-text-secondary">
            Open a question with <span className="font-bold">Expand</span> to drive review from
            the keyboard — set every field and move on without the mouse.
          </p>
          {LEGEND_ROWS.map((row) => (
            <div key={row.label} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary w-24 shrink-0">
                {row.label}
              </span>
              {row.items.map((it) => (
                <span
                  key={it.k}
                  className="flex items-center gap-1 text-xs text-text-secondary"
                >
                  <Kbd>{it.k}</Kbd>
                  {it.desc}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DraftRowProps {
  draft: Draft;
  topics: Topic[];
  jobId: string;
  onChange: (next: Draft) => void;
  onSave: () => Promise<void>;
  onReject: () => Promise<void>;
  onExpand?: () => void;
  /** Provided only for ungrouped drafts — splits the draft into sub-parts. */
  onSplit?: () => void;
  splitting?: boolean;
  /** Provided only for standalone drafts — grouped parts publish via the group. */
  onPublish?: () => void;
  publishing?: boolean;
  focused?: boolean;
  /** Hide topic / difficulty / exam_scope when the parent already shows them
   *  at group level. Keeps only part-specific fields (type, answer_type, …). */
  hideClassification?: boolean;
}

const DraftRow: React.FC<DraftRowProps> = ({ draft, topics, jobId, onChange, onSave, onReject, onExpand, onSplit, splitting, onPublish, publishing, focused, hideClassification }) => {
  const [saving, setSaving] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const d = draft.draft_data;
  const [showMore, setShowMore] = useState<boolean>(() => !!d.explanation?.trim());
  const multipartHint = (d.part_labels?.length ?? 0) >= 2;
  const showSecondary = focused || showMore;

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

  // Edit a markscheme-matchable field, clearing its "AI matched" flag — once a
  // reviewer touches the field it is human-verified, so the badge disappears.
  const editField = (field: 'correct_answer' | 'explanation', value: string) => {
    const patch: Partial<DraftData> = {};
    patch[field] = value;
    if (d.ai_matched?.[field]) {
      patch.ai_matched = { ...d.ai_matched, [field]: false };
    }
    update(patch);
  };

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
    <div
      className={cn(
        'border border-border-subtle rounded-2xl p-5 bg-bg-surface space-y-4',
        d.group_key && 'border-l-4 border-l-primary/40'
      )}
    >
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span className="flex items-center gap-2">
          {d.group_key && (
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 text-[10px] font-bold uppercase tracking-wide">
              Multi-part · Part {d.part_label ?? '?'}
            </span>
          )}
          <span>
            {draft.source_page != null ? `Page ${draft.source_page}` : 'Source: n/a'}
            {draft.ai_confidence != null && ` • confidence ${(draft.ai_confidence * 100).toFixed(0)}%`}
          </span>
        </span>
        <div className="flex flex-wrap gap-2 justify-end">
          {onSplit && (
            <button
              onClick={onSplit}
              disabled={splitting}
              title="Split this multi-part question into one card per sub-part"
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold border disabled:opacity-50',
                multipartHint
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
                  : 'bg-bg-raised border-border-subtle text-text-primary hover:bg-bg-sunken'
              )}
            >
              {splitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Split className="w-3 h-3" />
              )}
              Split into parts
            </button>
          )}
          {onExpand && (
            <button
              onClick={onExpand}
              className="flex items-center gap-1.5 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken"
              title="Open in fullscreen focus mode"
            >
              <Maximize2 className="w-3 h-3" />
              Expand
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs bg-primary text-on-primary px-3 py-1.5 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
          {onPublish && (
            <button
              onClick={onPublish}
              disabled={publishing}
              title="Publish this question now"
              className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-500 disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              Publish
            </button>
          )}
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-500/20"
          >
            <Trash2 className="w-3 h-3" />
            Reject
          </button>
        </div>
      </div>

      {onSplit && multipartHint && (
        <div className="flex items-start gap-2 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <Split className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Looks multi-part (parts {d.part_labels!.join(', ')}). Use{' '}
            <b>Split into parts</b> so each sub-part gets its own answer and worked
            solution.
          </span>
        </div>
      )}

      <FormattedTextField
        label="Question prompt"
        value={d.prompt}
        onChange={(v) => update({ prompt: v })}
        multiline
        minHeight={focused ? '420px' : '80px'}
        dataCycle
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <ShortcutPills
          label="Type"
          value={d.type}
          options={TYPE_OPTS}
          onChange={(v) => update({ type: v })}
        />
        {!hideClassification && (
          <>
            <ShortcutPills
              label="Difficulty"
              value={d.difficulty}
              options={DIFFICULTY_OPTS}
              onChange={(v) => update({ difficulty: v })}
            />
            <ShortcutPills
              label="Exam Scope"
              value={d.exam_scope}
              options={SCOPE_OPTS}
              onChange={(v) => update({ exam_scope: v })}
            />
            <label className="text-xs self-start">
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
          </>
        )}
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
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-1">
                {d.ai_matched?.correct_answer && <AiMatchedBadge />}
              </div>
              <FormattedTextField
                label={d.answer_type === 'written' ? 'Model Answer' : 'Correct Answer'}
                value={d.correct_answer ?? ''}
                onChange={(v) => editField('correct_answer', v)}
                multiline={d.answer_type === 'written'}
                minHeight={d.answer_type === 'written' ? '60px' : undefined}
                inputClassName={d.answer_type !== 'written' ? 'rounded-lg' : undefined}
                dataCycle
              />
            </div>
            <ShortcutPills
              label="Answer Type"
              value={d.answer_type ?? 'exact'}
              options={ANSWER_TYPE_OPTS}
              onChange={(v) => update({ answer_type: v })}
            />
          </div>

          {/* A numeric answer keeps its unit whether it is exact OR a range. */}
          {d.answer_type !== 'written' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={cn('text-xs', d.answer_type !== 'range' && 'md:col-span-2')}>
                <FormattedTextField
                  label="Unit"
                  value={d.unit ?? ''}
                  onChange={(v) => update({ unit: v })}
                  multiline={false}
                  inlinePreview
                  dataCycle
                  inputClassName="rounded-lg font-mono"
                  placeholder="e.g. mol/L or $\\mathrm{m^{3}}$"
                />
              </div>

              {d.answer_type === 'range' && (
                <label className="text-xs">
                  <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
                    Tolerance (± absolute)
                  </span>
                  <input
                    data-cycle
                    type="number"
                    step="any"
                    min="0"
                    value={d.answer_tolerance ?? ''}
                    onChange={(e) =>
                      update({ answer_tolerance: parseFloat(e.target.value) || undefined })
                    }
                    placeholder="0.05"
                    className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
                  />
                  <p className="mt-1 text-[10px] text-text-tertiary leading-snug">
                    Correct when |answer − model| ≤ tolerance. e.g. model 12.4, tolerance 0.5 → accepts 11.9 to 12.9.
                  </p>
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {!focused && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary"
          >
            {showSecondary ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            {showSecondary ? 'Fewer details' : 'Worked solution & source'}
          </button>
        </div>
      )}

      {showSecondary && (
      <>
      <div className="text-xs block">
        <div className="flex items-center gap-2 mb-1">
          {d.ai_matched?.explanation && <AiMatchedBadge />}
        </div>
        <FormattedTextField
          label="Worked solution / explanation (optional)"
          value={d.explanation ?? ''}
          onChange={(v) => editField('explanation', v)}
          multiline
          minHeight={focused ? '260px' : '60px'}
          dataCycle
        />
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
      </>
      )}
    </div>
  );
};

interface QuestionGroupCardProps {
  groupKey: string;
  parts: Draft[];
  topics: Topic[];
  jobId: string;
  onChange: (next: Draft) => void;
  onSave: (d: Draft) => Promise<void>;
  onReject: (d: Draft) => Promise<void>;
  onExpand: (id: string) => void;
  onMerge: (groupKey: string) => Promise<void>;
  merging: boolean;
  onPublish: (groupKey: string, draftIds: string[]) => void;
  publishing: boolean;
}

/** Container for a multi-part question — `[a][b][c]` tabs over a shared group. */
const QuestionGroupCard: React.FC<QuestionGroupCardProps> = ({
  groupKey,
  parts,
  topics,
  jobId,
  onChange,
  onSave,
  onReject,
  onExpand,
  onMerge,
  merging,
  onPublish,
  publishing,
}) => {
  const [activeId, setActiveId] = useState<string>(parts[0]?.id);
  const active = parts.find((p) => p.id === activeId) ?? parts[0];
  const pendingPartIds = parts.filter((p) => p.status === 'pending').map((p) => p.id);

  // Group-level metadata — sub-parts share topic / difficulty / exam_scope.
  // First part is the source of truth; changes propagate to every sibling.
  const firstData = parts[0]?.draft_data;
  const updateAll = (patch: Partial<DraftData>) => {
    for (const p of parts) {
      onChange({ ...p, draft_data: { ...p.draft_data, ...patch } });
    }
  };

  return (
    <div className="border border-primary/30 rounded-2xl bg-primary/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-primary/20 bg-primary/[0.06]">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <Layers className="w-4 h-4" />
          Multi-part question · {parts.length} {parts.length === 1 ? 'part' : 'parts'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => onMerge(groupKey)}
            disabled={merging || publishing}
            title="Merge the parts back into one question (e.g. to re-split)"
            className="flex items-center gap-1.5 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken disabled:opacity-50"
          >
            {merging ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Combine className="w-3 h-3" />
            )}
            Merge back
          </button>
          <button
            onClick={() => onPublish(groupKey, pendingPartIds)}
            disabled={publishing || merging || pendingPartIds.length === 0}
            title="Publish all parts of this question now"
            className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-500 disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Publish question
          </button>
        </div>
      </div>

      {/* Group-level classification — set once, applies to every sub-part. */}
      {firstData && (
        <div className="px-5 pt-4 pb-3 border-b border-primary/15 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
          <ShortcutPills
            label="Difficulty"
            value={firstData.difficulty}
            options={DIFFICULTY_OPTS}
            onChange={(v) => updateAll({ difficulty: v })}
          />
          <ShortcutPills
            label="Exam Scope"
            value={firstData.exam_scope}
            options={SCOPE_OPTS}
            onChange={(v) => updateAll({ exam_scope: v })}
          />
          <label className="text-xs self-start">
            <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
              Topic
            </span>
            <select
              value={firstData.topic_id ?? ''}
              onChange={(e) => updateAll({ topic_id: e.target.value || undefined })}
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
        </div>
      )}

      <div className="flex flex-wrap gap-1 px-5 pt-3">
        {parts.map((p) => {
          const isActive = p.id === active?.id;
          const rejected = p.status !== 'pending';
          return (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs font-bold transition-all',
                isActive
                  ? 'bg-bg-raised border-primary/40 text-primary'
                  : 'bg-bg-sunken border-border-subtle text-text-secondary hover:bg-bg-raised',
                rejected && 'line-through opacity-50'
              )}
            >
              Part {p.draft_data.part_label ?? '?'}
            </button>
          );
        })}
      </div>

      <div className="px-5 pb-5 pt-3">
        {active && (
          <DraftRow
            key={active.id}
            draft={active}
            topics={topics}
            jobId={jobId}
            onChange={onChange}
            onSave={() => onSave(active)}
            onReject={() => onReject(active)}
            onExpand={active.status === 'pending' ? () => onExpand(active.id) : undefined}
            hideClassification
          />
        )}
      </div>
    </div>
  );
};

/** A draft list item — either a standalone draft or a multi-part group. */
type ReviewItem =
  | { kind: 'single'; draft: Draft }
  | { kind: 'group'; groupKey: string; parts: Draft[] };

/** Collapse drafts sharing a `group_key` into one ordered group item. */
function buildReviewItems(drafts: Draft[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  const seen = new Set<string>();
  for (const d of drafts) {
    const gk = d.draft_data.group_key;
    if (gk) {
      if (seen.has(gk)) continue;
      seen.add(gk);
      const parts = drafts
        .filter((x) => x.draft_data.group_key === gk)
        .sort(
          (a, b) => (a.draft_data.part_index ?? 0) - (b.draft_data.part_index ?? 0)
        );
      items.push({ kind: 'group', groupKey: gk, parts });
    } else {
      items.push({ kind: 'single', draft: d });
    }
  }
  return items;
}

export function DraftReviewTable({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  // null = idle; otherwise the key of the publish in flight ('all', a draft id,
  // or a group key) — drives which Publish button shows a spinner.
  const [publishingKey, setPublishingKey] = useState<string | null>(null);
  const publishing = publishingKey !== null;
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [bulkApplying, setBulkApplying] = useState<'midsem' | 'final' | 'both' | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkFilling, setBulkFilling] = useState(false);
  const [bulkTopic, setBulkTopic] = useState('');
  const [bulkDifficulty, setBulkDifficulty] = useState('');
  const [bulkSource, setBulkSource] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [matching, setMatching] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [mergingKey, setMergingKey] = useState<string | null>(null);

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
    if (focusedId === draft.id) {
      const stillPending = drafts.filter((d) => d.status === 'pending' && d.id !== draft.id);
      const currentIdx = drafts.findIndex((d) => d.id === draft.id);
      const next =
        stillPending.find((d) => drafts.indexOf(d) > currentIdx) ??
        stillPending[stillPending.length - 1];
      setFocusedId(next?.id ?? null);
    }
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

  const runMatchAnswers = async () => {
    setMatching(true);
    setBulkMsg(null);
    try {
      // Persist unsaved edits first so matching runs against current drafts.
      for (const dr of drafts.filter((x) => x.status === 'pending')) {
        await apiPatch(`/api/ingestion/drafts/${dr.id}`, { draft_data: dr.draft_data });
      }
      const result = await apiPost<{ matched: number }>(
        `/api/ingestion/jobs/${jobId}/match-answers`,
        {}
      );
      await load();
      setBulkMsg(`Matched answers for ${result.matched} draft(s) from the markscheme.`);
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setMatching(false);
    }
  };

  // Split one multi-part draft into a group of sub-part drafts.
  const splitDraft = async (draft: Draft) => {
    setSplittingId(draft.id);
    setBulkMsg(null);
    try {
      // Persist edits first so the split runs against the current prompt.
      await apiPatch(`/api/ingestion/drafts/${draft.id}`, { draft_data: draft.draft_data });
      const result = await apiPost<{ parts: number }>(
        `/api/ingestion/drafts/${draft.id}/split`,
        {}
      );
      await load();
      setBulkMsg(`Split into ${result.parts} parts.`);
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSplittingId(null);
    }
  };

  // Merge a multi-part group back into one draft.
  const mergeGroup = async (groupKey: string) => {
    setMergingKey(groupKey);
    setBulkMsg(null);
    try {
      // Persist edits on every part first.
      const parts = drafts.filter(
        (d) => d.status === 'pending' && d.draft_data.group_key === groupKey
      );
      for (const p of parts) {
        await apiPatch(`/api/ingestion/drafts/${p.id}`, { draft_data: p.draft_data });
      }
      await apiPost(`/api/ingestion/jobs/${jobId}/groups/${groupKey}/merge`, {});
      await load();
      setBulkMsg('Merged the parts back into one question.');
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setMergingKey(null);
    }
  };

  // Publish drafts as real questions. `key` marks which button is busy;
  // `draftIds` limits the publish to specific drafts (omit = all pending).
  const publish = async (key: string, draftIds?: string[]) => {
    setPublishingKey(key);
    setPublishResult(null);
    try {
      // Persist edits on the drafts being published so they go in current.
      const toSave = drafts.filter(
        (x) => x.status === 'pending' && (draftIds ? draftIds.includes(x.id) : true)
      );
      for (const d of toSave) {
        await apiPatch(`/api/ingestion/drafts/${d.id}`, { draft_data: d.draft_data });
      }
      const result = await apiPost<PublishResult>(
        `/api/ingestion/jobs/${jobId}/publish`,
        draftIds ? { draft_ids: draftIds } : {}
      );
      setPublishResult(result);
      await load();
    } catch (err) {
      setPublishResult({
        published_count: 0,
        skipped: [{ draft_id: '', reason: err instanceof Error ? err.message : String(err) }],
      });
    } finally {
      setPublishingKey(null);
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
      <KeyboardLegend />

      <div className="flex items-center justify-end mb-6">
        <div className="flex items-center gap-2">
          {job?.markscheme_path && (
            <button
              onClick={runMatchAnswers}
              disabled={matching || verifying || publishing || pendingCount === 0}
              className="flex items-center gap-2 bg-bg-raised border border-border-subtle text-text-primary px-4 py-2 rounded-xl font-bold disabled:opacity-50 hover:bg-bg-sunken"
              title="Match answers + worked solutions from the uploaded markscheme"
            >
              {matching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              Match answers
            </button>
          )}
          <button
            onClick={aiFillDetails}
            disabled={matching || verifying || publishing || pendingCount === 0}
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
            onClick={() => publish('all')}
            disabled={matching || publishing || pendingCount === 0}
            className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-xl font-bold disabled:opacity-50"
            title="Publish every pending question"
          >
            {publishingKey === 'all' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Publish all ({pendingCount})
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
          {buildReviewItems(drafts).map((item) =>
            item.kind === 'group' ? (
              <QuestionGroupCard
                key={item.groupKey}
                groupKey={item.groupKey}
                parts={item.parts}
                topics={topics}
                jobId={jobId}
                onChange={updateDraft}
                onSave={saveDraft}
                onReject={rejectDraft}
                onExpand={setFocusedId}
                onMerge={mergeGroup}
                merging={mergingKey === item.groupKey}
                onPublish={publish}
                publishing={publishingKey === item.groupKey}
              />
            ) : (
              <DraftRow
                key={item.draft.id}
                draft={item.draft}
                topics={topics}
                jobId={jobId}
                onChange={updateDraft}
                onSave={() => saveDraft(item.draft)}
                onReject={() => rejectDraft(item.draft)}
                onExpand={
                  item.draft.status === 'pending'
                    ? () => setFocusedId(item.draft.id)
                    : undefined
                }
                onSplit={
                  item.draft.status === 'pending'
                    ? () => splitDraft(item.draft)
                    : undefined
                }
                splitting={splittingId === item.draft.id}
                onPublish={
                  item.draft.status === 'pending'
                    ? () => publish(item.draft.id, [item.draft.id])
                    : undefined
                }
                publishing={publishingKey === item.draft.id}
              />
            )
          )}
        </div>
      )}

      {focusedId && (
        <DraftFocusModal
          drafts={drafts}
          focusedId={focusedId}
          topics={topics}
          jobId={jobId}
          onChange={updateDraft}
          onSave={saveDraft}
          onReject={rejectDraft}
          onClose={() => setFocusedId(null)}
          onNavigate={setFocusedId}
        />
      )}
    </div>
  );
}

interface DraftFocusModalProps {
  drafts: Draft[];
  focusedId: string;
  topics: Topic[];
  jobId: string;
  onChange: (next: Draft) => void;
  onSave: (d: Draft) => Promise<void>;
  onReject: (d: Draft) => Promise<void>;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

const DraftFocusModal: React.FC<DraftFocusModalProps> = ({
  drafts,
  focusedId,
  topics,
  jobId,
  onChange,
  onSave,
  onReject,
  onClose,
  onNavigate,
}) => {
  const pending = drafts.filter((d) => d.status === 'pending');
  const idx = pending.findIndex((d) => d.id === focusedId);
  const current = drafts.find((d) => d.id === focusedId);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < pending.length - 1;

  const goPrev = () => {
    if (hasPrev) onNavigate(pending[idx - 1].id);
  };
  const goNext = () => {
    if (hasNext) onNavigate(pending[idx + 1].id);
  };

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      const typing = isTyping(e.target);

      // Esc — collapse back to the list.
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Tab — cycle focus across the answer / unit / worked-solution fields.
      if (e.key === 'Tab') {
        const root = mainRef.current;
        if (!root) return;
        const fields = Array.from(root.querySelectorAll<HTMLElement>('[data-cycle]'));
        if (fields.length === 0) return;
        e.preventDefault();
        const pos = fields.indexOf(document.activeElement as HTMLElement);
        const delta = e.shiftKey ? -1 : 1;
        fields[(pos + delta + fields.length) % fields.length]?.focus();
        return;
      }

      // Save & advance — Enter when not editing text, or Ctrl/Cmd+Enter anywhere.
      if (e.key === 'Enter' && (!typing || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void (async () => {
          await onSave(current);
          if (hasNext) onNavigate(pending[idx + 1].id);
          else onClose();
        })();
        return;
      }

      // The remaining single-key shortcuts must never fire while typing.
      if (typing) return;

      if (e.key === 'ArrowLeft') {
        if (hasPrev) onNavigate(pending[idx - 1].id);
        return;
      }
      if (e.key === 'ArrowRight') {
        if (hasNext) onNavigate(pending[idx + 1].id);
        return;
      }

      const k = e.key.toLowerCase();
      if (k === 'x') {
        e.preventDefault();
        void onReject(current);
        return;
      }

      // Metadata shortcuts — apply to the focused draft.
      const cd = current.draft_data;
      let patch: Partial<DraftData> | null = null;
      if (k === 'c') patch = { type: 'calc' };
      else if (k === 'm') patch = { type: 'mcq' };
      else if (k === '1') patch = { difficulty: 'easy' };
      else if (k === '2') patch = { difficulty: 'medium' };
      else if (k === '3') patch = { difficulty: 'hard' };
      else if (k === 's') patch = { exam_scope: 'midsem' };
      else if (k === 'f') patch = { exam_scope: 'final' };
      else if (k === 'b') patch = { exam_scope: 'both' };
      else if (k === 'e' && cd.type === 'calc') patch = { answer_type: 'exact' };
      else if (k === 'r' && cd.type === 'calc') patch = { answer_type: 'range' };
      else if (k === 'w' && cd.type === 'calc') patch = { answer_type: 'written' };

      if (patch) {
        e.preventDefault();
        onChange({ ...current, draft_data: { ...cd, ...patch } });
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, pending, idx, hasPrev, hasNext, onChange, onClose, onNavigate, onSave, onReject]);

  if (!current) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-surface-dim/95 backdrop-blur-md flex flex-col">
      <header className="h-16 flex items-center justify-between px-6 border-b border-border-subtle shrink-0 bg-surface-container-low/80">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to list
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={!hasPrev}
            className="flex items-center gap-1 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken disabled:opacity-30"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            {idx >= 0 ? `Draft ${idx + 1} of ${pending.length}` : '—'}
          </span>
          <button
            onClick={goNext}
            disabled={!hasNext}
            className="flex items-center gap-1 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken disabled:opacity-30"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-text-secondary hover:text-text-primary"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </header>
      <main ref={mainRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <DraftRow
            key={current.id}
            draft={current}
            topics={topics}
            jobId={jobId}
            onChange={onChange}
            onSave={() => onSave(current)}
            onReject={() => onReject(current)}
            focused
          />
        </div>
      </main>
    </div>
  );
};
