import { Plus, Trash2 } from 'lucide-react';
import { FormattedTextField } from './FormattedTextField';

/** A single labeled answer field of a multi-input calc question (form state). */
export interface AnswerFieldState {
  label: string;
  correct_answer: string;
  answer_type: 'exact' | 'range';
  answer_tolerance: string;
  unit: string;
}

export function emptyAnswerField(): AnswerFieldState {
  return { label: '', correct_answer: '', answer_type: 'exact', answer_tolerance: '', unit: '' };
}

/** Validate the field list; returns an error string or null. Requires ≥2 fields. */
export function validateAnswerFields(fields: AnswerFieldState[]): string | null {
  if (fields.length < 2) return 'Multi-answer questions need at least 2 fields.';
  for (const f of fields) {
    if (f.label.trim().length === 0) return 'Every answer field needs a label.';
    if (f.correct_answer.trim().length === 0) return 'Every answer field needs a correct answer.';
    if (f.answer_type === 'range' && !f.answer_tolerance.trim()) {
      return `Field "${f.label}" is a range answer and needs a tolerance.`;
    }
    if (f.answer_tolerance && Number.isNaN(Number(f.answer_tolerance))) {
      return `Field "${f.label}" has a non-numeric tolerance.`;
    }
  }
  return null;
}

/** Map form state to the API payload shape. */
export function answerFieldsToPayload(fields: AnswerFieldState[]) {
  return fields.map((f) => ({
    label: f.label.trim(),
    correct_answer: f.correct_answer.trim(),
    answer_type: f.answer_type,
    ...(f.answer_tolerance ? { answer_tolerance: Number(f.answer_tolerance) } : {}),
    ...(f.unit.trim() ? { unit: f.unit.trim() } : {}),
  }));
}

/**
 * Editable list of multi-input answer fields (label · value · type · tolerance ·
 * unit). Used by Manual Entry (single + per-part) and the ingestion review table.
 */
export function AnswerFieldsEditor({
  fields,
  onChange,
}: {
  fields: AnswerFieldState[];
  onChange: (next: AnswerFieldState[]) => void;
}) {
  const update = (i: number, patch: Partial<AnswerFieldState>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const add = () => {
    if (fields.length >= 8) return;
    onChange([...fields, emptyAnswerField()]);
  };
  const remove = (i: number) => {
    if (fields.length <= 1) return;
    onChange(fields.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">
          Answer fields · each marked separately
        </label>
        <button
          type="button"
          onClick={add}
          disabled={fields.length >= 8}
          className="flex items-center gap-1 text-xs font-bold text-primary disabled:opacity-30 hover:underline"
        >
          <Plus className="w-3 h-3" /> Add field
        </button>
      </div>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-bg-sunken border border-border-subtle rounded-lg p-2"
          >
            <div className="md:col-span-3">
              <FormattedTextField
                label="Label"
                value={f.label}
                onChange={(v) => update(i, { label: v })}
                multiline={false}
                inlinePreview
                inputClassName="rounded-lg font-mono"
                placeholder="e.g. C_A or $X$"
              />
            </div>
            <div className="md:col-span-3">
              <FormattedTextField
                label="Correct answer"
                value={f.correct_answer}
                onChange={(v) => update(i, { correct_answer: v })}
                multiline={false}
                inputClassName="rounded-lg"
                placeholder="e.g. 0.0231"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
                Type
              </label>
              <select
                value={f.answer_type}
                onChange={(e) => update(i, { answer_type: e.target.value as 'exact' | 'range' })}
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              >
                <option value="exact">Exact</option>
                <option value="range">Range</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
                ± Tol
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={f.answer_tolerance}
                disabled={f.answer_type !== 'range'}
                onChange={(e) => update(i, { answer_tolerance: e.target.value })}
                placeholder="0.01"
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-30"
              />
            </div>
            <div className="md:col-span-2 flex items-end gap-1">
              <div className="flex-1">
                <FormattedTextField
                  label="Unit"
                  value={f.unit}
                  onChange={(v) => update(i, { unit: v })}
                  multiline={false}
                  inlinePreview
                  inputClassName="rounded-lg font-mono"
                  placeholder="mol/L"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={fields.length <= 1}
                className="p-2 mb-0.5 text-text-secondary hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Remove field"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
