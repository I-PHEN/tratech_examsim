import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin, requireOwner } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import { DepartmentCreate, DepartmentUpdate } from '../schemas/department';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Department not found');
    res.json(data);
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parse(DepartmentCreate, req.body);
    const { data, error } = await supabase
      .from('departments')
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const body = parse(DepartmentUpdate, req.body);
    const { data, error } = await supabase
      .from('departments')
      .update(body)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Department not found');
    res.json(data);
  })
);

router.delete(
  '/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
