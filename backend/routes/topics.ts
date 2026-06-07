import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin, requireOwner } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import { TopicCreate, TopicListQuery, TopicUpdate } from '../schemas/topic';
import { groupIntoLogical } from '../lib/logicalQuestions';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(TopicListQuery, req.query);
    const { data: topics, error } = await supabase
      .from('topics')
      .select('*')
      .eq('program_course_id', query.program_course_id)
      .order('name', { ascending: true });
    if (error) throw error;
    const rows = topics ?? [];
    if (rows.length === 0) return res.json([]);

    const { data: qRows, error: qErr } = await supabase
      .from('questions')
      .select('id, topic_id, difficulty, question_group_id, part_index')
      .in('topic_id', rows.map((t) => t.id));
    if (qErr) throw qErr;
    // Per-topic total + per-difficulty buckets, counting LOGICAL questions: a
    // multi-part group counts once (bucketed by its lead part's difficulty), to
    // match how the session picker and totals treat groups. A question with a
    // null/unknown difficulty counts toward the total only (drives "All").
    type QRow = {
      id: string;
      topic_id: string;
      difficulty: string | null;
      question_group_id: string | null;
      part_index: number | null;
    };
    type Bucket = { total: number; easy: number; medium: number; hard: number };
    const byTopic = new Map<string, QRow[]>();
    for (const r of (qRows ?? []) as QRow[]) {
      const arr = byTopic.get(r.topic_id);
      if (arr) arr.push(r);
      else byTopic.set(r.topic_id, [r]);
    }
    const counts = new Map<string, Bucket>();
    for (const [topicId, topicRows] of byTopic) {
      const b: Bucket = { total: 0, easy: 0, medium: 0, hard: 0 };
      for (const unit of groupIntoLogical(topicRows)) {
        b.total++;
        const d = unit.lead.difficulty;
        if (d === 'easy' || d === 'medium' || d === 'hard') b[d]++;
      }
      counts.set(topicId, b);
    }
    res.json(
      rows.map((t) => {
        const b = counts.get(t.id);
        return {
          ...t,
          question_count: b?.total ?? 0,
          question_counts: { easy: b?.easy ?? 0, medium: b?.medium ?? 0, hard: b?.hard ?? 0 },
        };
      })
    );
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { data, error } = await supabase.from('topics').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
    res.json(data);
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parse(TopicCreate, req.body);
    const { data, error } = await supabase.from('topics').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(TopicUpdate, req.body);
    const { data, error } = await supabase
      .from('topics')
      .update(body)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
    res.json(data);
  })
);

router.delete(
  '/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { error } = await supabase.from('topics').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
