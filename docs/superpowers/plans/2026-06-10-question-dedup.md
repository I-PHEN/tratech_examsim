# Question Duplicate Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn admins when a question they are uploading (via ingestion or manual entry) is a semantic duplicate of one already in the database, using Mistral `mistral-embed` vectors stored in pgvector.

**Architecture:** Mistral `mistral-embed` (1024-dim) generates an embedding for each question prompt; embeddings are stored in a new `question_content.embedding` column; a Postgres `find_similar_questions` RPC does cosine-similarity search scoped to `program_course_id`. Two new API endpoints expose the check. Both the manual-entry form (debounced) and the ingestion draft focus modal (on open) call the check and show an amber warning. Soft warning only — never blocks publish.

**Tech Stack:** TypeScript, Express, Supabase (pgvector), Mistral REST API (existing key), React 19, Tailwind 4, Vitest. Verification: `npm run lint` (PowerShell).

---

## Files

| File | Action |
|------|--------|
| DB migration | New — `vector` extension, `embedding vector(1024)` column, `find_similar_questions` function |
| `backend/lib/embeddings.ts` | New — `getEmbedding`, `backfillEmbeddings` |
| `backend/lib/embeddings.test.ts` | New — unit tests |
| `backend/services/duplicateDetector.ts` | New — `checkForDuplicates` |
| `backend/services/duplicateDetector.test.ts` | New — unit tests |
| `backend/services/questionService.ts` | Modify — fire-and-forget embedding after content insert |
| `backend/server.ts` | Modify — call `backfillEmbeddings()` after server starts |
| `backend/routes/questions.ts` | Modify — add `POST /check-duplicate` |
| `backend/routes/ingestion.ts` | Modify — add `GET /drafts/:id/duplicates` |
| `src/components/admin/ManualQuestionEntry.tsx` | Modify — debounced check + amber warning |
| `src/components/admin/DraftReviewTable.tsx` | Modify — duplicate banner in `DraftFocusModal` |

---

### Task 1: Database migration — pgvector + embedding column + similarity function

**Files:**
- DB migration via `mcp__supabase__apply_migration`

- [ ] **Step 1: Apply the migration**

Run via `mcp__supabase__apply_migration` with name `add_question_embeddings` and SQL:

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to question_content
ALTER TABLE question_content
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- IVFFlat index for fast cosine similarity search (lists=10 suits up to ~100k rows)
CREATE INDEX IF NOT EXISTS question_content_embedding_idx
  ON question_content
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- Postgres function called by the backend via supabase.rpc.
-- Accepts float8[] so the JS client can pass a plain number array.
CREATE OR REPLACE FUNCTION find_similar_questions(
  query_embedding float8[],
  p_program_course_id uuid,
  exclude_id uuid
)
RETURNS TABLE(question_id uuid, prompt_preview text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT
    q.id,
    left(qc.prompt, 120)::text,
    (1 - (qc.embedding <=> query_embedding::vector))::float
  FROM question_content qc
  JOIN questions q ON q.id = qc.question_id
  WHERE q.program_course_id = p_program_course_id
    AND q.id != exclude_id
    AND (1 - (qc.embedding <=> query_embedding::vector)) > 0.85
  ORDER BY qc.embedding <=> query_embedding::vector
  LIMIT 5;
$$;
```

- [ ] **Step 2: Verify the column and function exist**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'question_content' AND column_name = 'embedding';
```

Expected: one row with `data_type = 'USER-DEFINED'` (pgvector's type).

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'find_similar_questions';
```

Expected: one row.

---

### Task 2: `backend/lib/embeddings.ts` — Mistral embed wrapper (TDD)

**Files:**
- Create: `backend/lib/embeddings.test.ts`
- Create: `backend/lib/embeddings.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/lib/embeddings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEmbedding } from './embeddings';

const MOCK_VECTOR = Array.from({ length: 1024 }, (_, i) => i * 0.001);

describe('getEmbedding', () => {
  beforeEach(() => {
    process.env.MISTRAL_API_KEY = 'test-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.MISTRAL_API_KEY = 'test-key';
  });

  it('calls Mistral /embeddings with correct payload and returns vector', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: MOCK_VECTOR }] }),
      })
    );

    const result = await getEmbedding('What is the conversion X?');

    expect(result).toEqual(MOCK_VECTOR);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        body: expect.stringContaining('mistral-embed'),
      })
    );
  });

  it('throws when the API returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })
    );

    await expect(getEmbedding('text')).rejects.toThrow('401');
  });

  it('throws when MISTRAL_API_KEY is not set', async () => {
    delete process.env.MISTRAL_API_KEY;
    await expect(getEmbedding('text')).rejects.toThrow('MISTRAL_API_KEY');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```powershell
npm run test -- --reporter=verbose backend/lib/embeddings.test.ts
```

Expected: 3 failures with `Cannot find module './embeddings'` or `getEmbedding is not a function`.

- [ ] **Step 3: Implement `backend/lib/embeddings.ts`**

Create `backend/lib/embeddings.ts`:

```ts
import 'dotenv/config';
import { supabase } from './supabase';

const MISTRAL_API = 'https://api.mistral.ai/v1';

function getKey(): string {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY not configured');
  return key;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const key = getKey();
  const res = await fetch(`${MISTRAL_API}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'mistral-embed', input: [text] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mistral embeddings error ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

export async function backfillEmbeddings(): Promise<void> {
  const { data: rows, error } = await supabase
    .from('question_content')
    .select('id, prompt')
    .is('embedding', null);
  if (error) {
    console.error('[embeddings] backfill query failed:', error.message);
    return;
  }
  if (!rows || rows.length === 0) return;

  const BATCH = 20;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (row) => {
        try {
          const vec = await getEmbedding(row.prompt as string);
          await supabase
            .from('question_content')
            .update({ embedding: `[${vec.join(',')}]` })
            .eq('id', row.id);
        } catch (e) {
          console.error(`[embeddings] backfill failed for content row ${row.id}:`, e);
        }
      })
    );
  }
  console.log(`[embeddings] backfilled ${rows.length} question(s)`);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```powershell
npm run test -- --reporter=verbose backend/lib/embeddings.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Run lint**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add backend/lib/embeddings.ts backend/lib/embeddings.test.ts
git commit -m "feat: add Mistral embed wrapper with backfill"
```

