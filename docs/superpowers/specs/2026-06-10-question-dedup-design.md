# Question Duplicate Detection — Design Spec

**Date:** 2026-06-10  
**Status:** Approved

## Goal

Prevent duplicate questions from being added to the database. When an admin uploads a new batch (via ingestion) or manually authors a question, warn them if the question already exists — either as identical text or as the same concept worded differently. The warning is advisory; the admin can always proceed.

## Scope

- Ingestion draft review (per-draft warning before publish)
- Manual question entry form (inline warning while typing)
- Both exact-text and conceptual/semantic duplicates are flagged
- Scoped to the same `program_course_id` — cross-course matches are never shown

## Approach

**Semantic vector embeddings via Mistral `mistral-embed`** (1024 dimensions).

Each question's prompt is encoded as a 1024-dimensional vector and stored alongside it. Duplicate detection is a cosine similarity search in pgvector. Threshold: **0.85** — above this, questions are treated as duplicates; below, they are merely related.

Mistral is already integrated (`MISTRAL_API_KEY` present, used for OCR). No new API key or dependency needed.

---

## Architecture

```
Admin types prompt
       │
       ▼
POST /api/questions/check-duplicate          GET /api/ingestion/drafts/:id/duplicates
(manual entry, debounced 1s)                 (ingestion review, on open)
       │                                              │
       └──────────────────────┬───────────────────────┘
                              ▼
              duplicateDetector.checkForDuplicates(
                prompt, programCourseId, excludeId?
              )
                              │
                    ┌─────────▼──────────┐
                    │ getEmbedding(prompt)│  ← Mistral mistral-embed
                    └─────────┬──────────┘
                              │ vector[1024]
                    ┌─────────▼──────────────────────────┐
                    │ pgvector cosine similarity search   │
                    │ WHERE program_course_id = $pcid     │
                    │   AND similarity > 0.85             │
                    │ ORDER BY similarity DESC LIMIT 5    │
                    └─────────┬──────────────────────────┘
                              │
                    DuplicateMatch[] { question_id, prompt_preview, similarity }
```

---

## Files

| File | Action |
|------|--------|
| `backend/lib/embeddings.ts` | New — Mistral embed wrapper + backfill |
| `backend/services/duplicateDetector.ts` | New — `checkForDuplicates` |
| `backend/services/questionService.ts` | Modify — store embedding in `createQuestion` |
| `backend/routes/questions.ts` | Modify — add `POST /check-duplicate` |
| `backend/routes/ingestion.ts` | Modify — add `GET /drafts/:id/duplicates` |
| `src/components/admin/ManualQuestionEntry.tsx` | Modify — debounced check + warning |
| `src/components/admin/IngestionWizard.tsx` | Modify — per-draft duplicate banner |
| DB migration 1 | New — enable pgvector, add `embedding vector(1024)` to `question_content` |
| DB migration 2 | No migration needed — backfill runs at server startup |

---

## Database

### Migration: enable pgvector + add embedding column

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE question_content
  ADD COLUMN embedding vector(1024);

CREATE INDEX question_content_embedding_idx
  ON question_content
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
```

`lists = 10` is appropriate for up to ~100k questions. No tuning needed until past that.

### Similarity query

```sql
SELECT
  q.id            AS question_id,
  qc.prompt       AS prompt_preview,
  1 - (qc.embedding <=> $1::vector) AS similarity
FROM question_content qc
JOIN questions q ON q.id = qc.question_id
WHERE q.program_course_id = $2
  AND q.id != $3
  AND 1 - (qc.embedding <=> $1::vector) > 0.85
