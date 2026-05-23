import { supabase } from '../lib/supabase';
import { shuffle } from '../lib/shuffle';
import {
  QuestionWithContent,
  McqOption,
  shuffleOptionsIfMcq,
  QuestionJoinRow,
  QuestionContent,
  mapAssets as mapAssetsForRouting,
} from './questionService';
import { ApiError } from '../lib/errors';
import type { SessionPickInput } from '../schemas/session';

interface PoolRow {
  id: string;
  topic_id: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question_group_id: string | null;
  part_index: number | null;
}

const DEFAULT_COUNT: Record<SessionPickInput['mode'], number> = {
  practice: 10,
  diagnostic: 20,
  midsem: 30,
  full_exam: 60,
};

function scopesForMode(mode: SessionPickInput['mode']): Array<'midsem' | 'final' | 'both'> {
  if (mode === 'midsem') return ['midsem', 'both'];
  return ['midsem', 'final', 'both'];
}

function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function roundRobinByTopic(items: PoolRow[], take: number): PoolRow[] {
  if (items.length <= take) return shuffle(items);

  const groups = groupBy(items, (i) => i.topic_id);
  const queues: PoolRow[][] = [];
  for (const [, bucket] of groups) {
    queues.push(shuffle(bucket));
  }

  const order = shuffle(queues);
  const out: PoolRow[] = [];
  while (out.length < take) {
    let drewThisRound = false;
    for (const q of order) {
      if (out.length >= take) break;
      const next = q.pop();
      if (next) {
        out.push(next);
        drewThisRound = true;
      }
    }
    if (!drewThisRound) break;
  }
  return out;
}

function pickDiagnostic(pool: PoolRow[], count: number): PoolRow[] {
  const buckets = {
    easy: pool.filter((p) => p.difficulty === 'easy'),
    medium: pool.filter((p) => p.difficulty === 'medium'),
    hard: pool.filter((p) => p.difficulty === 'hard'),
  };

  const base = Math.floor(count / 3);
  let leftover = count - base * 3;
  const targets: Array<{ diff: keyof typeof buckets; n: number }> = [
    { diff: 'easy', n: base + (leftover-- > 0 ? 1 : 0) },
    { diff: 'medium', n: base + (leftover-- > 0 ? 1 : 0) },
    { diff: 'hard', n: base + (leftover-- > 0 ? 1 : 0) },
  ];

  const picked: PoolRow[] = [];
  for (const { diff, n } of targets) {
    picked.push(...roundRobinByTopic(buckets[diff], n));
  }

  if (picked.length < count) {
    const pickedIds = new Set(picked.map((p) => p.id));
    const remaining = pool.filter((p) => !pickedIds.has(p.id));
    picked.push(...shuffle(remaining).slice(0, count - picked.length));
  }

  return picked;
}

export async function pickSessionQuestions(
  input: SessionPickInput
): Promise<{ mode: SessionPickInput['mode']; count: number; picked: QuestionWithContent[] }> {
  const count = input.count ?? DEFAULT_COUNT[input.mode];
  const scopes = scopesForMode(input.mode);

  let q = supabase
    .from('questions')
    .select('id, topic_id, difficulty, question_group_id, part_index')
    .eq('program_course_id', input.program_course_id)
    .in('exam_scope', scopes);

  if (input.mode === 'practice' && input.topic_id) {
    q = q.eq('topic_id', input.topic_id);
  }
  if (input.difficulty && input.mode !== 'diagnostic') {
    q = q.eq('difficulty', input.difficulty);
  }

  const { data: pool, error } = await q;
  if (error) throw error;
  if (!pool || pool.length === 0) {
    return { mode: input.mode, count, picked: [] };
  }

  const typedPool = pool as PoolRow[];

  let selected: PoolRow[];
  if (typedPool.length <= count) {
    selected = shuffle(typedPool);
  } else if (input.mode === 'diagnostic') {
    selected = pickDiagnostic(typedPool, count);
  } else if (input.mode === 'practice' && input.topic_id) {
    selected = shuffle(typedPool).slice(0, count);
  } else {
    selected = roundRobinByTopic(typedPool, count);
  }

  // === Complete + order multi-part groups ===
  // A picked sub-part pulls in ALL its siblings, kept contiguous and ordered by
  // part_index. Groups are atomic — never split — so the final count may vary
  // by ±(group size). The real length is stored in sessions.total_questions.
  const groupIds = Array.from(
    new Set(selected.map((s) => s.question_group_id).filter((g): g is string => Boolean(g)))
  );
  const membersByGroup = new Map<string, string[]>();
  if (groupIds.length > 0) {
    const { data: members, error: mErr } = await supabase
      .from('questions')
      .select('id, question_group_id, part_index')
      .in('question_group_id', groupIds);
    if (mErr) throw mErr;
    const memberRows = (members ?? []) as Array<{
      id: string;
      question_group_id: string;
      part_index: number | null;
    }>;
    for (const g of groupIds) {
      membersByGroup.set(
        g,
        memberRows
          .filter((r) => r.question_group_id === g)
          .sort((a, b) => (a.part_index ?? 0) - (b.part_index ?? 0))
          .map((r) => r.id)
      );
    }
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const emittedGroups = new Set<string>();
  for (const row of selected) {
    if (ids.length >= count) break;
    if (row.question_group_id) {
      if (emittedGroups.has(row.question_group_id)) continue;
      emittedGroups.add(row.question_group_id);
      for (const memberId of membersByGroup.get(row.question_group_id) ?? [row.id]) {
        if (!seen.has(memberId)) {
          seen.add(memberId);
          ids.push(memberId);
        }
      }
    } else if (!seen.has(row.id)) {
      seen.add(row.id);
      ids.push(row.id);
    }
  }

  const { data: full, error: fullErr } = await supabase
    .from('questions')
    .select(
      'id, program_course_id, topic_id, type, difficulty, exam_scope, answer_type, ' +
        'question_group_id, part_label, part_index, ' +
        'question_content(prompt, explanation, correct_answer, answer_tolerance, unit), ' +
        'mcq_options(id, text, is_correct), ' +
        'question_assets(id, storage_path, mime_type, position)'
    )
    .in('id', ids);
  if (fullErr) throw fullErr;
  if (!full) throw new ApiError(500, 'DB_ERROR', 'Failed to fetch question content');

  const fullRows = full as unknown as QuestionJoinRow[];
  const byId = new Map<string, QuestionJoinRow>(fullRows.map((f) => [f.id, f]));

  const picked: QuestionWithContent[] = ids
    .map((id) => byId.get(id))
    .filter((row): row is QuestionJoinRow => Boolean(row))
    .map((row) => {
      const contentArr: QuestionContent[] = Array.isArray(row.question_content)
        ? row.question_content
        : row.question_content
        ? [row.question_content]
        : [];
      return shuffleOptionsIfMcq({
        id: row.id,
        program_course_id: row.program_course_id,
        topic_id: row.topic_id,
        type: row.type,
        difficulty: row.difficulty,
        exam_scope: row.exam_scope,
        answer_type: row.answer_type,
        question_group_id: row.question_group_id,
        part_label: row.part_label,
        part_index: row.part_index,
        content: contentArr[0],
        options: row.type === 'mcq' ? row.mcq_options ?? [] : undefined,
        assets: mapAssetsForRouting(row.question_assets),
      });
    });

  return { mode: input.mode, count, picked };
}