---

### Task 3: `backend/services/duplicateDetector.ts` (TDD)

**Files:**
- Create: `backend/services/duplicateDetector.test.ts`
- Create: `backend/services/duplicateDetector.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/services/duplicateDetector.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/embeddings', () => ({
  getEmbedding: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));

import { checkForDuplicates } from './duplicateDetector';
import { getEmbedding } from '../lib/embeddings';
import { supabase } from '../lib/supabase';

const MOCK_VECTOR = Array.from({ length: 1024 }, () => 0.1);

describe('checkForDuplicates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns matches from the RPC call', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(MOCK_VECTOR);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ question_id: 'q1', prompt_preview: 'Find conversion X', similarity: 0.92 }],
      error: null,
    });

    const result = await checkForDuplicates('Find the conversion X for a CSTR', 'course-uuid');

    expect(result).toHaveLength(1);
    expect(result[0].question_id).toBe('q1');
    expect(result[0].similarity).toBe(0.92);
    expect(supabase.rpc).toHaveBeenCalledWith('find_similar_questions', {
      query_embedding: MOCK_VECTOR,
      p_program_course_id: 'course-uuid',
      exclude_id: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('passes excludeQuestionId when provided', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(MOCK_VECTOR);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null });

    await checkForDuplicates('some prompt', 'course-uuid', 'existing-q-uuid');

    expect(supabase.rpc).toHaveBeenCalledWith('find_similar_questions', {
      query_embedding: MOCK_VECTOR,
      p_program_course_id: 'course-uuid',
      exclude_id: 'existing-q-uuid',
    });
  });

  it('returns [] when RPC returns an error', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(MOCK_VECTOR);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'connection failed' },
    });

    const result = await checkForDuplicates('some question', 'course-uuid');
    expect(result).toEqual([]);
  });

  it('returns [] when getEmbedding throws', async () => {
    vi.mocked(getEmbedding).mockRejectedValue(new Error('Mistral API down'));

    const result = await checkForDuplicates('some question', 'course-uuid');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```powershell
npm run test -- --reporter=verbose backend/services/duplicateDetector.test.ts
```

Expected: 4 failures with `Cannot find module './duplicateDetector'`.

- [ ] **Step 3: Implement `backend/services/duplicateDetector.ts`**

Create `backend/services/duplicateDetector.ts`:

```ts
import { supabase } from '../lib/supabase';
import { getEmbedding } from '../lib/embeddings';

const NULL_UUID = '00000000-0000-0000-0000-000000000000';

export interface DuplicateMatch {
  question_id: string;
  prompt_preview: string;
  similarity: number;
}

