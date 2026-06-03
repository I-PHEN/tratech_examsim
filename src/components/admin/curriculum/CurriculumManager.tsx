import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../../lib/apiClient';
import { useAuth } from '../../../lib/AuthContext';
import { TopicList, type Topic } from '../topics/TopicList';
import { AddTopicModal } from '../topics/AddTopicModal';
import { SuggestTopicsModal } from '../topics/SuggestTopicsModal';
import { AddDepartmentModal } from './AddDepartmentModal';
import { AddCourseModal } from './AddCourseModal';

interface Department {
  id: string;
  name: string;
  code: string;
}
interface Program {
  id: string;
  name: string;
  code: string;
  department_id: string;
}
interface ProgramCourse {
  id: string;
  course_id: string;
  year_level: number;
  semester: number;
  courses: { name: string; code: string };
}

const YEARS = [1, 2, 3, 4] as const;
const SEMS = [1, 2] as const;

const selectCls =
  'w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50';
const labelCls =
  'text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider';
const iconBtn = 'p-1.5 rounded-lg text-text-secondary hover:bg-bg-raised';
const addBtn =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-bg-raised border border-border-subtle text-text-primary hover:bg-bg-sunken disabled:opacity-50';
const rowBtn =
  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors';

type EditKind = 'department' | 'course';