ORDER BY qc.embedding <=> $1::vector
LIMIT 5;
```

Parameters: `$1` = query vector, `$2` = `program_course_id`, `$3` = `excludeQuestionId` (pass `'00000000-0000-0000-0000-000000000000'` when there is no question to exclude, e.g. during manual entry before the question is created).

The Supabase JS client does not support the `<=>` operator natively, so this query is wrapped in a Postgres function `find_similar_questions` and called via `supabase.rpc`. The function is created in the same migration:

```sql
CREATE OR REPLACE FUNCTION find_similar_questions(
  query_embedding vector(1024),
  p_program_course_id uuid,
  exclude_id uuid
)
RETURNS TABLE(question_id uuid, prompt_preview text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT
    q.id,
    left(qc.prompt, 120),
    1 - (qc.embedding <=> query_embedding)
  FROM question_content qc
  JOIN questions q ON q.id = qc.question_id
  WHERE q.program_course_id = p_program_course_id
    AND q.id != exclude_id
    AND 1 - (qc.embedding <=> query_embedding) > 0.85
  ORDER BY qc.embedding <=> query_embedding
  LIMIT 5;
$$;
```

---

## Backend

### `backend/lib/embeddings.ts`

```ts
// Public API
export async function getEmbedding(text: string): Promise<number[]>
export async function backfillEmbeddings(): Promise<void>
```

- `getEmbedding` — POST to `https://api.mistral.ai/v1/embeddings` with model `mistral-embed`. Returns the first embedding vector.
- `backfillEmbeddings` — fetches all `question_content` rows where `embedding IS NULL`, generates embeddings in batches of 20, upserts. Called once at server startup from `backend/server.ts` (fire-and-forget, errors logged but not thrown).

### `backend/services/duplicateDetector.ts`

```ts
export interface DuplicateMatch {
  question_id: string;
  prompt_preview: string; // first 120 chars
  similarity: number;     // 0–1
}

export async function checkForDuplicates(
  prompt: string,
  programCourseId: string,
  excludeQuestionId?: string
): Promise<DuplicateMatch[]>
```

- Returns `[]` (never throws) if embedding fails or no matches — graceful degradation.
- Calls `supabase.rpc('find_similar_questions', { query_embedding: vec, p_program_course_id: ..., exclude_id: ... })` for the pgvector query.

### `backend/services/questionService.ts` — `createQuestion` change

After the `question_content` row is inserted, fire:

```ts
getEmbedding(input.content.prompt)
  .then(vec => supabase.from('question_content')
    .update({ embedding: vec })
    .eq('question_id', questionId))
  .catch(() => {/* log, don't throw */});
```

Fire-and-forget — embedding failure never blocks question creation.

### New API endpoints

**`POST /api/questions/check-duplicate`** — admin only

Request body:
```json
{ "prompt": "...", "program_course_id": "uuid" }
```

Response:
```json
{
  "matches": [
    { "question_id": "uuid", "prompt_preview": "...", "similarity": 0.93 }
  ]
}
```

**`GET /api/ingestion/drafts/:id/duplicates`** — admin only

Loads the draft's `draft_data.prompt` and the job's `program_course_id`, then calls `checkForDuplicates`. Response shape identical to above.

---

## Frontend

### Manual entry — `ManualQuestionEntry.tsx`

- Debounce: 1000ms after the prompt `<textarea>` `onChange` stops firing
- Call `POST /api/questions/check-duplicate` with current prompt + selected `program_course_id`
- UI states:
  - **Checking** (in-flight): subtle spinner or `"Checking for duplicates…"` text below the field
  - **Match found**: amber callout below the field — `"Possible duplicate: [prompt_preview] (93% similar)"`. Link opens the existing question in a new tab if possible.
  - **No match / error**: nothing shown — don't clutter the form for the happy path
- Does not disable or modify the submit button

### Ingestion review — `IngestionWizard.tsx`

- When a draft card is expanded/opened for review, fire `GET /api/ingestion/drafts/:id/duplicates` once
- Cache result per `draftId` in component state (don't re-fetch on re-open)
- UI states:
  - **Loading**: small spinner inside the draft card header
  - **Match found**: amber banner inside the card — `"⚠ Possible duplicate of an existing question (93% similar). You can still publish."`
  - **No match / error**: nothing shown

---

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| Mistral API down | `getEmbedding` throws → `checkForDuplicates` catches and returns `[]` |
| pgvector query fails | Logged, returns `[]` |
| Frontend request fails | Warning state is silently cleared — form/publish flow unaffected |
| Question created before embedding stores | Backfill at next server start picks it up |

---

## Similarity threshold

**0.85** is the starting default. At this threshold:
- Identical / near-identical questions score ~0.97–1.0
- Same concept, different wording: ~0.88–0.96
- Related but distinct questions: ~0.70–0.84 (not flagged)

Threshold can be adjusted as a constant in `duplicateDetector.ts` once real-world feedback is collected.

---

## Out of scope

- Deduplication across courses (by design — CSTR conversion in ChE is not a duplicate of the same question in a cross-listed Physics course)
- Auto-rejection or merging of duplicates
- Retroactive dedup scan UI (admin dashboard view of all duplicates in the bank)
