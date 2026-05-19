import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../../../lib/apiClient';

interface GlobalCourse {
  id: string;
  name: string;
  code: string;
}

interface Placement {
  course_id: string;
  year_level: number;
  semester: number;
}

interface Props {
  programId: string;
  programName: string;
  /** Existing program_course placements for this program, to guard against duplicates. */
  existingPlacements: Placement[];
  /** Prefill year/sem from the slice the admin is currently viewing. */
  defaultYear?: number;
  defaultSem?: number;
  onClose: () => void;
  onSaved: () => void;
}

const YEARS = [1, 2, 3, 4] as const;
const SEMS = [1, 2] as const;

const inputCls =
  'w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50';
const labelCls =
  'text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider';

export function AddCourseModal({
  programId,
  programName,
  existingPlacements,
  defaultYear,
  defaultSem,
  onClose,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');

  // shared placement fields
  const [year, setYear] = useState<number | ''>(defaultYear ?? '');
  const [sem, setSem] = useState<number | ''>(defaultSem ?? '');

  // new-course fields
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  // existing-course fields
  const [globalCourses, setGlobalCourses] = useState<GlobalCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [existingCourseId, setExistingCourseId] = useState('');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadGlobalCourses = () => {
    setCoursesLoading(true);
    apiGet<GlobalCourse[]>('/api/courses')
      .then(setGlobalCourses)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setCoursesLoading(false));
  };

  useEffect(() => {
    if (mode === 'existing' && globalCourses.length === 0) loadGlobalCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const placeCourse = async (courseId: string, yl: number, sm: number) => {
    await apiPost('/api/program-courses', {
      program_id: programId,
      course_id: courseId,
      year_level: yl,
      semester: sm,
    });
  };

  const save = async () => {
    setErr(null);
    if (!year || !sem) {
      setErr('Pick a year and semester');
      return;
    }
    const yl = Number(year);
    const sm = Number(sem);

    if (mode === 'existing') {
      if (!existingCourseId) {
        setErr('Pick a course');
        return;
      }
      if (
        existingPlacements.some(
          (p) => p.course_id === existingCourseId && p.year_level === yl && p.semester === sm,
        )
      ) {
        setErr('This course is already placed at that year & semester for this program.');
        return;
      }
      setSaving(true);
      try {
        await placeCourse(existingCourseId, yl, sm);
        onSaved();
        onClose();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'DUPLICATE') {
          setErr('This course is already placed at that year & semester.');
        } else {
          setErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    // mode === 'new'
    if (!name.trim() || !code.trim()) {
      setErr('Course name and code are required');
      return;
    }
    setSaving(true);
    let createdCourse: GlobalCourse;
    try {
      createdCourse = await apiPost<GlobalCourse>('/api/courses', {
        name: name.trim(),
        code: code.trim(),
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DUPLICATE') {
        setErr(
          `A course with code "${code.trim()}" already exists. Switch to "Use existing course" to place it.`,
        );
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
      setSaving(false);
      return;
    }

    // course created; now place it
    try {
      await placeCourse(createdCourse.id, yl, sm);
      onSaved();
      onClose();
    } catch (e) {
      // Partial failure: course exists globally but placement failed.
      const detail = e instanceof Error ? e.message : String(e);
      setErr(
        `Course "${createdCourse.name}" was created, but placing it at Year ${yl} Sem ${sm} failed (${detail}). ` +
          `It's now available under "Use existing course" — retry the placement there.`,
      );
      setMode('existing');
      loadGlobalCourses();
      setExistingCourseId(createdCourse.id);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-subtle rounded-3xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold uppercase tracking-widest text-sm text-text-primary">
            Add Course
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Into program <span className="font-bold text-text-primary">{programName}</span>
        </p>

        <div className="flex gap-2 mb-5 bg-bg-sunken p-1 rounded-xl">
          <button
            onClick={() => {
              setMode('new');
              setErr(null);
            }}
            className={
              'flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ' +
              (mode === 'new'
                ? 'bg-primary text-on-primary'
                : 'text-text-secondary hover:text-text-primary')
            }
          >
            New course
          </button>
          <button
            onClick={() => {
              setMode('existing');
              setErr(null);
            }}
            className={
              'flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ' +
              (mode === 'existing'
                ? 'bg-primary text-on-primary'
                : 'text-text-secondary hover:text-text-primary')
            }
          >
            Use existing course
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'new' ? (
            <>
              <div>
                <label className={labelCls}>Course name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fluid Mechanics"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Course code</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. CHE305"
                  className={inputCls}
                />
              </div>
            </>
          ) : (
            <div>
              <label className={labelCls}>Existing course</label>
              <select
                value={existingCourseId}
                onChange={(e) => setExistingCourseId(e.target.value)}
                disabled={coursesLoading}
                className={inputCls}
              >
                <option value="" disabled hidden>
                  {coursesLoading ? 'Loading…' : '— pick a course —'}
                </option>
                {globalCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Year</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
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
            </div>
            <div>
              <label className={labelCls}>Semester</label>
              <select
                value={sem}
                onChange={(e) => setSem(e.target.value ? Number(e.target.value) : '')}
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

          {err && (
            <div className="bg-red-500/10 text-red-500 border border-red-500/30 rounded-xl px-3 py-2 text-xs">
              {err}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-bold text-text-secondary hover:bg-bg-raised"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
