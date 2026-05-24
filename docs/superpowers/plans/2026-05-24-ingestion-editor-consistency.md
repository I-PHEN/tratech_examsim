# Ingestion + Editor Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four authoring bugs (tolerance, shared stem, multi-part delete, Format/Preview consistency) and add a manual `---` question-separator mode for ingestion.

**Architecture:** Extract one shared `FormattedTextField` React component. Apply it across the three admin editors (`ManualQuestionEntry`, `DraftReviewTable`, `QuestionGroupEditor`). Add one backend route + service function (`DELETE /api/questions/by-group/:groupId`). The manual `---` split reuses existing `PATCH /jobs/:id/text` + `POST /jobs/:id/classify-segments` endpoints — no new pipeline route, no schema changes.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, Express, Supabase, Zod, KaTeX (via existing `RichText` component).

**Spec:** [docs/superpowers/specs/2026-05-24-ingestion-editor-consistency-design.md](../specs/2026-05-24-ingestion-editor-consistency-design.md)

**Out of project:** This codebase has no test runner configured (`npm run lint` runs `tsc --noEmit` only — that IS the verification gate per CLAUDE.md). Each task that touches code includes a `npm run lint` step. UI tasks include a manual smoke-test step using `npm run dev`.

---

## Task 1: Extract `FormattedTextField` shared component

**Files:**
- Create: `src/components/admin/FormattedTextField.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/admin/FormattedTextField.tsx` with the full contents below:

```tsx
import { useState } from 'react';
import { Loader2, Sparkles, Eye, EyeOff } from 'lucide-react';
import { apiPost } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { RichText } from '../ui/RichText';

export interface FormattedTextFieldProps {
  value: string;
  onChange: (next: string) => void;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  /** CSS min-height applied to BOTH the editor and the preview, so toggling never jumps. */
  minHeight?: string;
  /** unit-style: show a small inline preview line under the input instead of an eye toggle. */
  inlinePreview?: boolean;
  showFormat?: boolean;
  showPreview?: boolean;
  /** Adds `data-cycle` to the inner editor so DraftFocusModal's Tab cycle finds it. */
  dataCycle?: boolean;
  disabled?: boolean;
  className?: string;
  /** Hook into the editor's onBlur — used by tolerance-string consumers to coerce on blur. */
  onBlur?: () => void;
}

export function FormattedTextField({
  value,
  onChange,
  label,
  multiline = true,
  placeholder,
  minHeight,
  inlinePreview = false,
  showFormat = true,
  showPreview = true,
  dataCycle = false,
  disabled = false,
  className,
  onBlur,
}: FormattedTextFieldProps) {
  const [fmtBusy, setFmtBusy] = useState(false);
  const [previewOn, setPreviewOn] = useState(false);
  const [fmtError, setFmtError] = useState<string | null>(null);

  const showEyeToggle = !inlinePreview && showPreview;

  const handleFormat = async () => {
    if (!value.trim()) return;
    setFmtBusy(true);
    setFmtError(null);
    try {
      const { formatted } = await apiPost<{ formatted: string }>('/api/ingestion/format', {
        text: value,
      });
      onChange(inlinePreview ? formatted.trim() : formatted);
    } catch (err) {
      setFmtError(err instanceof Error ? err.message : String(err));
    } finally {
      setFmtBusy(false);
    }
  };

  const editorStyle = minHeight ? { minHeight } : undefined;
  const editorClass = cn(
    'w-full bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none',
    multiline && 'resize-y',
    disabled && 'opacity-50 cursor-not-allowed'
  );

  const onEditorChange = (v: string) => {
    if (fmtError) setFmtError(null);
    onChange(v);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-text-secondary font-bold block uppercase tracking-wider">
          {label}
        </label>
        <div className="flex items-center gap-3 text-text-secondary">
          {showFormat && (
            <button
              type="button"
              onClick={handleFormat}
              disabled={fmtBusy || !value.trim() || disabled}
              title="AI clean-up formatting (Markdown + LaTeX)"
              className="flex items-center gap-1 text-[11px] hover:text-primary disabled:opacity-40"
            >
              {fmtBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Format
            </button>
          )}
          {showEyeToggle && (
            <button
              type="button"
              onClick={() => setPreviewOn((v) => !v)}
              title="Toggle rendered preview"
              className="flex items-center gap-1 text-[11px] hover:text-text-primary"
            >
              {previewOn ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              Preview
            </button>
          )}
        </div>
      </div>

      {previewOn && showEyeToggle ? (
        <div className={editorClass} style={editorStyle}>
          <RichText>{value}</RichText>
        </div>
      ) : multiline ? (
        <textarea
          {...(dataCycle ? { 'data-cycle': '' } : {})}
          value={value}
          onChange={(e) => onEditorChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={editorClass}
          style={editorStyle}
        />
      ) : (
        <input
          {...(dataCycle ? { 'data-cycle': '' } : {})}
          value={value}
          onChange={(e) => onEditorChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(editorClass, 'h-auto')}
          style={editorStyle}
        />
      )}

      {inlinePreview && value.trim() && (
        <div className="mt-1 text-[10px] text-text-tertiary flex items-baseline gap-1.5">
          <span className="uppercase tracking-wider font-bold">Preview:</span>
          <span className="text-text-primary normal-case tracking-normal font-semibold">
            <RichText inline>{value}</RichText>
          </span>
        </div>
      )}

      {fmtError && (
        <p className="mt-1 text-[10px] text-red-500">{fmtError}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors. The component compiles, no unused imports, props all typed.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/FormattedTextField.tsx
git commit -m "feat(admin): add shared FormattedTextField component"
```

