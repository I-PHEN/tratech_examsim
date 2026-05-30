import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Save, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiGet, apiPatch } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { FormattedTextField } from './FormattedTextField';

interface Topic {
  id: string;
  name: string;
}

interface McqOption {
  id?: string;
  text: string;
  is_correct: boolean;
}

interface QuestionContent {
  prompt: string;
  explanation: string | null;
  correct_answer: string;
  answer_tolerance: number | null;
  unit: string | null;
  shared_stem: string | null;
}

interface QuestionPart {
  id: string;
  topic_id: string;
  type: 'mcq' | 'calc';
  difficulty: 'easy' | 'medium' | 'hard';
  exam_scope: 'midsem' | 'final' | 'both';
  answer_type: 'exact' | 'range' | 'written' | null;
  question_group_id: string | null;
  part_label: string | null;
  part_index: number | null;
  content: QuestionContent;
  options?: McqOption[];
}

interface Props {
  groupId: string;
  topics: Topic[];
  courseLabel?: string;
  onCancel: () => void;
  onDone: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}

export function QuestionGroupEditor({
  groupId,
  topics,
  courseLabel,
  onCancel,
  onDone,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parts, setParts] = useState<QuestionPart[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Shared (group-level) editable values — first part is the source of truth.
  const first = parts[0];
  const sharedStem = first?.content.shared_stem ?? '';
  const sharedTopic = first?.topic_id ?? '';
  const sharedDifficulty = first?.difficulty;
  const sharedScope = first?.exam_scope;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<QuestionPart[]>(`/api/questions/by-group/${groupId}`)
      .then((data) => {
        if (cancelled) return;
        const sorted = [...data].sort(
          (a, b) => (a.part_index ?? 0) - (b.part_index ?? 0)
        );
        setParts(sorted);
        setActiveId(sorted[0]?.id ?? '');
        setDirty(false);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const active = useMemo(() => parts.find((p) => p.id === activeId) ?? parts[0], [parts, activeId]);

  const patchActive = (patch: Partial<QuestionPart>) => {
    setParts((prev) => prev.map((p) => (p.id === active?.id ? { ...p, ...patch } : p)));
    setDirty(true);
  };
  const patchActiveContent = (patch: Partial<QuestionContent>) => {
    setParts((prev) =>
      prev.map((p) =>
        p.id === active?.id ? { ...p, content: { ...p.content, ...patch } } : p
      )
    );
    setDirty(true);
  };
  const patchAll = (patch: Partial<QuestionPart>) => {
    setParts((prev) => prev.map((p) => ({ ...p, ...patch })));
    setDirty(true);
  };
  const patchAllContent = (patch: Partial<QuestionContent>) => {
    setParts((prev) =>
      prev.map((p) => ({ ...p, content: { ...p.content, ...patch } }))
    );
    setDirty(true);
  };

  const [toleranceStrs, setToleranceStrs] = useState<Record<string, string>>({});
  const [toleranceErrors, setToleranceErrors] = useState<Record<string, string>>({});

  // Seed/refresh strings when parts load or numeric tolerance changes externally.
  useEffect(() => {
    setToleranceStrs((prev) => {
      const next = { ...prev };
      for (const p of parts) {
        const desired = p.content.answer_tolerance != null ? String(p.content.answer_tolerance) : '';
        if (!(p.id in next)) next[p.id] = desired;
      }
      return next;
    });
  }, [parts]);

  // Note: `null` (not undefined) for the empty case — `QuestionContent.answer_tolerance`
  // is typed `number | null` in this editor, vs `number | undefined` in DraftReviewTable.
  const commitPartTolerance = (partId: string): { tolerance: number | null } | null => {
    const str = (toleranceStrs[partId] ?? '').trim();
    setToleranceErrors((e) => ({ ...e, [partId]: '' }));
    if (str === '') return { tolerance: null };
    const n = Number(str);
    if (Number.isFinite(n) && n >= 0) return { tolerance: n };
    setToleranceErrors((e) => ({ ...e, [partId]: 'Tolerance must be a non-negative number.' }));
    return null;
  };

  const updateOption = (i: number, patch: Partial<McqOption>) => {
    if (!active || active.type !== 'mcq') return;
    const opts = [...(active.options ?? [])];
    opts[i] = { ...opts[i], ...patch };
    if (patch.is_correct === true) {
      for (let j = 0; j < opts.length; j++) if (j !== i) opts[j].is_correct = false;
    }
    patchActive({ options: opts });
  };

  const save = async () => {
    if (parts.length === 0) return;
    // Commit every part's tolerance string before serialising.
    const toApply: Record<string, number | null> = {};
    for (const p of parts) {
      const r = commitPartTolerance(p.id);
      if (!r) return; // invalid tolerance somewhere — abort save (error shown inline)
      toApply[p.id] = r.tolerance;
    }
    const partsWithCommit = parts.map((p) => ({
      ...p,
      content: { ...p.content, answer_tolerance: toApply[p.id] },
    }));
    setSaving(true);
    setError(null);
    try {
      const body = {
        shared: {
          topic_id: sharedTopic,
          difficulty: sharedDifficulty,
          exam_scope: sharedScope,
          shared_stem: sharedStem,
        },
        parts: partsWithCommit.map((p) => ({
          id: p.id,
          type: p.type,
          topic_id: p.topic_id,
          difficulty: p.difficulty,
          exam_scope: p.exam_scope,
          content: {
            prompt: p.content.prompt,
            explanation: p.content.explanation ?? undefined,
            shared_stem: p.content.shared_stem ?? undefined,
            ...(p.type === 'calc'
              ? {
                  correct_answer: p.content.correct_answer,
                  answer_tolerance: p.content.answer_tolerance ?? undefined,
                  unit: p.content.unit ?? undefined,
                }
              : {}),
          },
          ...(p.type === 'mcq'
            ? { options: (p.options ?? []).map((o) => ({ text: o.text, is_correct: o.is_correct })) }
            : { answer_type: p.answer_type ?? 'exact' }),
        })),
      };
      await apiPatch(`/api/questions/by-group/${groupId}`, body);
      setDirty(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!active || parts.length === 0) {
    return (
      <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-8 text-center text-text-secondary">
        {error ?? 'Group not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Back to library
        </button>
        <div className="flex items-center gap-4">
          {onPrev && (
            <button
              type="button"
              onClick={() => {
                if (dirty && !confirm('Discard unsaved changes and move to another question?')) return;
                onPrev();
              }}
              disabled={prevDisabled}
              className="flex items-center gap-1 text-xs font-bold text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={() => {
                if (dirty && !confirm('Discard unsaved changes and move to another question?')) return;
                onNext();
              }}
              disabled={nextDisabled}
              className="flex items-center gap-1 text-xs font-bold text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="text-xs text-text-secondary">
            {courseLabel ? `${courseLabel} · ` : ''}Multi-part group · {parts.length} parts
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-500 border border-red-500/30 rounded-xl px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Shared stem + classification */}
      <div className="bg-surface-container-low border border-primary/30 rounded-2xl p-5 space-y-4">
        <FormattedTextField
          label="Shared setup / given data"
          value={sharedStem}
          onChange={(v) => patchAllContent({ shared_stem: v })}
          multiline
          minHeight="120px"
          placeholder="The setup all sub-parts share (e.g. given conditions, initial values). Markdown + LaTeX."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs">
            <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
              Topic
            </span>
            <select
              value={sharedTopic}
              onChange={(e) => patchAll({ topic_id: e.target.value })}
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
            <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
              Difficulty
            </span>
            <select
              value={sharedDifficulty ?? ''}
              onChange={(e) =>
                patchAll({ difficulty: e.target.value as QuestionPart['difficulty'] })
              }
              className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
              Exam Scope
            </span>
            <select
              value={sharedScope ?? ''}
              onChange={(e) =>
                patchAll({ exam_scope: e.target.value as QuestionPart['exam_scope'] })
              }
              className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="midsem">Midsem</option>
              <option value="final">Final</option>
              <option value="both">Both</option>
            </select>
          </label>
        </div>
      </div>

      {/* Part tabs */}
      <div className="flex flex-wrap gap-1">
        {parts.map((p) => {
          const isActive = p.id === active.id;
          return (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs font-bold transition-all',
                isActive
                  ? 'bg-bg-raised border-primary/40 text-primary'
                  : 'bg-bg-sunken border-border-subtle text-text-secondary hover:bg-bg-raised'
              )}
            >
              Part {p.part_label ?? '?'}
            </button>
          );
        })}
      </div>

      {/* Active part editor */}
      <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-5 space-y-4">
        <FormattedTextField
          label={`Part ${active.part_label ?? '?'} task`}
          value={active.content.prompt}
          onChange={(v) => patchActiveContent({ prompt: v })}
          multiline
          minHeight="120px"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs">
            <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
              Type
            </span>
            <select
              value={active.type}
              onChange={(e) => patchActive({ type: e.target.value as 'mcq' | 'calc' })}
              className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="calc">Calc</option>
              <option value="mcq">MCQ</option>
            </select>
          </label>
          {active.type === 'calc' && (
            <label className="text-xs">
              <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
                Answer Type
              </span>
              <select
                value={active.answer_type ?? 'exact'}
                onChange={(e) =>
                  patchActive({ answer_type: e.target.value as QuestionPart['answer_type'] })
                }
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
              >
                <option value="exact">Exact</option>
                <option value="range">Range</option>
                <option value="written">Written</option>
              </select>
            </label>
          )}
        </div>

        {active.type === 'calc' ? (
          <div className="space-y-3">
            <FormattedTextField
              label={active.answer_type === 'written' ? 'Model answer' : 'Correct answer (numeric only)'}
              value={active.content.correct_answer ?? ''}
              onChange={(v) => patchActiveContent({ correct_answer: v })}
              multiline={active.answer_type === 'written'}
              minHeight={active.answer_type === 'written' ? '60px' : undefined}
              inputClassName={active.answer_type !== 'written' ? 'rounded-lg' : undefined}
            />
            {active.answer_type !== 'written' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="text-xs">
                  <FormattedTextField
                    label="Unit"
                    value={active.content.unit ?? ''}
                    onChange={(v) => patchActiveContent({ unit: v })}
                    multiline={false}
                    inlinePreview
                    inputClassName="rounded-lg font-mono"
                    placeholder="e.g. mol/L"
                  />
                </div>
                {active.answer_type === 'range' && (
                  <label className="text-xs">
                    <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
                      Tolerance (± absolute)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={toleranceStrs[active.id] ?? ''}
                      onChange={(e) => {
                        setToleranceStrs((prev) => ({ ...prev, [active.id]: e.target.value }));
                        setDirty(true);
                      }}
                      onBlur={() => {
                        const r = commitPartTolerance(active.id);
                        if (r) patchActiveContent({ answer_tolerance: r.tolerance });
                      }}
                      placeholder="0.05"
                      className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
                    />
                    {toleranceErrors[active.id] && (
                      <p className="mt-1 text-[10px] text-red-500">{toleranceErrors[active.id]}</p>
                    )}
                    <p className="mt-1 text-[10px] text-text-tertiary leading-snug">
                      Correct when |answer − model| ≤ tolerance.
                    </p>
                  </label>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary font-bold uppercase tracking-wider">
                Options
              </span>
              <button
                onClick={() => patchActive({ options: [...(active.options ?? []), { text: '', is_correct: false }] })}
                disabled={(active.options?.length ?? 0) >= 6}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {(active.options ?? []).map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${active.id}`}
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
                  onClick={() => {
                    const opts = [...(active.options ?? [])];
                    opts.splice(i, 1);
                    patchActive({ options: opts });
                  }}
                  disabled={(active.options?.length ?? 0) <= 2}
                  className="text-red-500 hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <FormattedTextField
          label="Worked solution / explanation (optional)"
          value={active.content.explanation ?? ''}
          onChange={(v) => patchActiveContent({ explanation: v })}
          multiline
          minHeight="100px"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="text-sm text-text-secondary hover:text-text-primary px-4 py-2"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save all parts
        </button>
      </div>
    </div>
  );
}
