import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarClock, Pencil, Pause, Play, Trash2, AlertTriangle, Loader2, CalendarPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { DateTime } from 'luxon';
import { cn } from '../lib/utils';
import { ApiError, apiGet, apiPost, apiPatch, apiDelete } from '../lib/apiClient';
import { buildScheduleIcs, downloadIcs } from '../lib/calendarIcs';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { EmptyState } from './ui/EmptyState';
import { Pill } from './ui/Pill';
import { Button } from './ui/Button';
import { CourseSelect } from './admin/CourseSelect';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiTopic {
  id: string;
  name: string;
}

interface ScheduleListItem {
  id: string;
  user_uid: string;
  program_course_id: string;
  topic_id: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  question_count: number;
  label: string | null;
  timezone: string;
  recurrence: 'once' | 'weekly';
  run_at: string | null;
  days_of_week: number[] | null;
  time_of_day: string | null;
  ends_on: string | null;
  next_run_at: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
  course_name: string | null;
  topic_name: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DIFFICULTY_OPTIONS = ['All', 'Easy', 'Medium', 'Hard'] as const;
type DifficultyOption = (typeof DIFFICULTY_OPTIONS)[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNextRun(item: ScheduleListItem): string {
  if (!item.next_run_at) {
    if (item.status === 'paused') return 'Paused';
    if (item.status === 'completed' || item.status === 'cancelled') return 'Completed';
    return '—';
  }
  try {
    return DateTime.fromISO(item.next_run_at, { zone: 'utc' })
      .setZone(item.timezone)
      .toFormat('ccc LLL d, h:mm a');
  } catch {
    return item.next_run_at;
  }
}

function formatWeeklyPattern(item: ScheduleListItem): string {
  if (item.recurrence !== 'weekly') return '';
  const days = (item.days_of_week ?? [])
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(', ');
  const time = item.time_of_day ?? '';
  if (!days && !time) return '';
  if (days && time) return `${days} · ${time}`;
  return days || time;
}

function statusTone(status: ScheduleListItem['status']): 'success' | 'warning' | 'neutral' | 'danger' {
  switch (status) {
    case 'active': return 'success';
    case 'paused': return 'warning';
    case 'completed': return 'neutral';
    case 'cancelled': return 'danger';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  programCourseId: string;
  topicId: string;
  difficulty: DifficultyOption;
  questionCount: number;
  questionCountRaw: string; // raw string for the count input (FIX 5)
  timezone: string; // preserved from original row on edit (FIX 2)
  recurrence: 'once' | 'weekly';
  // once
  runDate: string; // YYYY-MM-DD
  runTime: string; // HH:mm
  // weekly
  daysOfWeek: number[];
  timeOfDay: string; // HH:mm
  endsOn: string; // YYYY-MM-DD or ''
  label: string;
}

const EMPTY_FORM: FormState = {
  programCourseId: '',
  topicId: '',
  difficulty: 'All',
  questionCount: 10,
  questionCountRaw: '10',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  recurrence: 'once',
  runDate: '',
  runTime: '',
  daysOfWeek: [],
  timeOfDay: '',
  endsOn: '',
  label: '',
};

function formFromRow(row: ScheduleListItem): FormState {
  let runDate = '';
  let runTime = '';
  if (row.recurrence === 'once' && row.run_at) {
    // run_at is UTC ISO; render back to the row's timezone so the inputs show local time
    const dt = DateTime.fromISO(row.run_at, { zone: 'utc' }).setZone(row.timezone);
    runDate = dt.toFormat('yyyy-MM-dd');
    runTime = dt.toFormat('HH:mm');
  }
  return {
    programCourseId: row.program_course_id,
    topicId: row.topic_id ?? '',
    difficulty: row.difficulty ? (capitalize(row.difficulty) as DifficultyOption) : 'All',
    questionCount: row.question_count,
    questionCountRaw: String(row.question_count),
    timezone: row.timezone, // FIX 2: preserve original timezone on edit
    recurrence: row.recurrence,
    runDate,
    runTime,
    daysOfWeek: row.days_of_week ?? [],
    timeOfDay: row.time_of_day ?? '',
    endsOn: row.ends_on ?? '',
    label: row.label ?? '',
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScheduledScreen({ onBack }: { onBack: () => void }) {
  // List state
  const [schedules, setSchedules] = useState<ScheduleListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Form / edit state
  const [editingId, setEditingId] = useState<string | null>(null); // null = create mode
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Unmount guard (FIX 3)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Timer ref for success banner auto-dismiss (FIX 1)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Action loading per row
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Confirm delete
  const [pendingDelete, setPendingDelete] = useState<ScheduleListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Fetch list ──────────────────────────────────────────────────────────────

  function loadSchedules() {
    setListLoading(true);
    setListError(null);
    apiGet<ScheduleListItem[]>('/api/schedules')
      .then((data) => { if (mountedRef.current) setSchedules(data); })
      .catch((e) => { if (mountedRef.current) setListError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (mountedRef.current) setListLoading(false); });
  }

  useEffect(() => {
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch topics when course changes ────────────────────────────────────────

  useEffect(() => {
    if (!form.programCourseId) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    apiGet<ApiTopic[]>(`/api/topics?program_course_id=${form.programCourseId}`)
      .then((data) => { if (!cancelled) setTopics(data); })
      .catch(() => { if (!cancelled) setTopics([]); });
    return () => { cancelled = true; };
  }, [form.programCourseId]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setFormError(null);
  }

  function enterEditMode(row: ScheduleListItem) {
    setEditingId(row.id);
    setForm(formFromRow(row));
    setFormError(null);
    setFormSuccess(false); // clear banner when opening a new edit
    setFormOpen(true);
    // FIX 7: removed dead window.scrollTo (scroll container is an overflow-y-auto div)
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    // FIX 1: do NOT clear formSuccess here — let the success banner stay visible after save
  }

  // ── Validate + build payload ─────────────────────────────────────────────────

  function validate(): string | null {
    if (!editingId && !form.programCourseId) return 'Please select a course.';
    // FIX 5: parse the raw string to get the final count for validation
    const parsedCount = parseInt(form.questionCountRaw, 10);
    if (isNaN(parsedCount) || parsedCount < 1 || parsedCount > 50) return 'Question count must be 1–50.';
    if (form.recurrence === 'once') {
      if (!form.runDate) return 'Please choose a date.';
      if (!form.runTime) return 'Please choose a time.';
    } else {
      if (form.daysOfWeek.length === 0) return 'Select at least one day.';
      if (!form.timeOfDay) return 'Please choose a time.';
    }
    return null;
  }

  function buildPayload(mode: 'create' | 'update'): Record<string, unknown> {
    // FIX 5: parse and clamp the raw count string
    const parsedCount = Math.min(50, Math.max(1, parseInt(form.questionCountRaw, 10) || 1));
    // FIX 2: use form.timezone (preserved from original row on edit) — never re-read Intl here
    const base: Record<string, unknown> = {
      topic_id: form.topicId || undefined,
      difficulty: form.difficulty === 'All' ? undefined : form.difficulty.toLowerCase(),
      question_count: parsedCount,
      label: form.label.trim() || undefined,
      timezone: form.timezone,
    };
    if (form.recurrence === 'once') {
      base.recurrence = 'once';
      base.run_at = `${form.runDate}T${form.runTime}`;
    } else {
      base.recurrence = 'weekly';
      base.days_of_week = form.daysOfWeek;
      base.time_of_day = form.timeOfDay;
      if (form.endsOn) base.ends_on = form.endsOn;
    }
    if (mode === 'create') {
      base.program_course_id = form.programCourseId;
    }
    return base;
  }

  async function handleSave() {
    const err = validate();
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = buildPayload(editingId ? 'update' : 'create');
      if (editingId) {
        await apiPatch(`/api/schedules/${editingId}`, payload);
      } else {
        await apiPost('/api/schedules', payload);
      }
      // FIX 1: call cancelEdit first (resets edit/form state), then set success true so
      // cancelEdit's omission of formSuccess-clear means the banner actually appears.
      cancelEdit();
      setFormOpen(false);
      setFormSuccess(true);
      loadSchedules();
      if (successTimerRef.current !== null) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setFormSuccess(false);
      }, 3000);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SCHEDULE_LIMIT') {
        setFormError('You have reached the 50 schedule limit. Cancel or delete an existing schedule to add a new one.');
      } else {
        setFormError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Row actions ──────────────────────────────────────────────────────────────

  async function handlePauseResume(row: ScheduleListItem) {
    const action = row.status === 'active' ? 'pause' : 'resume';
    setActionLoading((prev) => ({ ...prev, [row.id]: true }));
    try {
      await apiPost(`/api/schedules/${row.id}/${action}`, {});
      loadSchedules();
    } catch (e) {
      // FIX 4: surface the error rather than swallowing it silently
      if (mountedRef.current) setListError(e instanceof Error ? e.message : 'Failed to update schedule. Please try again.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [row.id]: false }));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete(`/api/schedules/${pendingDelete.id}`);
      setPendingDelete(null);
      loadSchedules();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  // ── Day chip toggle ──────────────────────────────────────────────────────────

  function toggleDay(d: number) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(d)
        ? prev.daysOfWeek.filter((x) => x !== d)
        : [...prev.daysOfWeek, d],
    }));
    setFormError(null);
  }

  // ── Editing row lookup ───────────────────────────────────────────────────────
  const editingRow = editingId ? schedules.find((s) => s.id === editingId) ?? null : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  const inputCls = 'w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none placeholder:text-text-tertiary';
  const labelCls = 'text-xs font-bold uppercase tracking-wider text-text-secondary mb-1 block';

  return (
    <div className="flex-1 w-full flex justify-center py-5 md:py-6 px-3 md:px-4 h-full overflow-y-auto">
      <div className="w-full max-w-4xl space-y-5 md:space-y-6 animate-fade-in pb-12">

        {/* Header */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between md:justify-end">
            <button
              onClick={onBack}
              className="md:hidden flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors hover:-translate-x-1 duration-200"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm">Back</span>
            </button>
            <Pill tone="neutral" icon={<CalendarClock className="w-3.5 h-3.5" />}>
              Scheduled practice
            </Pill>
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl leading-tight font-display italic text-text-primary mb-1.5">
              Scheduled Practice
            </h1>
            <p className="text-text-secondary text-sm md:text-base">
              Set up one-off or recurring practice sessions that run automatically.
            </p>
          </div>
        </header>

        {/* Success banner */}
        {formSuccess && (
          <div className="px-4 py-3 rounded-xl border text-sm bg-[color:var(--success-bg)] border-[color:var(--success-border)] text-[color:var(--success-text)]">
            Schedule saved successfully.
          </div>
        )}

        {/* Form card */}
        <Card variant="default" padding="none">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-bg-raised/40 rounded-2xl transition-colors"
            onClick={() => {
              if (editingId) { cancelEdit(); }
              setFormOpen((v) => !v);
            }}
          >
            <span className="font-semibold text-sm text-text-primary flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-accent" />
              {editingId ? `Editing schedule${editingRow ? ` — ${editingRow.label ?? editingRow.course_name ?? ''}` : ''}` : '+ New schedule'}
            </span>
            {formOpen
              ? <ChevronUp className="w-4 h-4 text-text-tertiary" />
              : <ChevronDown className="w-4 h-4 text-text-tertiary" />
            }
          </button>

          {formOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-border-subtle pt-4">

              {/* Course */}
              {editingId ? (
                <div>
                  <span className={labelCls}>Course</span>
                  <div className="px-3 py-2 bg-bg-sunken border border-border-subtle rounded-xl text-sm text-text-primary">
                    {editingRow?.course_name ?? '—'}
                  </div>
                </div>
              ) : (
                <div>
                  <span className={labelCls}>Course</span>
                  <CourseSelect
                    value={form.programCourseId}
                    onChange={(id) => updateForm({ programCourseId: id, topicId: '' })}
                    persistKey="schedule"
                  />
                </div>
              )}

              {/* Topic */}
              {(form.programCourseId || editingId) && (
                <div>
                  <label className={labelCls}>Topic (optional)</label>
                  <select
                    value={form.topicId}
                    onChange={(e) => updateForm({ topicId: e.target.value })}
                    className={inputCls}
                    disabled={topics.length === 0 && !editingId}
                  >
                    <option value="">All topics / mixed</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Difficulty */}
              <div>
                <span className={labelCls}>Difficulty</span>
                <div className="flex gap-2 flex-wrap">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateForm({ difficulty: d })}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors',
                        form.difficulty === d
                          ? 'bg-accent text-slate-950 border-accent'
                          : 'bg-bg-surface text-text-secondary border-border-subtle hover:bg-bg-raised hover:text-text-primary hover:border-border-medium'
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Count */}
              <div>
                <label className={labelCls}>Number of questions</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      // FIX 5: stepper adjusts numeric value and keeps raw string in sync
                      const next = Math.max(1, form.questionCount - 1);
                      updateForm({ questionCount: next, questionCountRaw: String(next) });
                    }}
                    className="w-8 h-8 rounded-lg bg-bg-sunken border border-border-subtle flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-medium transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={form.questionCountRaw}
                    onChange={(e) => {
                      // FIX 5: store raw string — allow clearing and free typing
                      updateForm({ questionCountRaw: e.target.value });
                    }}
                    onBlur={() => {
                      // FIX 5: parse + clamp on blur, keep both raw and numeric in sync
                      const parsed = parseInt(form.questionCountRaw, 10);
                      const clamped = isNaN(parsed) ? 10 : Math.min(50, Math.max(1, parsed));
                      updateForm({ questionCount: clamped, questionCountRaw: String(clamped) });
                    }}
                    className="w-16 text-center bg-bg-sunken border border-border-subtle rounded-xl px-2 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      // FIX 5: stepper adjusts numeric value and keeps raw string in sync
                      const next = Math.min(50, form.questionCount + 1);
                      updateForm({ questionCount: next, questionCountRaw: String(next) });
                    }}
                    className="w-8 h-8 rounded-lg bg-bg-sunken border border-border-subtle flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-medium transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Recurrence toggle */}
              <div>
                <span className={labelCls}>When</span>
                <div className="flex gap-2 mb-3">
                  {(['once', 'weekly'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => updateForm({ recurrence: r })}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-colors',
                        form.recurrence === r
                          ? 'bg-accent text-slate-950 border-accent'
                          : 'bg-bg-surface text-text-secondary border-border-subtle hover:bg-bg-raised hover:text-text-primary hover:border-border-medium'
                      )}
                    >
                      {r === 'once' ? 'One-off' : 'Weekly'}
                    </button>
                  ))}
                </div>

