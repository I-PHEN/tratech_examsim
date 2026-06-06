import { supabase } from '../lib/supabase';
import { getDb } from '../lib/firebase-admin';
import { getCourseMastery } from './masteryService';
import { toYearLevel, toSemester } from '../lib/period';
import type { CourseContext } from './scheduleAiPrompt';

/**
 * Context = program-courses for the user's profile period (year_level +
 * semester, read from Firestore), matching how App.tsx lists courses (no
 * department filter). For each course: name, topics, and the user's per-topic
 * mastery. Returns the context list plus the `allowed` map (course id → set of
 * its topic ids) used by the validator.
 */
export async function gatherScheduleContext(
  uid: string,
): Promise<{ courses: CourseContext[]; allowed: Map<string, Set<string>> }> {
  // 1. Read the user's period from their Firestore profile.
  const snap = await getDb().collection('users').doc(uid).get();
  const profile = (snap.data() ?? {}) as { year?: string; semester?: string };
  const yl = toYearLevel(profile.year);
  const sm = toSemester(profile.semester);

  // 2. Program-courses for that period (no department filter — matches App.tsx).
  const { data: pcRows } = await supabase
    .from('program_courses')
    .select('id, courses(name)')
    .eq('year_level', yl)
    .eq('semester', sm);
  const pcs = (pcRows ?? []) as Array<Record<string, unknown>>;
  if (pcs.length === 0) return { courses: [], allowed: new Map() };

  const ids = pcs.map((r) => r.id as string);
  const nameById = new Map<string, string | null>();
  for (const row of pcs) {
    const courses = row.courses;
    const courseObj = Array.isArray(courses)
      ? (courses as Array<{ name: string }>)[0]
      : (courses as { name: string } | null);
    nameById.set(row.id as string, courseObj?.name ?? null);
  }

  // 3. Topics for all those courses in one query.
  const { data: topicRows } = await supabase
    .from('topics')
    .select('id, name, program_course_id')
    .in('program_course_id', ids)
    .order('name', { ascending: true });
  const topicsByCourse = new Map<string, Array<{ topic_id: string; name: string }>>();
  for (const t of (topicRows ?? []) as Array<{ id: string; name: string; program_course_id: string }>) {
    const arr = topicsByCourse.get(t.program_course_id) ?? [];
    arr.push({ topic_id: t.id, name: t.name });
    topicsByCourse.set(t.program_course_id, arr);
  }

  // 4. Mastery per course (one call each; small period set).
  const masteryByCourse = await Promise.all(
    ids.map(async (pcId) => {
      const m = await getCourseMastery(uid, pcId);
      const byTopic = new Map(m.map((x) => [x.topic_id, x]));
      return [pcId, byTopic] as const;
    }),
  );
  const masteryMap = new Map(masteryByCourse);

  // 5. Assemble.
  const allowed = new Map<string, Set<string>>();
  const courses: CourseContext[] = ids.map((pcId) => {
    const topics = topicsByCourse.get(pcId) ?? [];
    allowed.set(pcId, new Set(topics.map((t) => t.topic_id)));
    const mastery = masteryMap.get(pcId);
    return {
      program_course_id: pcId,
      course_name: nameById.get(pcId) ?? null,
      topics: topics.map((t) => {
        const m = mastery?.get(t.topic_id);
        return {
          topic_id: t.topic_id,
          name: t.name,
          mastery: m && m.state !== 'not_started' ? m.mastery : null,
          answered_count: m?.answered_count ?? 0,
        };
      }),
    };
  });

  return { courses, allowed };
}