export function CurriculumManager() {
  const { isOwner } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [departmentId, setDepartmentId] = useState('');

  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programId, setProgramId] = useState('');

  const [allPc, setAllPc] = useState<ProgramCourse[]>([]);
  const [pcLoading, setPcLoading] = useState(false);

  const [year, setYear] = useState<number | ''>('');
  const [sem, setSem] = useState<number | ''>('');

  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [topicsByPc, setTopicsByPc] = useState<Record<string, Topic[]>>({});
  const [topicsLoading, setTopicsLoading] = useState<Set<string>>(new Set());

  // modals
  const [showAddDept, setShowAddDept] = useState(false);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [addTopicFor, setAddTopicFor] = useState<string | null>(null);
  const [suggestTopicFor, setSuggestTopicFor] = useState<string | null>(null);

  // inline rename
  const [editKind, setEditKind] = useState<EditKind | null>(null);
  const [editId, setEditId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftCode, setDraftCode] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [settingUpProgram, setSettingUpProgram] = useState(false);

  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const toast = (m: string) => {
    setSavedMsg(m);
    setTimeout(() => setSavedMsg(null), 2800);
  };

  const department = useMemo(
    () => departments.find((d) => d.id === departmentId) ?? null,
    [departments, departmentId],
  );
  const program = useMemo(
    () => programs.find((p) => p.id === programId) ?? null,
    [programs, programId],
  );

  const loadDepartments = useCallback(async () => {
    setDeptsLoading(true);
    try {
      const rows = await apiGet<Department[]>('/api/departments');
      setDepartments(rows);
      setDepartmentId((cur) => (cur && rows.some((r) => r.id === cur) ? cur : rows.length === 1 ? rows[0].id : ''));
    } catch (e) {
      console.error(e);
    } finally {
      setDeptsLoading(false);
    }
  }, []);

  const loadPrograms = useCallback(async (deptId: string) => {
    setProgramsLoading(true);
    try {
      const rows = await apiGet<Program[]>(`/api/programs?department_id=${deptId}`);
      setPrograms(rows);
      setProgramId((cur) => (cur && rows.some((r) => r.id === cur) ? cur : rows.length === 1 ? rows[0].id : ''));
    } catch (e) {
      console.error(e);
    } finally {
      setProgramsLoading(false);
    }
  }, []);

  const loadProgramCourses = useCallback(async (pid: string) => {
    setPcLoading(true);
    try {
      const rows = await apiGet<ProgramCourse[]>(`/api/program-courses?program_id=${pid}`);
      setAllPc(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setPcLoading(false);
    }
  }, []);

  const loadTopics = useCallback(async (pcId: string) => {
    setTopicsLoading((s) => new Set(s).add(pcId));
    try {
      const rows = await apiGet<Topic[]>(`/api/topics?program_course_id=${pcId}`);
      setTopicsByPc((p) => ({ ...p, [pcId]: rows }));
    } catch (e) {
      console.error(e);
    } finally {
      setTopicsLoading((s) => {
        const n = new Set(s);
        n.delete(pcId);
        return n;
      });
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    setPrograms([]);
    setProgramId('');
    setAllPc([]);
    if (departmentId) loadPrograms(departmentId);
  }, [departmentId, loadPrograms]);

  useEffect(() => {
    setAllPc([]);
    setExpandedCourses(new Set());
    if (programId) loadProgramCourses(programId);
  }, [programId, loadProgramCourses]);

  const filtered = useMemo(
    () =>
      year && sem
        ? allPc
            .filter((pc) => pc.year_level === year && pc.semester === sem)
            .sort((a, b) => a.courses.name.localeCompare(b.courses.name))
        : [],
    [allPc, year, sem],
  );

  const toggleCourse = (pc: ProgramCourse) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(pc.id)) next.delete(pc.id);
      else {
        next.add(pc.id);
        if (!topicsByPc[pc.id]) loadTopics(pc.id);
      }
      return next;
    });
  };

  const startEdit = (kind: EditKind, id: string, name: string, code: string) => {
    setEditKind(kind);
    setEditId(id);
    setDraftName(name);
    setDraftCode(code);
  };
  const cancelEdit = () => {
    setEditKind(null);
    setEditId('');
    setDraftName('');
    setDraftCode('');
  };
  const saveEdit = async (after: () => void) => {
    if (!editKind || !draftName.trim() || !draftCode.trim()) return;
    const payload = { name: draftName.trim(), code: draftCode.trim() };
    setSavingEdit(true);
    try {
      if (editKind === 'department') {
        // Department and its program are one unit here — keep both in sync so the
        // program name students see (course subtitle) matches the department.
        await apiPut(`/api/departments/${editId}`, payload);
        if (programId) {
          try {
            await apiPut(`/api/programs/${programId}`, payload);
          } catch {
            /* department renamed; program sync is best-effort */
          }
        }
      } else {
        await apiPut(`/api/courses/${editId}`, payload);
      }
      cancelEdit();
      after();
      toast('Saved.');
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEdit(false);
    }
  };

  const setupProgram = async (dept: Department) => {
    setSettingUpProgram(true);
    try {
      await apiPost('/api/programs', {
        department_id: dept.id,
        name: dept.name,
        code: dept.code,
      });
      await loadPrograms(dept.id);
      toast('Program set up.');
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingUpProgram(false);
    }
  };

  const del = async (path: string, confirmMsg: string, after: () => void) => {
    if (!window.confirm(confirmMsg)) return;
    try {
      await apiDelete(path);
      after();
      toast('Deleted.');
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const isEditing = (kind: EditKind, id: string) => editKind === kind && editId === id;

  const renameRow = (after: () => void) => (
    <div className="flex items-center gap-2">
      <input
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        placeholder="Name"
        className="flex-1 bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
      />
      <input
        value={draftCode}
        onChange={(e) => setDraftCode(e.target.value)}
        placeholder="Code"
        className="w-32 bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
      />
      <button
        onClick={() => saveEdit(after)}
        disabled={savingEdit}
        className="p-2 rounded-lg text-primary hover:bg-bg-raised disabled:opacity-50"
        title="Save"
      >
        {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button onClick={cancelEdit} className={iconBtn} title="Cancel">
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-8 animate-in fade-in duration-200">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="font-bold uppercase tracking-widest text-sm text-text-primary">
            Curriculum
          </h3>
          <p className="text-xs text-text-secondary mt-1">
            Pick a department, year &amp; sem to see its courses. Changes here are live for
            students and the ingestion picker immediately.
          </p>
        </div>
        <button onClick={() => setShowAddDept(true)} className={addBtn}>
          <Plus className="w-3 h-3" /> Add department
        </button>
      </div>

      {savedMsg && (
        <div className="bg-tertiary/10 text-tertiary border border-tertiary/30 rounded-xl px-3 py-2 text-xs mb-4">
          {savedMsg}
        </div>
      )}

      {deptsLoading ? (
        <div className="flex items-center justify-center py-12 text-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : departments.length === 0 ? (
        <div className="text-sm text-text-secondary py-8 text-center">
          No departments yet. Click “Add department” to start.
        </div>
      ) : (
        <>
          {/* Department */}
          <div className="mb-4">
            <label className={labelCls}>Department</label>
            {isEditing('department', departmentId) ? (
              renameRow(loadDepartments)
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className={selectCls}
                >
                  <option value="" disabled hidden>
                    — pick —
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                {department && (
                  <>
                    <button
                      onClick={() => startEdit('department', department.id, department.name, department.code)}
                      className={iconBtn}
                      title="Rename department"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {isOwner && (
                    <button
                      onClick={() =>
                        del(
                          `/api/departments/${department.id}`,
                          `Delete department "${department.name}"?\n\nThis also deletes ALL its programs, courses, topics, and questions. This cannot be undone.`,
                          () => {
                            setDepartmentId('');
                            loadDepartments();
                          },
                        )
                      }
                      className="p-1.5 rounded-lg text-text-secondary hover:text-red-500 hover:bg-bg-raised"
                      title="Delete department"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* A department IS its program here (1:1). The program is managed
              transparently; only surface a heal action for legacy departments
              that somehow have no program yet. */}
          {departmentId && !programsLoading && programs.length === 0 && (
            <div className="mb-4 flex items-center gap-3 bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2.5">
              <span className="text-xs text-text-secondary">
                This department has no program set up yet.
              </span>
              <button
                onClick={() => department && setupProgram(department)}
                disabled={settingUpProgram}
                className={addBtn}
              >
                {settingUpProgram ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Set up program
              </button>
            </div>
          )}

          {/* Year & Sem */}
          {programId && (
            <div className="grid grid-cols-2 gap-3 mb-5 max-w-sm">
              <div>
                <label className={labelCls}>Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
                  className={selectCls}
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
                  className={selectCls}
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
          )}

          {/* Courses for the slice */}
          {programId && year && sem && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-text-primary">
                  Courses · Year {year} Sem {sem}
                  <span className="text-text-tertiary font-medium ml-2">
                    ({filtered.length} here · {allPc.length} in program)
                  </span>
                </h4>
                <button onClick={() => setShowAddCourse(true)} className={addBtn}>
                  <Plus className="w-3 h-3" /> Add course
                </button>
              </div>

              {pcLoading ? (
                <div className="flex items-center justify-center py-10 text-text-secondary">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-text-secondary py-8 text-center border border-dashed border-border-subtle rounded-2xl">
                  No courses for Year {year} Sem {sem} yet. Click “Add course”.
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((pc) => {
                    const open = expandedCourses.has(pc.id);
                    return (
                      <div
                        key={pc.id}
                        className="border border-border-subtle rounded-xl overflow-hidden"
                      >
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-sunken">
                          <button
                            onClick={() => toggleCourse(pc)}
                            className="text-text-secondary hover:text-text-primary"
                          >
                            {open ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          {isEditing('course', pc.course_id) ? (
                            <div className="flex-1">
                              {renameRow(() => loadProgramCourses(programId))}
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => toggleCourse(pc)}
                                className="flex-1 text-left"
                              >
                                <span className="text-sm font-semibold text-text-primary">
                                  {pc.courses?.name}
                                </span>
                                <span className="text-xs text-text-tertiary ml-2">
                                  {pc.courses?.code}
                                </span>
                              </button>
                              <button
                                onClick={() => setAddTopicFor(pc.id)}
                                className={rowBtn}
                              >
                                <Plus className="w-3 h-3" /> Topic
                              </button>
                              <button
                                onClick={() => setSuggestTopicFor(pc.id)}
                                className={rowBtn}
                                title="Suggest topics from syllabus (AI)"
                              >
                                <Sparkles className="w-3 h-3" /> Suggest
                              </button>
                              <button
                                onClick={() =>
                                  startEdit(
                                    'course',
                                    pc.course_id,
                                    pc.courses?.name ?? '',
                                    pc.courses?.code ?? '',
                                  )
                                }
                                className={iconBtn}
                                title="Rename course"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {isOwner && (
                              <button
                                onClick={() =>
                                  del(
                                    `/api/program-courses/${pc.id}`,
                                    `Remove "${pc.courses?.name}" from Year ${pc.year_level} Sem ${pc.semester}?\n\nThis deletes its topics and questions in this slot. The course itself stays available to place elsewhere. This cannot be undone.`,
                                    () => loadProgramCourses(programId),
                                  )
                                }
                                className="p-1.5 rounded-lg text-text-secondary hover:text-red-500 hover:bg-bg-raised"
                                title="Remove from this year/sem"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              )}
                            </>
                          )}
                        </div>
                        {open && (
                          <div className="px-3 pb-3 pt-2 border-t border-border-subtle">
                            {topicsLoading.has(pc.id) ? (
                              <div className="flex items-center py-3 text-text-secondary text-xs">
                                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading
                                topics…
                              </div>
                            ) : (
                              <TopicList
                                topics={topicsByPc[pc.id] ?? []}
                                onChanged={() => loadTopics(pc.id)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showAddDept && (
        <AddDepartmentModal
          onClose={() => setShowAddDept(false)}
          onSaved={() => {
            loadDepartments();
            toast('Department added.');
          }}
        />
      )}
      {showAddCourse && program && (
        <AddCourseModal
          programId={program.id}
          programName={program.name}
          existingPlacements={allPc.map((pc) => ({
            course_id: pc.course_id,
            year_level: pc.year_level,
            semester: pc.semester,
          }))}
          defaultYear={year || undefined}
          defaultSem={sem || undefined}
          onClose={() => setShowAddCourse(false)}
          onSaved={() => {
            loadProgramCourses(program.id);
            toast('Course added.');
          }}
        />
      )}
      {addTopicFor && (
        <AddTopicModal
          programCourseId={addTopicFor}
          onClose={() => setAddTopicFor(null)}
          onSaved={() => {
            loadTopics(addTopicFor);
            toast('Topic added.');
          }}
        />
      )}
      {suggestTopicFor && (
        <SuggestTopicsModal
          programCourseId={suggestTopicFor}
          onClose={() => setSuggestTopicFor(null)}
          onSaved={(n) => {
            loadTopics(suggestTopicFor);
            toast(`Saved ${n} topics.`);
          }}
        />
      )}
    </div>
  );
}
