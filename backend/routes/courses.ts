import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import { CourseCreate, CourseListQuery, CourseUpdate } from '../schemas/course';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(CourseListQuery, req.query);
    let q = supabase.from('courses').select('*').order('name', { ascending: true });
    if (query.q) q = q.or(`name.ilike.%${query.q}%,code.ilike.%${query.q}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { data, error } = await supabase.from('courses').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Course not found');
    res.json(data);
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parse(CourseCreate, req.body);
    const { data, error } = await supabase.from('courses').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(CourseUpdate, req.body);
    const { data, error } = await supabase
      .from('courses')
      .update(body)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Course not found');
    res.json(data);
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
