# Ingestion + Editor Consistency — Design Spec

**Date**: 2026-05-24
**Scope**: Admin question authoring (manual entry, ingestion review, library group editor) + ingestion pipeline manual-split mode.

## Goals

1. Fix four bugs that block routine authoring:
   - Tolerance field rejects `0.5`, `0.`, `.5`, `0` (decimal entry impossible).
   - Shared stem is invisible in ingestion review after a multi-part split.
   - Multi-part questions cannot be deleted from the library.
   - Format + Preview controls are inconsistent across the three editors.
2. Add a manual `---` question-separator mode so the human can override AI question-boundary detection on any source (paste-text, PDF, image).
3. Keep the user-visible ingestion flow at three steps: **Upload → Review → Publish**.

## Non-goals

- No changes to the AI splitter for sub-parts (`(a)`, `(b)`, `(c)`) — that already works and is owned by AI in both manual and auto modes.
- No schema changes (`shared_stem` already exists in `question_content` and `DraftDataInput`).
- No changes to MCQ option text inputs — they stay plain inputs.
- No new permissions, no new auth surface.

---

## 1. Shared `FormattedTextField` component

The Format/Preview pattern is currently open-coded three times in [src/components/admin/ManualQuestionEntry.tsx](../../../src/components/admin/ManualQuestionEntry.tsx), three times in [src/components/admin/DraftReviewTable.tsx](../../../src/components/admin/DraftReviewTable.tsx), and zero times in [src/components/admin/QuestionGroupEditor.tsx](../../../src/components/admin/QuestionGroupEditor.tsx). Extract one component before fixing anything else.

**File**: `src/components/admin/FormattedTextField.tsx`

**Props**:
```ts
interface FormattedTextFieldProps {
  value: string;
  onChange: (next: string) => void;
  label: string;
  multiline?: boolean;          // default true; false renders <input>
  placeholder?: string;
  minHeight?: string;           // e.g. "120px", "260px" (focused mode)
  inlinePreview?: boolean;      // unit-style: small preview text BELOW, no eye toggle
  showFormat?: boolean;         // default true
  showPreview?: boolean;        // default true (ignored when inlinePreview is set)
  dataCycle?: boolean;          // add data-cycle to inner element for Tab cycling
  disabled?: boolean;
  className?: string;
}
```

**Behaviour**:
- Renders the existing label row: label on the left, `Format ✨` + `Eye / EyeOff` buttons on the right.
- `Format` button calls `POST /api/ingestion/format` with `{ text: value }` and writes the response back via `onChange`. Disabled while in flight or when `value.trim()` is empty.
- `Eye` toggle: when on, replace the textarea/input with a `<div>` of identical `minHeight` + border that renders `<RichText>{value}</RichText>`. Click again to return to editing.
- `inlinePreview` mode: render `Format ✨` only (no eye toggle), with a small one-line `Preview: <RichText inline>...</RichText>` under the input — matches today's `unit` field.
- `dataCycle` propagates `data-cycle` to the inner `<input>`/`<textarea>` so [DraftFocusModal](../../../src/components/admin/DraftReviewTable.tsx)'s Tab cycling at line 1518 keeps working.

**Local state**: `fmtBusy: boolean`, `previewOn: boolean`. No state leaves the component.

