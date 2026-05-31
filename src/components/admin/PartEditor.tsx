import { Plus, Trash2, ListChecks, Calculator } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FormattedTextField } from './FormattedTextField';
import {
  AnswerFieldsEditor,
  emptyAnswerField,
  validateAnswerFields,
  answerFieldsToPayload,
  type AnswerFieldState,
} from './AnswerFieldsEditor';

export type PartType = 'mcq' | 'calc';
type PartAnswerType = 'exact' | 'range' | 'written';

/** One sub-part of a multi-part question (form state). */
export interface PartState {
  partLabel: string;
  type: PartType;
  prompt: string;
  explanation: string;
  options: Array<{ text: string; is_correct: boolean }>;
  correctAnswer: string;
  answerType: PartAnswerType;
  answerTolerance: string;
  unit: string;
  multiAnswer: boolean;
  answerFields: AnswerFieldState[];
}

export function emptyPart(label: string): PartState {
  return {
    partLabel: label,
    type: 'calc',
    prompt: '',
    explanation: '',
    options: [
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
    correctAnswer: '',
    answerType: 'exact',
    answerTolerance: '',
    unit: '',
    multiAnswer: false,
    answerFields: [emptyAnswerField(), emptyAnswerField()],
  };
}

/** Validate one part; returns an error string (prefixed with the label) or null. */
export function validatePart(p: PartState): string | null {
  const tag = `Part ${p.partLabel || '?'}`;
  if (p.prompt.trim().length === 0) return `${tag}: prompt is required.`;
  if (p.type === 'mcq') {
    if (p.options.length < 2) return `${tag}: needs at least 2 options.`;
    if (p.options.some((o) => o.text.trim().length === 0)) return `${tag}: every option needs text.`;
    if (p.options.filter((o) => o.is_correct).length !== 1)
      return `${tag}: exactly one option must be correct.`;
  } else if (p.multiAnswer) {
    const err = validateAnswerFields(p.answerFields);
    if (err) return `${tag}: ${err}`;
  } else {
    if (p.correctAnswer.trim().length === 0) return `${tag}: needs a correct answer.`;
    if (p.answerType === 'range' && !p.answerTolerance.trim())
      return `${tag}: range answers need a tolerance.`;
    if (p.answerTolerance && Number.isNaN(Number(p.answerTolerance)))
      return `${tag}: tolerance must be a number.`;
  }
  return null;
}

/** Build the QuestionCreate payload for one part (shared metadata merged in by the caller). */
export function partToContentPayload(p: PartState, sharedStem: string, sourceReference: string) {
  const content = {
    prompt: p.prompt.trim(),
    explanation: p.explanation.trim() || undefined,
    ...(sourceReference.trim() ? { source_reference: sourceReference.trim() } : {}),
    ...(sharedStem.trim() ? { shared_stem: sharedStem.trim() } : {}),
  };
  if (p.type === 'mcq') {
    return {
      type: 'mcq' as const,
      content,
      options: p.options.map((o) => ({ text: o.text.trim(), is_correct: o.is_correct })),
    };
  }
  if (p.multiAnswer) {
    return {
      type: 'calc' as const,
      answer_type: 'multi' as const,
      content,
      answer_fields: answerFieldsToPayload(p.answerFields),
    };
  }
  return {
    type: 'calc' as const,
    answer_type: p.answerType,
    content: {
      ...content,
      correct_answer: p.correctAnswer.trim(),
      ...(p.answerTolerance ? { answer_tolerance: Number(p.answerTolerance) } : {}),
      ...(p.unit.trim() ? { unit: p.unit.trim() } : {}),
    },
  };
}

export function PartEditor({
  part,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  part: PartState;
  index: number;
  canRemove: boolean;
  onChange: (next: PartState) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<PartState>) => onChange({ ...part, ...patch });

  const setOption = (i: number, field: 'text' | 'is_correct', value: string | boolean) => {
    const next = part.options.map((o) => ({ ...o }));
    if (field === 'text') next[i].text = value as string;
    else next.forEach((o, idx) => (o.is_correct = idx === i ? (value as boolean) : false));
    set({ options: next });
  };

  return (
    <div className="bg-bg-sunken border border-border-subtle rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            value={part.partLabel}
            onChange={(e) => set({ partLabel: e.target.value })}
            className="w-12 bg-surface-container-low border border-border-subtle rounded-lg px-2 py-1 text-sm font-bold text-text-primary text-center focus:border-primary focus:outline-none"
            title="Part label"
          />
          <div className="flex gap-1">
            {(['mcq', 'calc'] as PartType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set({ type: t })}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-[11px]',
                  part.type === t
                    ? 'bg-bg-raised text-primary border border-primary/20'
                    : 'bg-surface-container-low text-text-secondary border border-border-subtle'
                )}
              >
                {t === 'mcq' ? <ListChecks className="w-3 h-3" /> : <Calculator className="w-3 h-3" />}
                {t === 'mcq' ? 'MCQ' : 'Calc'}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="p-1.5 text-text-secondary hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Remove part"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <FormattedTextField
        label={`Part ${part.partLabel || index + 1} prompt`}
        value={part.prompt}
        onChange={(v) => set({ prompt: v })}
        multiline
        minHeight="72px"
        placeholder="The task for this part only (the shared setup above is shown automatically)."
      />

      {part.type === 'mcq' ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">
              Options · pick one correct
            </label>
            <button
              type="button"
              onClick={() => part.options.length < 6 && set({ options: [...part.options, { text: '', is_correct: false }] })}
              disabled={part.options.length >= 6}
              className="flex items-center gap-1 text-xs font-bold text-primary disabled:opacity-30 hover:underline"
            >
              <Plus className="w-3 h-3" /> Add option
            </button>
          </div>
          <div className="space-y-2">
            {part.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <label
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-lg border cursor-pointer shrink-0',
                    opt.is_correct
                      ? 'bg-tertiary/15 border-tertiary text-tertiary'
                      : 'bg-surface-container-low border-border-subtle text-text-secondary hover:border-primary/40'
                  )}
                  title="Mark as correct"
                >
                  <input
                    type="radio"
                    name={`correct-part-${index}`}
                    checked={opt.is_correct}
                    onChange={() => setOption(i, 'is_correct', true)}
                    className="hidden"
                  />
                  <span className="text-xs font-bold">{String.fromCharCode(65 + i)}</span>
                </label>
                <input
                  value={opt.text}
                  onChange={(e) => setOption(i, 'text', e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 bg-surface-container-low border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => part.options.length > 2 && set({ options: part.options.filter((_, idx) => idx !== i) })}
                  disabled={part.options.length <= 2}
                  className="p-2 text-text-secondary hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove option"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={part.multiAnswer}
              onChange={(e) => set({ multiAnswer: e.target.checked })}
              className="accent-primary w-4 h-4"
            />
            <span className="text-xs font-bold text-text-primary">Multiple answers (e.g. C_A and X)</span>
          </label>
          {part.multiAnswer ? (
            <AnswerFieldsEditor fields={part.answerFields} onChange={(f) => set({ answerFields: f })} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <FormattedTextField
                  label={part.answerType === 'written' ? 'Model Answer' : 'Correct Answer'}
                  value={part.correctAnswer}
                  onChange={(v) => set({ correctAnswer: v })}
                  multiline={part.answerType === 'written'}
                  minHeight={part.answerType === 'written' ? '72px' : undefined}
                  inputClassName={part.answerType === 'written' ? undefined : 'rounded-lg'}
                  placeholder={part.answerType === 'written' ? 'Worded model answer…' : 'e.g. 0.0231'}
                />
              </div>
              {part.answerType !== 'written' && (
                <div>
                  <FormattedTextField
                    label="Unit"
                    value={part.unit}
                    onChange={(v) => set({ unit: v })}
                    multiline={false}
                    inlinePreview
                    inputClassName="rounded-lg font-mono"
                    placeholder="e.g. mol/L"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
                  Answer Type
                </label>
                <select
                  value={part.answerType}
                  onChange={(e) => set({ answerType: e.target.value as PartAnswerType })}
                  className="w-full bg-surface-container-low border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                >
                  <option value="exact">Exact</option>
                  <option value="range">Range</option>
                  <option value="written">Written</option>
                </select>
              </div>
              {part.answerType === 'range' && (
                <div className="md:col-span-2">
                  <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
                    Tolerance (± absolute)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={part.answerTolerance}
                    onChange={(e) => set({ answerTolerance: e.target.value })}
                    placeholder="0.05"
                    className="w-full bg-surface-container-low border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <FormattedTextField
        label="Explanation (optional)"
        value={part.explanation}
        onChange={(v) => set({ explanation: v })}
        multiline
        minHeight="56px"
        placeholder="Worked solution for this part."
      />
    </div>
  );
}