export async function checkForDuplicates(
  prompt: string,
  programCourseId: string,
  excludeQuestionId?: string
): Promise<DuplicateMatch[]> {
  try {
    const embedding = await getEmbedding(prompt);
    const { data, error } = await supabase.rpc('find_similar_questions', {
      query_embedding: embedding,
      p_program_course_id: programCourseId,
      exclude_id: excludeQuestionId ?? NULL_UUID,
    });
    if (error) {
      console.error('[duplicateDetector] RPC error:', error.message);
      return [];
    }
    return (data ?? []) as DuplicateMatch[];
  } catch (e) {
    console.error('[duplicateDetector] check failed:', e);
    return [];
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```powershell
npm run test -- --reporter=verbose backend/services/duplicateDetector.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Run lint**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add backend/services/duplicateDetector.ts backend/services/duplicateDetector.test.ts
git commit -m "feat: add duplicate detector service using pgvector cosine similarity"
```

---

### Task 4: Wire embedding into `createQuestion` + startup backfill

**Files:**
- Modify: `backend/services/questionService.ts`
- Modify: `backend/server.ts`

- [ ] **Step 1: Add embedding fire-and-forget in `createQuestion`**

In `backend/services/questionService.ts`, add the import at the top of the file alongside the other imports:

Find:
```ts
import { supabase } from '../lib/supabase';
```

Replace with:
```ts
import { supabase } from '../lib/supabase';
import { getEmbedding } from '../lib/embeddings';
```

Then find the line where `question_content` is inserted (the line that checks `contentErr`):

```ts
    const { error: contentErr } = await supabase.from('question_content').insert(contentRow);
    if (contentErr) throw contentErr;
```

Replace with:

```ts
    const { error: contentErr } = await supabase.from('question_content').insert(contentRow);
    if (contentErr) throw contentErr;

    getEmbedding(input.content.prompt)
      .then((vec) =>
        supabase
          .from('question_content')
          .update({ embedding: `[${vec.join(',')}]` })
          .eq('question_id', questionId)
      )
      .catch((e) => console.error('[embeddings] failed to store for question', questionId, e));
```

- [ ] **Step 2: Add backfill call in `server.ts`**

In `backend/server.ts`, add the import at the top:

Find:
```ts
import 'dotenv/config';
```

Replace with:
```ts
import 'dotenv/config';
import { backfillEmbeddings } from './lib/embeddings';
```

Then find:
```ts
startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

Replace with:
```ts
startServer()
  .then(() => {
    backfillEmbeddings().catch((e) => console.error('[embeddings] backfill failed:', e));
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
```

- [ ] **Step 3: Run lint**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```powershell
npm run test
```

Expected: all tests pass (the new `getEmbedding` call in `createQuestion` has no test impact since it's fire-and-forget).

- [ ] **Step 5: Commit**

```powershell
git add backend/services/questionService.ts backend/server.ts
git commit -m "feat: store embedding on question create, backfill on startup"
```

---

### Task 5: API endpoints — check-duplicate + ingestion drafts duplicate

**Files:**
- Modify: `backend/routes/questions.ts`
- Modify: `backend/routes/ingestion.ts`

- [ ] **Step 1: Add `POST /check-duplicate` to `questions.ts`**

In `backend/routes/questions.ts`, add the import alongside the existing service imports:

Find:
```ts
import {
  addQuestionAsset,
  createQuestion,
  deleteQuestion,
  deleteQuestionGroup,
  getQuestionById,
  getQuestionsByGroup,
  listQuestions,
  removeQuestionAsset,
  updateQuestion,
  updateQuestionGroup,
} from '../services/questionService';
```

Replace with:
```ts
import {
  addQuestionAsset,
  createQuestion,
  deleteQuestion,
  deleteQuestionGroup,
  getQuestionById,
  getQuestionsByGroup,
  listQuestions,
  removeQuestionAsset,
  updateQuestion,
  updateQuestionGroup,
} from '../services/questionService';
import { checkForDuplicates } from '../services/duplicateDetector';
```

Then add this route immediately after the `router.get('/by-group/:groupId', ...)` route and before the `router.patch('/by-group/:groupId', ...)` route. Insert after line that says `res.json(data);` and `});` closing the `by-group GET`:

Find:
```ts
router.patch(
  '/by-group/:groupId',
  requireAdmin,
```

Insert before it:
```ts
router.post(
  '/check-duplicate',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ prompt: z.string().min(1), program_course_id: z.string().uuid() }),
      req.body
    );
    const matches = await checkForDuplicates(body.prompt, body.program_course_id);
    res.json({ matches });
  })
);