---

## Task 2: Refactor `ManualQuestionEntry` to use `FormattedTextField`

**Files:**
- Modify: `src/components/admin/ManualQuestionEntry.tsx`

This task swaps the existing inline Format/Preview blocks for the shared component AND adds Format/Preview to the single answer field. Tolerance stays as-is (already raw-string).

- [ ] **Step 1: Add the FormattedTextField import**

Edit the top of [src/components/admin/ManualQuestionEntry.tsx](../../../src/components/admin/ManualQuestionEntry.tsx):

```tsx
import { FormattedTextField } from './FormattedTextField';
```

And REMOVE these icons from the `lucide-react` import that are now only used inside FormattedTextField: `Sparkles`, `Eye`, `EyeOff`. (Leave `Loader2` — it's still used elsewhere.)

- [ ] **Step 2: Replace the prompt field**

Find the prompt block (around lines 563–610). Replace the entire `<div>...</div>` for the prompt label + textarea with:

```tsx
<FormattedTextField
  label="Question Prompt"
  value={prompt}
  onChange={setPrompt}
  multiline
  minHeight="120px"
  placeholder="Type the full question text here. Paste raw text and hit Format to auto-typeset math/units. For multi-part questions, create one entry per sub-part."
/>
```

Remove the now-unused local state and helpers: `fmtBusy`, `preview`, `togglePreview`, `formatField` (defined around lines 99–127).

- [ ] **Step 3: Add Format/Preview to the single answer field**

Find the calc-mode block (around lines 668–688). Replace the existing answer label + textarea/input block with:

```tsx
<div className="md:col-span-2">
  <FormattedTextField
    label={answerType === 'written' ? 'Model Answer' : 'Correct Answer'}
    value={correctAnswer}
    onChange={setCorrectAnswer}
    multiline={answerType === 'written'}
    minHeight={answerType === 'written' ? '72px' : undefined}
    placeholder={answerType === 'written'
      ? 'The worded model answer students are AI-graded against…'
      : 'e.g. 0.0231'}
  />
</div>
```

- [ ] **Step 4: Replace the unit field**

Find the unit block (around lines 690–724). Replace it with:

```tsx
<div>
  <FormattedTextField
    label="Unit"
    value={unit}
    onChange={setUnit}
    multiline={false}
    inlinePreview
    placeholder="e.g. mol/L or $\\mathrm{m^{3}}$"
  />
</div>
```

Remove the now-unused `unitFormatBusy` state and `formatUnit` function (around lines 138–157).

- [ ] **Step 5: Replace the explanation field**

Find the explanation block (around lines 762–809). Replace the entire wrapping `<div>` with:

```tsx
<FormattedTextField
  label="Explanation (optional)"
  value={explanation}
  onChange={setExplanation}
  multiline
  minHeight="70px"
  placeholder="Worked solution or hint shown after the student answers. Paste raw text and hit Format to auto-typeset."
/>
```

- [ ] **Step 6: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors. All previously-removed state references are gone.

- [ ] **Step 7: Smoke-test the screen**

If a dev server is not already running:
```powershell
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) { Stop-Process -Id $listener.OwningProcess -Force }
```
Then start in the background: `npm run dev`

Open the admin → Manual Entry screen. Confirm:
- Prompt, single answer, unit, and explanation fields all show Format + Preview controls (unit shows inline-preview line instead of eye toggle).
- Eye toggle swaps textarea ↔ rendered KaTeX in place, no layout jump.
- Format button works on at least one field (`x^2` becomes formatted).

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/ManualQuestionEntry.tsx
git commit -m "refactor(admin): use FormattedTextField in ManualQuestionEntry + add to single answer"
```

---

## Task 3: Refactor `DraftReviewTable` to use `FormattedTextField`

**Files:**
- Modify: `src/components/admin/DraftReviewTable.tsx`

Refactor the prompt/unit/explanation fields, ADD Format/Preview to the single answer field. Tolerance fix and shared-stem field come in later tasks.

- [ ] **Step 1: Add the FormattedTextField import**

Edit the top of [src/components/admin/DraftReviewTable.tsx](../../../src/components/admin/DraftReviewTable.tsx):

```tsx
import { FormattedTextField } from './FormattedTextField';
```

- [ ] **Step 2: Replace the prompt block in `DraftRow`**

Find the prompt block (around lines 452–499). Replace the entire `<div className="space-y-1.5">...</div>` with:

```tsx
<FormattedTextField
  label="Question prompt"
  value={d.prompt}
  onChange={(v) => update({ prompt: v })}
  multiline
  minHeight={focused ? '420px' : '80px'}
  dataCycle
/>
```

- [ ] **Step 3: Replace the single answer block**

Find the calc-mode answer block (around lines 580–610). Replace the entire `<label className="text-xs md:col-span-2">...</label>` with:

```tsx
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
    dataCycle
  />
</div>
```

(`editField` already exists at line 312 — preserves the `ai_matched` flag clearing behaviour.)

- [ ] **Step 4: Replace the unit block**

Find the unit block (around lines 614–650). Replace the entire `<label className={cn('text-xs', ...)}>...</label>` for unit with:

```tsx
<div className={cn('text-xs', d.answer_type !== 'range' && 'md:col-span-2')}>
  <FormattedTextField
    label="Unit"
    value={d.unit ?? ''}
    onChange={(v) => update({ unit: v })}
    multiline={false}
    inlinePreview
    dataCycle
    placeholder="e.g. mol/L or $\\mathrm{m^{3}}$"
  />
</div>
```

- [ ] **Step 5: Replace the explanation block**

Find the worked-solution block (around lines 698–754). Replace the entire `<div className="text-xs block">...</div>` for the explanation with:

```tsx
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
```

- [ ] **Step 6: Remove unused local state and helpers**

Inside `DraftRow`, delete the now-unused `fmtBusy` state (line 253), `preview` state (line 254), `togglePreview` (lines 260–266), and `formatField` (lines 268–283). The `Sparkles`, `Eye`, `EyeOff` icons can be removed from the lucide-react import IF no other call site in this file still uses them — keep them if `AiMatchedBadge` still references `Sparkles` (line 137 does, so keep it).

- [ ] **Step 7: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Smoke-test draft review**

With dev server running, open an existing ingestion job with drafts. Confirm:
- Prompt, single answer (calc), unit, explanation all show Format + Preview.
- Tab cycle in focus mode (click Expand on a draft) still moves between answer/unit/explanation fields (Tab/Shift+Tab).
- AI-matched badge still appears for fields prefilled from a markscheme, disappears after edit.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/DraftReviewTable.tsx
git commit -m "refactor(admin): use FormattedTextField in DraftReviewTable + add to single answer"
```

---

## Task 4: Tolerance raw-string fix in `DraftReviewTable`

**Files:**
- Modify: `src/components/admin/DraftReviewTable.tsx`

Replace the broken `parseFloat(x) || undefined` tolerance handler with a local string state that accepts `0`, `0.`, `0.5`, `.5`.

- [ ] **Step 1: Add tolerance string state inside `DraftRow`**

Near the top of the `DraftRow` component function (around line 251, right after `const [fmtBusy, ...]` was removed by Task 3), add:

```tsx
const [toleranceStr, setToleranceStr] = useState<string>(
  d.answer_tolerance != null ? String(d.answer_tolerance) : ''
);
const [toleranceError, setToleranceError] = useState<string | null>(null);

useEffect(() => {
  const next = d.answer_tolerance != null ? String(d.answer_tolerance) : '';
  setToleranceStr((prev) => (prev === next ? prev : next));
}, [d.answer_tolerance]);

const commitTolerance = () => {
  setToleranceError(null);
  const trimmed = toleranceStr.trim();
  if (trimmed === '') {
    update({ answer_tolerance: undefined });
    return;
  }
  const n = Number(trimmed);
  if (Number.isFinite(n) && n >= 0) {
    update({ answer_tolerance: n });
  } else {
    setToleranceError('Tolerance must be a non-negative number.');
  }
};
```

Make sure `useEffect` is imported at the top of the file (it likely already is — search for `import React, { useEffect`).

- [ ] **Step 2: Replace the tolerance input**

Find the tolerance block (around lines 653–672). Replace the entire `<label className="text-xs">...</label>` for tolerance with:

```tsx
<label className="text-xs">
  <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
    Tolerance (± absolute)
  </span>
  <input
    data-cycle
    type="text"
    inputMode="decimal"
    value={toleranceStr}
    onChange={(e) => setToleranceStr(e.target.value)}
    onBlur={commitTolerance}
    placeholder="0.05"
    className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
  />
  {toleranceError && (
    <p className="mt-1 text-[10px] text-red-500">{toleranceError}</p>
  )}
  <p className="mt-1 text-[10px] text-text-tertiary leading-snug">
    Correct when |answer − model| ≤ tolerance. e.g. model 12.4, tolerance 0.5 → accepts 11.9 to 12.9.
  </p>
</label>
```

(Switched from `type="number"` to `type="text"` + `inputMode="decimal"` so the browser doesn't strip intermediate `0.` keystrokes. Mobile keyboards still show the decimal pad via `inputMode`.)

- [ ] **Step 3: Replace `commitTolerance` with a synchronous-return version**

The Step 1 version of `commitTolerance` calls `update(...)`, which is async via React state batching. To make Save abort cleanly on invalid input AND guarantee the latest value reaches `onSave`, change `commitTolerance` to return the parsed result synchronously instead of writing to state.

Replace the `commitTolerance` function added in Step 1 with:

```tsx
const commitTolerance = (): { tolerance?: number } | null => {
  setToleranceError(null);
  const trimmed = toleranceStr.trim();
  if (trimmed === '') return { tolerance: undefined };
  const n = Number(trimmed);
  if (Number.isFinite(n) && n >= 0) return { tolerance: n };
  setToleranceError('Tolerance must be a non-negative number.');
  return null;
};
```

Update the `<input>`'s `onBlur` (set in Step 2) to:

```tsx
onBlur={() => {
  const r = commitTolerance();
  if (r) update({ answer_tolerance: r.tolerance });
}}
```

Find the existing `save` function in `DraftRow` (around line 349) and replace it with:

```tsx
const save = async () => {
  const r = commitTolerance();
  if (!r) return;
  if (r.tolerance !== d.answer_tolerance) {
    update({ answer_tolerance: r.tolerance });
  }
  setSaving(true);
  try {
    await onSave();
  } finally {
    setSaving(false);
  }
};
```

Save now aborts cleanly when the tolerance string is invalid (inline red error already shown), and forwards the latest parsed value otherwise.

- [ ] **Step 4: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Smoke-test tolerance entry**

With dev server running, open an ingestion job with a calc draft. Set `Answer Type` to `Range`. In the Tolerance field:
- Type `0` → field shows `0`.
- Clear, type `0.` → field shows `0.`.
- Clear, type `0.5` → field shows `0.5`.
- Clear, type `.5` → field shows `.5`.
- Clear, type `abc` → field shows `abc`, red error appears on blur, prior tolerance preserved.
- Type a valid number, click Save → tolerance persists. Refresh, value still there.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/DraftReviewTable.tsx
git commit -m "fix(admin): tolerance accepts 0, 0., 0.5, .5 in DraftReviewTable"
```

---

## Task 5: Add shared-stem field to `QuestionGroupCard`

**Files:**
- Modify: `src/components/admin/DraftReviewTable.tsx`

Show the `shared_stem` value that the split LLM already produces, inside the group header, propagating edits to every sibling part.

- [ ] **Step 1: Add the field above the existing pill row**

Find `QuestionGroupCard` (around line 823). Inside the group-level classification block (around line 887, `{firstData && ...}`), insert a new section BEFORE the existing `grid grid-cols-1 sm:grid-cols-3` div:

```tsx
{firstData && (
  <div className="px-5 pt-4 pb-3 border-b border-primary/15 space-y-4">
    <FormattedTextField
      label="Shared setup / given data"
      value={firstData.shared_stem ?? ''}
      onChange={(v) => updateAll({ shared_stem: v })}
      multiline
      minHeight="100px"
      placeholder="The setup all sub-parts share (e.g. given conditions, initial values). Markdown + LaTeX."
    />
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
      {/* the existing Difficulty / Exam Scope / Topic block moves in here, unchanged */}
    </div>
  </div>
)}
```

Replace the existing `{firstData && (<div className="px-5 pt-4 pb-3 border-b border-primary/15 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">...</div>)}` block with the wrapper shown above, moving its inner ShortcutPills + Topic select children inside the inner `grid` div.

- [ ] **Step 2: Verify the DraftData type already has shared_stem**

Confirm `shared_stem` is on `DraftData` in [src/components/admin/DraftReviewTable.tsx](../../../src/components/admin/DraftReviewTable.tsx) around line 28. It should already be there:

```tsx
interface DraftData {
  // ...
  shared_stem?: string;
  // ...
}
```

If missing, add `shared_stem?: string;` after `part_index?: number;`.

- [ ] **Step 3: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Smoke-test shared stem**

With dev server running:
1. Create or open a multi-part ingestion draft group.
2. Confirm a "Shared setup / given data" field appears above Difficulty/Topic/Exam Scope and above the Part [a][b][c] tabs.
3. Type into it. Click Format. Click Preview eye.
4. Switch between Part [a] and Part [b] — the stem stays visible and identical.
5. Click Save on a part. The stem persists. Refresh the job, stem is still there on every part.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/DraftReviewTable.tsx
git commit -m "feat(admin): show editable shared stem in multi-part draft groups"
```

---

## Task 6: Refactor `QuestionGroupEditor` to use `FormattedTextField` + tolerance fix

**Files:**
- Modify: `src/components/admin/QuestionGroupEditor.tsx`

This file currently uses plain textareas everywhere + the detached preview pattern the user dislikes. Convert ALL text fields to `FormattedTextField`, drop the detached preview, fix tolerance.

- [ ] **Step 1: Add imports**

Edit the top of [src/components/admin/QuestionGroupEditor.tsx](../../../src/components/admin/QuestionGroupEditor.tsx):

```tsx
import { FormattedTextField } from './FormattedTextField';
```

The existing `RichText` import can stay (used in other places? — if not, remove it). The `cn` import stays. The `useState` + `useEffect` imports stay.

- [ ] **Step 2: Replace the shared stem block**

Find the shared stem block (around lines 193–209). Replace the entire wrapping `<div>` (the one starting `<label className="text-xs font-bold uppercase tracking-wider...">Shared setup / given data</label>` and its sibling preview div) with:

```tsx
<FormattedTextField
  label="Shared setup / given data"
  value={sharedStem}
  onChange={(v) => patchAllContent({ shared_stem: v })}
  multiline
  minHeight="120px"
  placeholder="The setup all sub-parts share (e.g. given conditions, initial values). Markdown + LaTeX."
/>
```

The detached preview block (`{sharedStem.trim() && (<div className="mt-2 bg-bg-sunken...">)}`) is GONE — replaced by the eye-toggle inside `FormattedTextField`.

- [ ] **Step 3: Replace the part prompt block**

Find the active part prompt block (around lines 287–294). Replace the entire `<div>` containing the label + textarea with:

```tsx
<FormattedTextField
  label={`Part ${active.part_label ?? '?'} task`}
  value={active.content.prompt}
  onChange={(v) => patchActiveContent({ prompt: v })}
  multiline
  minHeight="120px"
/>
```

- [ ] **Step 4: Replace the calc answer block**

Find the calc-mode correct answer block (around lines 333–349). Replace the entire `<label className="text-xs block">...</label>` with:

```tsx
<FormattedTextField
  label={active.answer_type === 'written' ? 'Model answer' : 'Correct answer (numeric only)'}
  value={active.content.correct_answer ?? ''}
  onChange={(v) => patchActiveContent({ correct_answer: v })}
  multiline={active.answer_type === 'written'}
  minHeight={active.answer_type === 'written' ? '60px' : undefined}
/>
```

- [ ] **Step 5: Replace the unit block**

Find the unit block (around lines 353–362). Replace the entire `<label className="text-xs">...</label>` with:

```tsx
<div className="text-xs">
  <FormattedTextField
    label="Unit"
    value={active.content.unit ?? ''}
    onChange={(v) => patchActiveContent({ unit: v })}
    multiline={false}
    inlinePreview
    placeholder="e.g. mol/L"
  />
</div>
```

- [ ] **Step 6: Replace the worked solution block**

Find the explanation block at the bottom of the part editor (around lines 434–443). Replace the entire `<div>` containing the label + textarea with:

```tsx
<FormattedTextField
  label="Worked solution / explanation (optional)"
  value={active.content.explanation ?? ''}
  onChange={(v) => patchActiveContent({ explanation: v })}
  multiline
  minHeight="100px"
/>
```

- [ ] **Step 7: Fix tolerance to raw-string state**

Find the tolerance block (around lines 364–386). Above the `return` of the `QuestionGroupEditor` component (around line 172), add per-part tolerance string state:

```tsx
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
```

Then replace the tolerance `<label>` (around lines 364–386) with:

```tsx
<label className="text-xs">
  <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
    Tolerance (± absolute)
  </span>
  <input
    type="text"
    inputMode="decimal"
    value={toleranceStrs[active.id] ?? ''}
    onChange={(e) =>
      setToleranceStrs((prev) => ({ ...prev, [active.id]: e.target.value }))
    }
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
```

- [ ] **Step 8: Commit tolerances on Save**

Modify the existing `save` function (around line 113). Before the `setSaving(true)` line, add:

```tsx
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
```

Then in the `body` object below, change `parts: parts.map(...)` to `parts: partsWithCommit.map(...)`.

- [ ] **Step 9: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 10: Smoke-test the group editor**

With dev server running, open the admin → Question Library, pick a course that has a multi-part question, click "Edit group". Confirm:
- Shared stem, part task, model answer / correct answer, unit, worked solution ALL show Format + Preview (unit shows inline-preview).
- No detached preview boxes below any input.
- Tolerance accepts `0`, `0.`, `0.5`, `.5`. `abc` shows inline red error.
- Save persists every field. Refresh, edits are still there.

- [ ] **Step 11: Commit**

```bash
git add src/components/admin/QuestionGroupEditor.tsx
git commit -m "refactor(admin): use FormattedTextField in QuestionGroupEditor + tolerance fix"
```

---

## Task 7: Backend — delete-by-group endpoint

**Files:**
- Modify: `backend/services/questionService.ts`
- Modify: `backend/routes/questions.ts`

- [ ] **Step 1: Add `deleteQuestionGroup` service function**

In [backend/services/questionService.ts](../../../backend/services/questionService.ts), find the existing `deleteQuestion` function (around line 372). Immediately AFTER it, add:

```ts
/**
 * Delete every sibling of a multi-part question group. Removes all storage
 * objects for attached assets, then deletes the question rows (mcq_options,
 * question_content, question_assets cascade via FKs).
 */
export async function deleteQuestionGroup(groupId: string): Promise<void> {
  const { data: rows, error: fetchErr } = await supabase
    .from('questions')
    .select('id')
    .eq('question_group_id', groupId);
  if (fetchErr) throw fetchErr;
  if (!rows || rows.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Question group not found');
  }

  const ids = rows.map((r) => r.id);

  const { data: assets, error: assetsErr } = await supabase
    .from('question_assets')
    .select('storage_path')
    .in('question_id', ids);
  if (assetsErr) throw assetsErr;

  for (const a of assets ?? []) {
    await removeFile(a.storage_path).catch(() => {});
  }

  const { error: delErr } = await supabase
    .from('questions')
    .delete()
    .in('id', ids);
  if (delErr) throw delErr;
}
```

- [ ] **Step 2: Add the route**

In [backend/routes/questions.ts](../../../backend/routes/questions.ts), find the existing `import { ... }` from `'../services/questionService'`. Add `deleteQuestionGroup` to the import list.

Find the existing `router.delete('/:id', ...)` for single questions (around line 112). Immediately AFTER it, add:

```ts
router.delete(
  '/by-group/:groupId',
  asyncHandler(async (req, res) => {
    const { groupId } = parse(z.object({ groupId: uuid }), req.params);
    await deleteQuestionGroup(groupId);
    res.status(204).end();
  })
);
```

Make sure `z` and `uuid` are imported at the top of the file — they likely already are; if not:

```ts
import { z } from 'zod';
import { uuid } from '../schemas/common';
```

- [ ] **Step 3: Restart backend and verify the route works**

Restart the dev server (backend is not in watch mode — see CLAUDE.md):

```powershell
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) { Stop-Process -Id $listener.OwningProcess -Force }
```
Then `npm run dev` in the background.

Then with a known group_id (find one in the DB or create one via the UI), test via curl with a valid Firebase token. Alternatively, skip the curl test and verify via the UI in Task 8.

- [ ] **Step 4: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/services/questionService.ts backend/routes/questions.ts
git commit -m "feat(api): DELETE /api/questions/by-group/:groupId removes multi-part group"
```

---

## Task 8: Frontend — "Delete group" button in `QuestionLibrary`

**Files:**
- Modify: `src/components/admin/QuestionLibrary.tsx`

- [ ] **Step 1: Add `deletingGroup` state + handler**

Inside the `QuestionLibrary` component, near the existing `const [deleting, setDeleting] = useState<string | null>(null);` (around line 68), add:

```tsx
const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
```

Below the existing `handleDelete` function (around line 119), add:

```tsx
const handleDeleteGroup = async (groupId: string, partCount: number) => {
  if (!confirm(`Delete all ${partCount} parts of this multi-part question? This also removes their options and any attached diagrams.`)) return;
  setDeletingGroup(groupId);
  try {
    await apiDelete(`/api/questions/by-group/${groupId}`);
    setRows((prev) => prev.filter((r) => r.question_group_id !== groupId));
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    setDeletingGroup(null);
  }
};
```

- [ ] **Step 2: Add the Delete group button**

In the group card render block (around lines 270–279), find the `<div className="flex gap-2 shrink-0">` containing the existing "Edit group" button. Add a Delete group button next to it:

```tsx
<div className="flex gap-2 shrink-0">
  <button
    onClick={() => setEditingGroupId(item.groupId)}
    className="flex items-center gap-1.5 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken"
  >
    <Pencil className="w-3.5 h-3.5" />
    Edit group
  </button>
  <button
    onClick={() => handleDeleteGroup(item.groupId, item.parts.length)}
    disabled={deletingGroup === item.groupId}
    className="flex items-center gap-1.5 text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-500/20 disabled:opacity-50"
  >
    {deletingGroup === item.groupId ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : (
      <Trash2 className="w-3.5 h-3.5" />
    )}
    Delete group
  </button>
</div>
```

- [ ] **Step 3: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Smoke-test group delete**

With dev server running, open the admin → Question Library:
1. Pick a course with at least one multi-part group.
2. Click "Delete group". Cancel the confirm — nothing happens.
3. Click again, accept. The group disappears from the list. Refresh — still gone.
4. (Optional, advanced) Check the DB: `SELECT id FROM questions WHERE question_group_id = '...'` returns no rows.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/QuestionLibrary.tsx
git commit -m "feat(admin): add Delete group button for multi-part questions in library"
```

---

## Task 9: Frontend — manual `---` split mode in `IngestionUpload`

**Files:**
- Modify: `src/components/admin/IngestionUpload.tsx`

Add a "split mode" toggle. When manual is on, the paste-text path posts the `---`-separated chunks directly to `/jobs/:id/classify-segments`. PDF/image gets the same toggle wired into the existing stepwise OCR-edit flow (which already exists — see [backend/routes/ingestion.ts](../../../backend/routes/ingestion.ts) lines 309–362).

- [ ] **Step 1: Add split-mode state**

Inside `IngestionUpload`, near the other state hooks (around line 26), add:

```tsx
const [splitMode, setSplitMode] = useState<'auto' | 'manual'>('auto');
```

- [ ] **Step 2: Render the split-mode toggle above the source-type tabs**

In the render, just BEFORE the existing `<div className="flex gap-2 mb-4">` for the PDF/Image/Text Paste tabs (around line 91), insert:

```tsx
<div className="mb-3">
  <label className="text-[10px] text-text-secondary font-bold block uppercase tracking-wider mb-1">
    Question boundaries
  </label>
  <div className="flex gap-2">
    {(['auto', 'manual'] as const).map((m) => (
      <button
        key={m}
        onClick={() => setSplitMode(m)}
        className={cn(
          'flex-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all border',
          splitMode === m
            ? 'bg-bg-raised text-primary border-primary/30'
            : 'bg-surface-container-low text-text-secondary border-border-subtle hover:bg-bg-raised'
        )}
      >
        {m === 'auto' ? 'AI-detect questions' : "I'll split with ---"}
      </button>
    ))}
  </div>
  {splitMode === 'manual' && (
    <p className="text-[10px] text-text-tertiary mt-1.5 leading-snug">
      Put <code className="text-text-primary">---</code> on its own line between Q1, Q2, Q3… Sub-parts a/b/c stay inside one chunk — AI still splits those.
    </p>
  )}
</div>
```

- [ ] **Step 3: Update the text-paste placeholder when manual is on**

Find the `<textarea>` for the text-paste mode (around lines 111–117). Change the placeholder to depend on `splitMode`:

```tsx
<textarea
  value={text}
  onChange={(e) => setText(e.target.value)}
  placeholder={
    splitMode === 'manual'
      ? 'Paste raw question text here.\n\nQ1 text…\n\n---\n\nQ2 text…\n\n---\n\nQ3 text…'
      : 'Paste raw question text here...'
  }
  className="flex-1 min-h-[180px] bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none resize-none"
/>
```

- [ ] **Step 4: Wire submit() to use classify-segments for manual mode**

Find the existing `submit` function (around lines 38–86). Replace the text-mode branch (the `if (mode === 'text')` block) with this:

```tsx
if (mode === 'text') {
  if (text.trim().length < 10) throw new Error('Paste at least 10 characters of text');

  if (splitMode === 'manual') {
    setSubmitStatus('Creating job…');
    // Manual split: create the job, save reviewed_text, run classify-segments on
    // the `---`-split chunks. No AI boundary-finding.
    const segments = text
      .split(/^\s*---\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length === 0) throw new Error('No non-empty segments found');

    const created = await apiPost<{ job_id: string; status: string }>(
      '/api/ingestion/jobs',
      {
        source_type: 'text',
        text,
        program_course_id: programCourseId,
        doc_type: docType,
        mode: runMode,
        ...(model.trim() ? { model: model.trim() } : {}),
      }
    );

    setSubmitStatus(`Splitting ${segments.length} questions…`);
    await apiPost(`/api/ingestion/jobs/${created.job_id}/text`, {
      reviewed_text: text,
    });
    await apiPost(`/api/ingestion/jobs/${created.job_id}/classify-segments`, {
      segments,
    });
  } else {
    setSubmitStatus('Uploading…');
    await apiPost('/api/ingestion/jobs', {
      source_type: 'text',
      text,
      program_course_id: programCourseId,
      doc_type: docType,
      mode: runMode,
      ...(model.trim() ? { model: model.trim() } : {}),
    });
  }
}
```

Note: that `PATCH /api/ingestion/jobs/:id/text` requires `apiPatch`, not `apiPost`. Use `apiPatch` and import it from `'../../lib/apiClient'`:

```ts
import { apiPatch, apiPost, apiUpload } from '../../lib/apiClient';
```

And update the call:

```tsx
await apiPatch(`/api/ingestion/jobs/${created.job_id}/text`, {
  reviewed_text: text,
});
```

- [ ] **Step 5: Wire submit() for PDF/image + manual mode**

Below the text-mode branch, replace the existing `else` (file path) with:

```tsx
} else {
  if (!file) throw new Error('Pick a file first');
  const fd = new FormData();
  fd.append('source_type', mode);
  fd.append('program_course_id', programCourseId);
  fd.append('doc_type', docType);
  // For manual split, force stepwise mode so the user gets the OCR-edit step.
  fd.append('mode', splitMode === 'manual' ? 'stepwise' : runMode);
  if (model.trim()) fd.append('model', model.trim());
  fd.append('files', file);
  if (markschemeFile) fd.append('markscheme', markschemeFile);

  setSubmitStatus('Uploading…');
  await apiUpload('/api/ingestion/jobs', fd);
}
```

For PDF/image manual mode we lean on the existing stepwise UI (the user runs Extract → edits the OCR text inserting `---` → fires Classify-Segments via the existing Structure step UI). This task does NOT change that UI; the toggle just guarantees the user lands in stepwise mode with a clear mental model of what to do next.

- [ ] **Step 6: Update the success message based on split mode**

In the `setMsg({...})` call right after the file upload, change the success text:

```tsx
setMsg({
  text:
    splitMode === 'manual' && mode === 'text'
      ? `Job created with ${text.split(/^\s*---\s*$/m).filter((s) => s.trim()).length} questions. Open it to review.`
      : runMode === 'autonomous'
        ? 'Job created. Open it to watch the AI run each stage.'
        : 'Job created. Open it to run each stage yourself.',
  type: 'ok',
});
```

- [ ] **Step 7: Verify type-checks pass**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Smoke-test manual split (text path)**

With dev server running:
1. Admin → Ingestion → Upload.
2. Click "I'll split with ---". The hint text appears.
3. Paste:
   ```
   What is 2+2?

   ---

   What is the boiling point of water?

   ---

   Define entropy.
   ```
4. Pick a course, click Start Ingestion. Wait for the job. Open it. Expect 3 drafts, one per question. No re-blobbing.

- [ ] **Step 9: Smoke-test PDF + manual split**

With dev server running, take a sample PDF:
1. Click "I'll split with ---".
2. Pick PDF mode. Upload a 2-page sample.
3. Submit. The job lands in stepwise mode. Open it. Run Extract.
4. In the resulting text editor (Structure step in the existing UI), insert `---` between questions. Click Classify-Segments (or Structure → Classify, depending on the existing UI naming).
5. Expect drafts in the count matching the `---`-split chunks.

This step exercises the EXISTING stepwise UI; if any rough edge in the existing flow appears, file it as a follow-up — not part of this plan.

- [ ] **Step 10: Commit**

```bash
git add src/components/admin/IngestionUpload.tsx
git commit -m "feat(admin): manual --- split mode in IngestionUpload"
```

---

## Task 10: Final verification pass

**Files:** none — verification only.

- [ ] **Step 1: Full type-check**

Run: `npm run lint`
Expected: no errors anywhere in the repo.

- [ ] **Step 2: End-to-end smoke test**

With dev server running, walk through each of the four original bugs to confirm fixes:

1. **Tolerance**: Open an existing calc draft in DraftReviewTable. Set Answer Type to Range. Type `0.5` into Tolerance. The field shows `0.5`. Save. Refresh. Tolerance is `0.5`. Repeat in QuestionGroupEditor.
2. **Shared stem (review)**: Open a multi-part draft group in DraftReviewTable. Confirm the Shared setup field is visible above the part tabs and edits persist.
3. **Library delete**: Open Question Library, find a multi-part group, click Delete group, confirm. Group is gone.
4. **Format/Preview consistency**: Open all three editors. Every text field except MCQ options and tolerance shows the same Format + Preview controls (unit uses the inline-preview variant).

Then test the new feature:

5. **Manual `---` split**: Paste 3 questions separated by `---` in text-paste mode, manual split. Three drafts appear.

- [ ] **Step 3: Commit any drift**

If type-check or smoke tests revealed any missed change, fix it and commit with a `fix:` message. If everything is clean, no commit.

---

## File map summary

| File | Change |
|---|---|
| `src/components/admin/FormattedTextField.tsx` | **Created** — shared component |
| `src/components/admin/ManualQuestionEntry.tsx` | Modified — uses shared component, adds Format/Preview to single answer |
| `src/components/admin/DraftReviewTable.tsx` | Modified — uses shared component, adds shared-stem field, tolerance raw-string fix, adds Format/Preview to single answer |
| `src/components/admin/QuestionGroupEditor.tsx` | Modified — uses shared component everywhere, removes detached preview, tolerance raw-string fix |
| `src/components/admin/QuestionLibrary.tsx` | Modified — Delete group button + handler |
| `src/components/admin/IngestionUpload.tsx` | Modified — split-mode toggle + manual-split submission |
| `backend/services/questionService.ts` | Modified — `deleteQuestionGroup` function |
| `backend/routes/questions.ts` | Modified — `DELETE /by-group/:groupId` route |
