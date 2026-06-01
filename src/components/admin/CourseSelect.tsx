import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet } from '../../lib/apiClient';
import { usePersistentState } from '../../lib/usePersistentState';

interface Department {
  id: string;
  name: string;
  code: string;
}

interface ProgramCourse {
  id: string;
  year_level: number;
  semester: number;
  courses: { name: string; code: string };
  programs: { name: string; code: string };
}

const YEARS = [1, 2, 3, 4] as const;
const SEMS = [1, 2] as const;

interface Props {
  value: string;
  onChange: (programCourseId: string) => void;
  compact?: boolean;
  /**
   * When set, the department/year/sem picks persist under this namespace so the
   * selection survives the component remounting (e.g. returning from editing in
   * the Library). Without it, the picker is ephemeral (fresh for each new question).
   */
  persistKey?: string;
}

export function CourseSelect({ value, onChange, compact = false, persistKey }: Props) {
  const ns = `courseselect.${persistKey ?? 'default'}`;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = usePersistentState<string>(`${ns}.department`, '');
  const [year, setYear] = usePersistentState<number | ''>(`${ns}.year`, '');
  const [sem, setSem] = usePersistentState<number | ''>(`${ns}.sem`, '');
  const [programCourses, setProgramCourses] = useState<ProgramCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  // Skip the parent-value reset on the first run so a persisted course survives
  // a remount; only clear when the user actually changes dept/year/sem.
  const didMountRef = useRef(false);

  useEffect(() => {
    apiGet<Department[]>('/api/departments')
      .then((rows) => {
        setDepartments(rows);
        if (rows.length === 1 && !departmentId) setDepartmentId(rows[0].id);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (didMountRef.current) {
      onChange('');
    } else {
      didMountRef.current = true;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, year, sem]);

  const showEmptyState = useMemo(
    () => !coursesLoading && departmentId && year && sem && programCourses.length === 0,
    [coursesLoading, departmentId, year, sem, programCourses]
  );

  const labelCls = compact
    ? 'text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider'
    : 'text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider';
  const inputCls = compact
    ? 'w-full bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50'
    : 'w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50';

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Department</label>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className={inputCls}
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
        <label className={labelCls}>Year & Sem</label>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
            disabled={!departmentId}
            className={inputCls}
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
          <select
            value={sem}
            onChange={(e) => setSem(e.target.value ? Number(e.target.value) : '')}
            disabled={!departmentId}
            className={inputCls}
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
      </div>

      <div>
        <label className={labelCls}>Course</label>
        {showEmptyState ? (
          <div className="bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-2 text-xs text-text-secondary">
            No courses for Year {year} Sem {sem} yet.
          </div>
        ) : (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={!departmentId || !year || !sem || coursesLoading}
            className={inputCls}
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
        )}
      </div>
    </div>
  );
}
