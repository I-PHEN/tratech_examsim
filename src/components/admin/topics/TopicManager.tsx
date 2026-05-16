import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles, Loader2 } from 'lucide-react';
import { apiGet } from '../../../lib/apiClient';
import { TopicList, type Topic } from './TopicList';
import { AddTopicModal } from './AddTopicModal';
import { SuggestTopicsModal } from './SuggestTopicsModal';

interface Department {
  id: string;
  name: string;
}

interface ProgramCourse {
  id: string;
  year_level: number;
  semester: number;
  courses: { name: string };
}

const YEARS = [1, 2, 3, 4] as const;
const SEMS = [1, 2] as const;

export function TopicManager() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [sem, setSem] = useState<number | ''>('');
  const [programCourses, setProgramCourses] = useState<ProgramCourse[]>([]);
  const [programCourseId, setProgramCourseId] = useState('');
  const [coursesLoading, setCoursesLoading] = useState(false);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Department[]>('/api/departments')
      .then((rows) => {
        setDepartments(rows);
        if (rows.length === 1) setDepartmentId(rows[0].id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setProgramCourseId('');
    setTopics([]);
    if (!departmentId || !year || !sem) {
      setProgramCourses([]);
      return;
    }
    setCoursesLoading(true);
    apiGet<ProgramCourse[]>(
      `/api/program-courses?department_id=${departmentId}&year_level=${year}&semester=${sem}`
    )
      .then(setProgramCourses)
      .catch(console.error)
      .finally(() => setCoursesLoading(false));
  }, [departmentId, year, sem]);

  const loadTopics = useCallback(async () => {
    if (!programCourseId) {
      setTopics([]);
      return;
    }
    setTopicsLoading(true);
    try {
      const rows = await apiGet<Topic[]>(`/api/topics?program_course_id=${programCourseId}`);
      setTopics(rows);
    } catch (err) {
      console.error(err);
    } finally {
      setTopicsLoading(false);
    }
  }, [programCourseId]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const courseName = useMemo(
    () => programCourses.find((pc) => pc.id === programCourseId)?.courses?.name,
    [programCourses, programCourseId]
  );

  return (
    <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-8 animate-in fade-in duration-200">
      <h3 className="font-bold uppercase tracking-widest text-sm text-text-primary mb-6">
        Topic Manager
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div>
          <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">
            Department
          </label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
          >
            <option value="" disabled hidden>
              — pick —
            </option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">
            Year
          </label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
            disabled={!departmentId}
            className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled hidden>
              Year
            </option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">
            Sem
          </label>
          <select
            value={sem}
            onChange={(e) => setSem(e.target.value ? Number(e.target.value) : '')}
            disabled={!departmentId}
            className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled hidden>
              Sem
            </option>
            {SEMS.map((s) => (
              <option key={s} value={s}>
                Sem {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">
            Course
          </label>
          <select
            value={programCourseId}
            onChange={(e) => setProgramCourseId(e.target.value)}
            disabled={!departmentId || !year || !sem || coursesLoading}
            className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled hidden>
              {coursesLoading ? 'Loading…' : '— pick —'}
            </option>
            {programCourses.map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.courses?.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {programCourseId ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-text-primary">
              Topics for {courseName}
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-bg-raised border border-border-subtle text-text-primary hover:bg-bg-sunken"
              >
                <Plus className="w-3 h-3" />
                Add topic
              </button>
              <button
                onClick={() => setShowSuggest(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary/90"
              >
                <Sparkles className="w-3 h-3" />
                Suggest from syllabus
              </button>
            </div>
          </div>

          {savedMsg && (
            <div className="bg-tertiary/10 text-tertiary border border-tertiary/30 rounded-xl px-3 py-2 text-xs mb-4">
              {savedMsg}
            </div>
          )}

          {topicsLoading ? (
            <div className="flex items-center justify-center py-12 text-text-secondary">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <TopicList topics={topics} onChanged={loadTopics} />
          )}

          {showAdd && (
            <AddTopicModal
              programCourseId={programCourseId}
              onClose={() => setShowAdd(false)}
              onSaved={() => {
                setSavedMsg('Topic added.');
                loadTopics();
                setTimeout(() => setSavedMsg(null), 2500);
              }}
            />
          )}

          {showSuggest && (
            <SuggestTopicsModal
              programCourseId={programCourseId}
              onClose={() => setShowSuggest(false)}
              onSaved={(n) => {
                setSavedMsg(`Saved ${n} topics.`);
                loadTopics();
                setTimeout(() => setSavedMsg(null), 3500);
              }}
            />
          )}
        </>
      ) : (
        <div className="text-sm text-text-secondary py-8 text-center">
          Pick a department, year, sem, and course to manage its topics.
        </div>
      )}
    </div>
  );
}
