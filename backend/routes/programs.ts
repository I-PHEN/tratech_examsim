import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin, requireOwner } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import { ProgramCreate, ProgramListQuery, ProgramUpdate } from '../schemas/program';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(ProgramListQuery, req.query);
    let q = supabase.from('programs').select('*').order('name', { ascending: true });
    if (query.department_id) q = q.eq('department_id', query.department_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { data, error } = await supabase.from('programs').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Program not found');
    res.json(data);
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parse(ProgramCreate, req.body);
    const { data, error } = await supabase.from('programs').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(ProgramUpdate, req.body);
    const { data, error } = await supabase
      .from('programs')
      .update(body)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Program not found');
    res.json(data);
  })
);

router.delete(
  '/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { error } = await supabase.from('programs').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