```

- [ ] **Step 2: Add `GET /drafts/:id/duplicates` to `ingestion.ts`**

In `backend/routes/ingestion.ts`, add the import alongside the existing service imports:

Find:
```ts
import {
  publishJob,
  extractJob,
  classifyJob,
  verifyJob,
  ocrSolutionImage,
  structureJob,
  suggestBoundaries,
  createSegmentDrafts,
  classifySegmentsJob,
  formatText,
  matchMarkschemeAnswers,
  splitDraft,
  mergeGroup,
} from '../services/ingestionService';
```

Replace with:
```ts
import {
  publishJob,
  extractJob,
  classifyJob,
  verifyJob,
  ocrSolutionImage,
  structureJob,
  suggestBoundaries,
  createSegmentDrafts,
  classifySegmentsJob,
  formatText,
  matchMarkschemeAnswers,
  splitDraft,
  mergeGroup,
} from '../services/ingestionService';
import { checkForDuplicates } from '../services/duplicateDetector';
```

Then add the new route before the `export default router;` line at the end of the file:

Find:
```ts
router.post(
  '/jobs/:id/publish',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(PublishInput, req.body ?? {});
    const result = await publishJob(id, body.draft_ids);
    res.json(result);
  })
);

export default router;
```

Replace with:
```ts
router.post(
  '/jobs/:id/publish',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(PublishInput, req.body ?? {});
    const result = await publishJob(id, body.draft_ids);
    res.json(result);
  })
);

router.get(
  '/drafts/:id/duplicates',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);

    const { data: draft, error: draftErr } = await supabase
      .from('ingestion_drafts')
      .select('draft_data, job_id')
      .eq('id', id)
      .maybeSingle();
    if (draftErr) throw draftErr;
    if (!draft) throw new ApiError(404, 'NOT_FOUND', 'Draft not found');

    const { data: job, error: jobErr } = await supabase
      .from('ingestion_jobs')
      .select('program_course_id')
      .eq('id', draft.job_id)
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job?.program_course_id) {
      res.json({ matches: [] });
      return;
    }

    const prompt = ((draft.draft_data as { prompt?: string }).prompt ?? '').trim();
    if (!prompt) {
      res.json({ matches: [] });
      return;
    }

    const matches = await checkForDuplicates(prompt, job.program_course_id);
    res.json({ matches });
  })
);

export default router;
```

- [ ] **Step 3: Run lint**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```powershell
npm run test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/routes/questions.ts backend/routes/ingestion.ts
git commit -m "feat: add check-duplicate and draft duplicates API endpoints"
```

---

### Task 6: Frontend — `ManualQuestionEntry.tsx` debounced check

**Files:**
- Modify: `src/components/admin/ManualQuestionEntry.tsx`

- [ ] **Step 1: Add `useRef` to the React import**

Find:
```ts
import { useEffect, useState } from 'react';
```

Replace with:
```ts
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Add `DuplicateMatch` interface and state near the top of the component**

Find the line:
```ts
  const [programCourseId, setProgramCourseId] = useState('');
```

Insert before it:
```ts
  interface DuplicateMatch {
    question_id: string;
    prompt_preview: string;
    similarity: number;
  }

```

Then find:
```ts
  const [programCourseId, setProgramCourseId] = useState('');
```

After the block of `useState` calls (find the one for `prompt`):
```ts
  const [prompt, setPrompt] = useState('');
```

Replace with:
```ts
  const [prompt, setPrompt] = useState('');
  const [dupMatches, setDupMatches] = useState<DuplicateMatch[]>([]);
  const [dupChecking, setDupChecking] = useState(false);
  const dupTimerRef = useRef<number | null>(null);
```

- [ ] **Step 3: Add the debounced duplicate-check effect**

Find the `useEffect` that loads topics (it reads `programCourseId`):
```ts
  }, [programCourseId, editing]);
```

Insert after that closing bracket and blank line:
```ts
  useEffect(() => {
    if (dupTimerRef.current) window.clearTimeout(dupTimerRef.current);
    if (!prompt.trim() || !programCourseId) {
      setDupMatches([]);
      return;
    }
    dupTimerRef.current = window.setTimeout(async () => {
      setDupChecking(true);
      try {
        const { matches } = await apiPost<{ matches: DuplicateMatch[] }>(
          '/api/questions/check-duplicate',
          { prompt: prompt.trim(), program_course_id: programCourseId }
        );
        setDupMatches(matches);
      } catch {
        setDupMatches([]);
      } finally {
        setDupChecking(false);
      }
    }, 1000);
    return () => {
      if (dupTimerRef.current) window.clearTimeout(dupTimerRef.current);
    };
  }, [prompt, programCourseId]);

```

- [ ] **Step 4: Add the duplicate warning UI below the prompt field**

Find the `FormattedTextField` for the prompt (it has `value={prompt}` and `onChange={(v) => { setPrompt(v); setDirty(true); }}`). It will be inside a container div. Find the closing of that field's wrapper and insert the warning after it.