                {form.recurrence === 'once' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Date</label>
                      <input
                        type="date"
                        value={form.runDate}
                        onChange={(e) => updateForm({ runDate: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Time</label>
                      <input
                        type="time"
                        value={form.runTime}
                        onChange={(e) => updateForm({ runTime: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <span className={labelCls}>Days</span>
                      <div className="flex gap-2 flex-wrap">
                        {DAY_LABELS.map((day, idx) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(idx)}
                            className={cn(
                              'w-10 h-10 rounded-xl text-xs font-bold border transition-colors',
                              form.daysOfWeek.includes(idx)
                                ? 'bg-accent text-slate-950 border-accent'
                                : 'bg-bg-surface text-text-secondary border-border-subtle hover:bg-bg-raised hover:text-text-primary hover:border-border-medium'
                            )}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Time</label>
                        <input
                          type="time"
                          value={form.timeOfDay}
                          onChange={(e) => updateForm({ timeOfDay: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Ends on (optional)</label>
                        <input
                          type="date"
                          value={form.endsOn}
                          onChange={(e) => updateForm({ endsOn: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Label */}
              <div>
                <label className={labelCls}>Label (optional)</label>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="e.g. Monday morning warmup"
                  value={form.label}
                  onChange={(e) => updateForm({ label: e.target.value })}
                  className={inputCls}
                />
              </div>

              {/* Error */}
              {formError && (
                <div className="px-3 py-2 rounded-lg text-xs bg-[color:var(--danger-bg)] border border-[color:var(--danger-border)] text-[color:var(--danger-text)]">
                  {formError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {editingId ? 'Update schedule' : 'Save schedule'}
                </Button>
                {editingId && (
                  <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>
                    Cancel edit
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* List */}
        <div className="space-y-3">
          {listLoading ? (
            <Spinner size="md" className="py-20" />
          ) : listError ? (
            <div className="py-6 px-4 rounded-2xl border text-sm bg-[color:var(--danger-bg)] border-[color:var(--danger-border)] text-[color:var(--danger-text)]">
              Couldn't load schedules: {listError}
            </div>
          ) : schedules.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No scheduled practice yet"
              description="Create a schedule above to automate your practice sessions."
            />
          ) : (
            schedules.map((row) => {
              const title = row.label || [row.course_name, row.topic_name].filter(Boolean).join(' · ') || '—';
              const metaDifficulty = row.difficulty ? capitalize(row.difficulty) : 'All';
              const nextRunText = formatNextRun(row);
              const weeklyPattern = formatWeeklyPattern(row);
              const isLoading = !!actionLoading[row.id];
              const canPauseResume = row.status === 'active' || row.status === 'paused';

              return (
                <Card key={row.id} variant="default" padding="sm" className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="font-semibold text-base text-text-primary leading-snug">{title}</h3>
                      <p className="text-xs text-text-secondary">
                        {metaDifficulty} · {row.question_count} Q · {row.recurrence === 'once' ? 'One-off' : 'Weekly'}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <Pill tone={statusTone(row.status)}>
                          {capitalize(row.status)}
                        </Pill>
                        <span className="text-xs text-text-secondary">
                          {row.status === 'active' || row.status === 'paused'
                            ? (row.next_run_at ? `Next: ${nextRunText}` : nextRunText)
                            : nextRunText}
                        </span>
                      </div>
                      {row.recurrence === 'weekly' && weeklyPattern && (
                        <p className="text-[11px] text-text-tertiary">{weeklyPattern}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Edit */}
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => enterEditMode(row)}
                        className="w-8 h-8 rounded-full bg-bg-raised flex items-center justify-center border border-border-subtle text-text-tertiary hover:text-accent hover:border-accent transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {/* Pause / Resume */}
                      {canPauseResume && (
                        <button
                          type="button"
                          title={row.status === 'active' ? 'Pause' : 'Resume'}
                          onClick={() => handlePauseResume(row)}
                          disabled={isLoading}
                          className="w-8 h-8 rounded-full bg-bg-raised flex items-center justify-center border border-border-subtle text-text-tertiary hover:text-text-primary hover:border-border-medium transition-colors disabled:opacity-40"
                        >
                          {isLoading
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : row.status === 'active'
                              ? <Pause className="w-3.5 h-3.5" />
                              : <Play className="w-3.5 h-3.5" />
                          }
                        </button>
                      )}

                      {/* Add to calendar */}
                      {row.status === 'active' && (
                        <button
                          type="button"
                          title="Add to calendar"
                          onClick={() => downloadIcs(`practice-${row.id}.ics`, buildScheduleIcs(row, window.location.origin))}
                          className="w-8 h-8 rounded-full bg-bg-raised flex items-center justify-center border border-border-subtle text-text-tertiary hover:text-accent hover:border-accent transition-colors"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        type="button"
                        title="Cancel / delete"
                        onClick={() => { setDeleteError(null); setPendingDelete(row); }}
                        className="w-8 h-8 rounded-full bg-bg-raised flex items-center justify-center border border-border-subtle text-text-tertiary hover:text-[color:var(--accent-danger)] hover:border-[color:var(--danger-border)] hover:bg-[color:var(--danger-bg)] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 animate-fade-in"
          onClick={() => { if (!deleting) setPendingDelete(null); }}
        >
          <div
            className="w-full max-w-md bg-bg-surface border border-border-subtle rounded-2xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[color:var(--danger-bg)] text-[color:var(--accent-danger)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-text-primary mb-1">Cancel this schedule?</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  <span className="font-semibold text-text-primary">
                    {pendingDelete.label ?? pendingDelete.course_name ?? 'This schedule'}
                  </span>{' '}
                  will be permanently deleted and won't run again.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="px-3 py-2 rounded-lg text-xs bg-[color:var(--danger-bg)] border border-[color:var(--danger-border)] text-[color:var(--danger-text)]">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                Keep it
              </Button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 bg-[color:var(--accent-danger)] text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