**Errors**: format-API failures are handled internally — the component renders a small red helper line under the field with the error message and clears it on the next keystroke or successful format. No prop, no callback. (Replaces today's `alert()` calls inside the open-coded format handlers.)

---

## 2. Tolerance fix — raw-string state

Today both [DraftReviewTable.tsx:664](../../../src/components/admin/DraftReviewTable.tsx#L664) and [QuestionGroupEditor.tsx:376](../../../src/components/admin/QuestionGroupEditor.tsx#L376) use `parseFloat(e.target.value) || undefined|null`. The `||` treats `0` and `NaN` (from `0.`) as falsy and discards them, so the user can never type a leading-zero decimal.

**[ManualQuestionEntry.tsx](../../../src/components/admin/ManualQuestionEntry.tsx)** — already uses raw-string state. No change.

**[DraftReviewTable.tsx](../../../src/components/admin/DraftReviewTable.tsx)** — inside `DraftRow`:
- Add local `const [toleranceStr, setToleranceStr] = useState<string>(...)` seeded from `d.answer_tolerance != null ? String(d.answer_tolerance) : ''`.
- Re-seed via `useEffect` when the upstream `d.answer_tolerance` value changes (e.g. AI fill).
- The `<input>` binds to `toleranceStr`. `onChange` calls `setToleranceStr(e.target.value)` — accepts any string while typing.
- On blur AND inside `onSave` (before persisting): coerce. Empty string → `update({ answer_tolerance: undefined })`. Else `const n = Number(str); if (Number.isFinite(n) && n >= 0) update({ answer_tolerance: n })`. Invalid input shows a small red helper line under the field; the upstream draft keeps its previous valid value.
- Persisted `DraftData.answer_tolerance` type stays `number | undefined` — no schema change.

**[QuestionGroupEditor.tsx](../../../src/components/admin/QuestionGroupEditor.tsx)**:
- Same treatment but per-part. Keep a `Record<string, string>` keyed by `part.id` for the tolerance string, seeded on load.
- Same coerce-on-blur + coerce-on-save pattern.

**Validation note**: tolerance is intentionally allowed to be `0` (interpreted as "exact match"). The current ManualQuestionEntry behaviour at line 354 (`answer_tolerance && Number.isNaN(Number(answerTolerance))`) is preserved.

Tolerance is a pure number — it does NOT use `FormattedTextField`. No Markdown, no LaTeX.

---

## 3. Shared stem in ingestion review

The split pipeline already emits `shared_stem` via [questionSplitter.ts:139](../../../backend/services/extraction/questionSplitter.ts#L139), denormalised onto every sibling part. The DB column exists. The review UI just doesn't display it.

**[DraftReviewTable.tsx — `QuestionGroupCard`](../../../src/components/admin/DraftReviewTable.tsx)**:

Add a `Shared setup / given data` field inside the group header (the section at lines 887–920 that already holds Difficulty/Topic/Exam Scope), positioned ABOVE the existing pill row.

- Implementation: `<FormattedTextField multiline minHeight="100px" label="Shared setup / given data" value={firstData.shared_stem ?? ''} onChange={(v) => updateAll({ shared_stem: v })} />`.
- `updateAll` is the existing group-level setter at line 844 — propagates the value to every sibling part, matching how Difficulty/Topic already work.
- Empty stem renders the field with the placeholder. Reviewer can type one in if the AI missed it.
- The stem is always visible regardless of which Part [a]/[b]/[c] tab is active.

Backend: no change. `shared_stem` is already in `DraftDataInput`, already persisted by `PATCH /api/ingestion/drafts/:id`, already published into `question_content.shared_stem` by the existing publish path.

---

## 3.5. Manual `---` question-separator mode

Adds a human override for the AI question-boundary detector. Works on every source type.

### UI — [IngestionUpload.tsx](../../../src/components/admin/IngestionUpload.tsx)

Above the existing inputs, render a small two-tab segmented control:

```
[ AI-detect questions ]   [ I'll split with --- ]
```

- Default: `AI-detect questions` — unchanged behaviour.
- When `I'll split with ---` is selected:
  - The paste-text placeholder updates to show an example with `---` on its own line.
  - A hint line appears: *"Put `---` on its own line between Q1, Q2, Q3… Sub-parts a/b/c stay inside one chunk — AI still splits those."*
  - For PDF / image: after OCR completes, render the extracted text in an editable `<textarea>` (or `FormattedTextField`) before submitting to the pipeline. User adds `---` separators, then clicks `Split here` to proceed.
- A `mode: 'auto' | 'manual_split'` flag goes into the ingest request.

### Backend — pipeline change

**[backend/services/extraction/pipeline.ts](../../../backend/services/extraction/pipeline.ts)**:

Add a `mode: 'auto' | 'manual_split'` parameter to the pipeline entry point. When `mode === 'manual_split'`:

- Replace the LLM classifier with a deterministic splitter:
  ```ts
  const chunks = text.split(/^\s*---\s*$/m)
                     .map(s => s.trim())
                     .filter(Boolean);
  // Edge case: no `---` in text → treat the whole text as one chunk.
  ```
- Each chunk becomes one raw draft. Default `type: 'calc'`, metadata blank — reviewer fills it.
- Topic-match, verify, and multi-part sub-part expansion (`expandMultipartRows`) **still run** per chunk. Same quality bar as the auto path; humans just own the Q1/Q2/Q3 boundary, AI still owns the (a)/(b)/(c) sub-parts.

**Route changes**: the ingestion `POST` endpoints accept the new `mode` field (default `'auto'`).

- **Paste-text + `manual_split`**: the existing single-shot POST carries `mode: 'manual_split'` and the `---`-marked text in the same request. Pipeline branches on `mode` and splits deterministically.
- **PDF/image + `manual_split`**: two-step flow. First POST runs OCR only and returns `{ job_id, ocr_text }` to the client; the client lets the user edit the text and insert `---`, then a second POST `/api/ingestion/jobs/:id/split-and-classify` carries the edited text and triggers the deterministic split + topic-match + verify. This keeps the route shapes simple and matches how the job already streams progress for OCR vs classify today.

User-visible flow stays one step (Upload). The OCR-edit interstitial is rendered inside the upload card, not a separate page.

### User-visible flow

Still **Upload → Review → Publish**. The mode toggle is a single control inside step 1. For PDF/image + manual: the OCR-edit-then-split happens inside step 1 as well — does not become a new top-level step.

---

## 4. Multi-part delete from library

### Frontend — [QuestionLibrary.tsx](../../../src/components/admin/QuestionLibrary.tsx)

Around lines 270–279 (the group card action area), add a `Delete group` button next to `Edit group`:

- Confirm dialog: *"Delete all N parts of this multi-part question? This also removes their options and any attached diagrams."*
- `handleDeleteGroup(groupId)`:
  - `DELETE /api/questions/by-group/:groupId`
  - On success: `setRows((prev) => prev.filter((r) => r.question_group_id !== groupId))`.
  - On error: `alert(message)` to match the existing `handleDelete` pattern at line 119.
- Add `deletingGroup` state symmetric to existing `deleting` so the button shows a spinner.

### Backend

**[backend/routes/questions.ts](../../../backend/routes/questions.ts)**: add `router.delete('/by-group/:groupId', requireAdmin, …)`.

**[backend/services/questionService.ts](../../../backend/services/questionService.ts)**: new `deleteQuestionGroup(groupId)`:

1. `SELECT id FROM questions WHERE question_group_id = :groupId` — get every sibling.
2. If empty → `throw new ApiError(404, 'NOT_FOUND', 'Question group not found')`.
3. `SELECT storage_path FROM question_assets WHERE question_id IN (...)` — gather all attached files.
4. For each path: `await removeFile(path).catch(() => {})` (matches `deleteQuestion` at line 379).
5. `DELETE FROM questions WHERE question_group_id = :groupId` — `question_content`, `mcq_options`, `question_assets` cascade via existing FKs (per CLAUDE.md).
6. `if (error) throw error`.

No DB schema change. No migration.

---

## 5. Apply `FormattedTextField` across all three editors

| Field | ManualQuestionEntry | DraftReviewTable | QuestionGroupEditor |
|---|---|---|---|
| Question prompt | Refactor to shared | Refactor to shared | **NEW** Format+Preview |
| Shared stem | n/a (single-part only) | **NEW** (Section 3) | Replace detached preview with in-place eye-toggle |
| Single answer (`exact`/`range` numeric input) | **NEW** Format+Preview | **NEW** Format+Preview | **NEW** Format+Preview |
| Model answer (`written` textarea) | **NEW** Format+Preview | **NEW** Format+Preview | **NEW** Format+Preview |
| Unit | Refactor to shared (inlinePreview) | Refactor to shared (inlinePreview) | **NEW** Format+Preview (inlinePreview) |
| Worked solution / explanation | Refactor to shared | Refactor to shared | **NEW** Format+Preview |
| Tolerance | unchanged plain number input | numeric input + raw-string fix (Section 2) | numeric input + raw-string fix (Section 2) |
| MCQ option text | unchanged plain input | unchanged plain input | unchanged plain input |

**Group editor specifics**:
- Delete the detached preview block at [QuestionGroupEditor.tsx:204-208](../../../src/components/admin/QuestionGroupEditor.tsx#L204-L208) — replaced by the eye-toggle pattern inside `FormattedTextField`.
- Keep tolerance, type select, answer_type select as plain inputs.

**DraftReviewTable specifics**:
- `data-cycle` attribute on prompt / answer / unit / explanation fields must be preserved through `FormattedTextField`'s `dataCycle` prop so the keyboard Tab cycle in `DraftFocusModal` keeps working.
- The `ai_matched` badge logic (`editField` at line 312) is preserved — `onChange` for the answer + explanation fields still calls the existing `editField` wrapper so touching a field clears the AI-matched flag.

---

## Architecture summary

- **One new component**: `FormattedTextField` in `src/components/admin/`. Reused 12+ times.
- **One new backend route**: `DELETE /api/questions/by-group/:groupId`.
- **One new pipeline mode**: `manual_split` in the extraction pipeline.
- **No schema changes, no migrations.**
- **Three editors refactored** to use shared component and consistent patterns.

## Data flow

- Tolerance: typed string → local state → coerce to number on blur / save → existing `DraftData.answer_tolerance` field unchanged downstream.
- Shared stem: typed in group header → `updateAll({ shared_stem })` denormalises onto every sibling → existing `PATCH /api/ingestion/drafts/:id` persists per part → existing publish path writes to `question_content.shared_stem` per part.
- Manual split: source text + `mode='manual_split'` → pipeline splits on `^\s*---\s*$` → produces N chunks → existing topic-match + verify + multi-part expansion run per chunk → drafts land in review as today.
- Group delete: click → confirm → `DELETE /api/questions/by-group/:groupId` → service collects asset paths, removes files, deletes rows → FKs cascade options + content + asset records → list re-renders without the group.

## Error handling

- Tolerance invalid string: inline red helper under the field; upstream value untouched. No alert, no toast.
- Format API failure: existing per-field error handling preserved — surfaced via small red helper line under the field (replaces today's `alert()` calls).
- Group delete failure: `alert(message)` — matches existing single-question delete.
- Manual split with zero `---` markers: whole text treated as one chunk. No error.
- Manual split with empty chunks (e.g. `--- --- ---`): empty chunks filtered out, no error.

## Testing approach

- **Tolerance**: type `0`, `0.`, `0.5`, `.5`, `0.05`, `abc` into the tolerance field in DraftReviewTable AND QuestionGroupEditor. Confirm: each typed character survives, save persists the parsed number, `abc` shows the inline error and doesn't overwrite a previously valid value.
- **Shared stem**: ingest a multi-part question, split it (auto or manual), open the group card, verify the shared stem is shown and editable above the part tabs. Type into it, switch tabs, confirm the stem stays. Publish, then open the published group editor — stem comes through.
- **Manual split**: paste 3 questions separated by `---`, submit in manual mode. Expect 3 drafts. Repeat with PDF / image — confirm the post-OCR edit step appears and the split works.
- **Group delete**: create a multi-part group, attach a diagram to one part, click `Delete group`, confirm. Verify all parts gone from the library and the storage object is gone (check via Supabase storage).
- **Format+Preview consistency**: open each of the three editors and confirm every text field except MCQ options + tolerance + type/answer-type selects has the eye-toggle and Format button, with identical styling.

## Open questions

None remaining at design time.