Find:
```tsx
            value={prompt}
            onChange={(v) => { setPrompt(v); setDirty(true); }}
```

That `FormattedTextField` will close with `/>` or `</FormattedTextField>`. Find the element that closes right after and insert the warning. Search for the pattern to identify the right spot:

Find the `FormattedTextField` usage with `value={prompt}` and look for its enclosing `div` that closes right after. Then after that closing `</div>`, before the next section, add:

```tsx
            {dupChecking && (
              <p className="mt-1.5 text-[11px] text-text-tertiary">Checking for duplicates…</p>
            )}
            {!dupChecking && dupMatches.length > 0 && (
              <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                <strong>Possible duplicate</strong> — {Math.round(dupMatches[0].similarity * 100)}% similar to an existing question:{' '}
                <span className="italic">"{dupMatches[0].prompt_preview}"</span>. You can still submit.
              </div>
            )}
```

The exact insertion point is after the `FormattedTextField` with `value={prompt}`. In the file, find:

```tsx
            value={prompt}
            onChange={(v) => { setPrompt(v); setDirty(true); }}
```

The `FormattedTextField` props end and then the tag closes. Find what immediately follows — it will be something like `/>` then a closing div, then the next field. Insert the warning block right after the `FormattedTextField` closes, inside the same container div.

To locate precisely: search for the unique string `onChange={(v) => { setPrompt(v); setDirty(true); }}` in the file — there should be exactly one occurrence. The `FormattedTextField` closes right after (either `/>` on the next line or as part of the same expression). Insert the warning JSX after the closing of that `FormattedTextField` element.

- [ ] **Step 5: Run lint**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/components/admin/ManualQuestionEntry.tsx
git commit -m "feat: add debounced duplicate warning to manual question entry form"
```

---

### Task 7: Frontend — `DraftReviewTable.tsx` duplicate banner in focus modal

**Files:**
- Modify: `src/components/admin/DraftReviewTable.tsx`

- [ ] **Step 1: Add `DuplicateMatch` interface and `apiGet` import**

`apiGet` is already imported at the top of `DraftReviewTable.tsx`. Add the `DuplicateMatch` interface after the `PublishResult` interface near the top of the file:

Find:
```ts
interface PublishResult {
  published_count: number;
  skipped: Array<{ draft_id: string; reason: string }>;
}
```

Insert after it:
```ts
interface DuplicateMatch {
  question_id: string;
  prompt_preview: string;
  similarity: number;
}
```

- [ ] **Step 2: Add duplicate-check state and effect in `DraftFocusModal`**

Find the start of `DraftFocusModal`'s function body:

```ts
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
```

Replace with:
```ts
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

  const [dupMatches, setDupMatches] = useState<DuplicateMatch[]>([]);
  const [dupChecking, setDupChecking] = useState(false);

  useEffect(() => {
    setDupMatches([]);
    setDupChecking(true);
    apiGet<{ matches: DuplicateMatch[] }>(`/api/ingestion/drafts/${focusedId}/duplicates`)
      .then(({ matches }) => setDupMatches(matches))
      .catch(() => {})
      .finally(() => setDupChecking(false));
  }, [focusedId]);
```

- [ ] **Step 3: Add the amber banner in the modal's `<main>` section**

Find inside `DraftFocusModal`'s render:
```tsx
      <main ref={mainRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <DraftRow
```

Replace with:
```tsx
      <main ref={mainRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {dupChecking && (
            <p className="mb-3 text-[11px] text-text-tertiary">Checking for duplicates…</p>
          )}
          {!dupChecking && dupMatches.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
              <strong>Possible duplicate</strong> — {Math.round(dupMatches[0].similarity * 100)}% similar to an existing question:{' '}
              <span className="italic">"{dupMatches[0].prompt_preview}"</span>. You can still publish.
            </div>
          )}
          <DraftRow
```

- [ ] **Step 4: Run lint**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```powershell
npm run test
```

Expected: all 121+ tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/components/admin/DraftReviewTable.tsx
git commit -m "feat: show duplicate warning in draft focus modal"
```

---

## Manual Verification

After all tasks complete, restart the dev server and verify:

1. Open **http://localhost:3000** → Admin → Manual Entry
2. Type a prompt that is similar to an existing question — after ~1s, an amber warning should appear below the prompt field
3. Open Admin → Ingestion → open any job with drafts → click Expand on a draft — a "Checking for duplicates…" message should briefly appear, then either an amber banner or nothing

To confirm the server startup backfill ran, check the server log for `[embeddings] backfilled N question(s)`.
