import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import { TopicCreate, TopicListQuery, TopicUpdate } from '../schemas/topic';

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
      .select('topic_id')
      .in('topic_id', rows.map((t) => t.id));
    if (qErr) throw qErr;
    const counts = new Map<string, number>();
    for (const r of (qRows ?? []) as Array<{ topic_id: string }>) {
      counts.set(r.topic_id, (counts.get(r.topic_id) ?? 0) + 1);
    }
    res.json(rows.map((t) => ({ ...t, question_count: counts.get(t.id) ?? 0 })));
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
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { error } = await supabase.from('topics').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
