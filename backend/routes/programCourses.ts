import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAdmin, requireOwner } from '../lib/auth';
import { parse } from '../lib/validate';
import { IdParam } from '../schemas/common';
import {
  ProgramCourseCreate,
  ProgramCourseListQuery,
  ProgramCourseUpdate,
} from '../schemas/programCourse';

const router = Router();

const SELECT_WITH_JOINS =
  'id, program_id, course_id, year_level, semester, created_at, ' +
  'programs(name, code, department_id), courses(name, code)';

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(ProgramCourseListQuery, req.query);

    let programIdsInDept: string[] | null = null;
    if (query.department_id) {
      const { data: progs, error: progsErr } = await supabase
        .from('programs')
        .select('id')
        .eq('department_id', query.department_id);
      if (progsErr) throw progsErr;
      programIdsInDept = (progs ?? []).map((p) => p.id);
      if (programIdsInDept.length === 0) {
        res.json([]);
        return;
      }
    }

    let q = supabase
      .from('program_courses')
      .select(SELECT_WITH_JOINS)
      .order('year_level', { ascending: true })
      .order('semester', { ascending: true });
    if (query.program_id) q = q.eq('program_id', query.program_id);
    if (programIdsInDept) q = q.in('program_id', programIdsInDept);
    if (query.year_level) q = q.eq('year_level', query.year_level);
    if (query.semester) q = q.eq('semester', query.semester);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { data, error } = await supabase
      .from('program_courses')
      .select(SELECT_WITH_JOINS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Program-course not found');
    res.json(data);
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parse(ProgramCourseCreate, req.body);
    const { data, error } = await supabase
      .from('program_courses')
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
    const body = parse(ProgramCourseUpdate, req.body);
    const { data, error } = await supabase
      .from('program_courses')
      .update(body)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Program-course not found');
    res.json(data);
  })
);

router.delete(
  '/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const { id } = parse(IdParam, req.params);
    const { error } = await supabase.from('program_courses').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
