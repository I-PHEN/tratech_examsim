import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Trash2, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { apiDelete, apiGet } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { CourseSelect } from './CourseSelect';
import { ManualQuestionEntry } from './ManualQuestionEntry';

interface Topic {
  id: string;
  name: string;
}

interface ProgramCourseDetail {
  id: string;
  courses?: { name: string; code: string } | null;
}

interface QuestionRow {
  id: string;
  program_course_id: string;
  topic_id: string;
  type: 'mcq' | 'calc';
  difficulty: 'easy' | 'medium' | 'hard';
  exam_scope: 'midsem' | 'final' | 'both';
  prompt: string;
  created_at: string;
}

const PAGE_SIZE = 25;

export function QuestionLibrary() {
  const [programCourseId, setProgramCourseId] = useState('');
  const [courseLabel, setCourseLabel] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'mcq' | 'calc'>('');

  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setTopicId('');
    setOffset(0);
    if (!programCourseId) {
      setTopics([]);
      setCourseLabel('');
      return;
    }
    apiGet<Topic[]>(`/api/topics?program_course_id=${programCourseId}`)
      .then(setTopics)
      .catch((e) => console.error(e));
    apiGet<ProgramCourseDetail>(`/api/program-courses/${programCourseId}`)
      .then((pc) => setCourseLabel(pc?.courses?.name ?? ''))
      .catch(() => setCourseLabel(''));
  }, [programCourseId]);

  const fetchList = () => {
    if (!programCourseId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      program_course_id: programCourseId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (topicId) params.set('topic_id', topicId);
    if (typeFilter) params.set('type', typeFilter);
    apiGet<QuestionRow[]>(`/api/questions?${params.toString()}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programCourseId, topicId, typeFilter, offset]);

  const topicLabel = useMemo(
    () => topics.find((t) => t.id === topicId)?.name,
    [topics, topicId]
  );

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question permanently? This also removes its options and any attached diagrams.')) return;
    setDeleting(id);
    try {
      await apiDelete(`/api/questions/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  };

  if (editingId) {
    const editingRow = rows.find((r) => r.id === editingId);
    const editingTopic = editingRow ? topics.find((t) => t.id === editingRow.topic_id)?.name : undefined;
    return (
      <ManualQuestionEntry
        editing={{ id: editingId }}
        courseLabel={courseLabel || undefined}
        topicLabel={editingTopic ?? topicLabel}
        onCancel={() => setEditingId(null)}
        onDone={() => {
          setEditingId(null);
          fetchList();
        }}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4">
          <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary mb-3">
            Course
          </h4>
          <CourseSelect value={programCourseId} onChange={setProgramCourseId} compact />
        </div>

        {programCourseId && (
          <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-[10px] font-bold text-text-secondary block mb-1 uppercase tracking-wider">
                Topic
              </label>
              <select
                value={topicId}
                onChange={(e) => {
                  setTopicId(e.target.value);
                  setOffset(0);
                }}
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
              >
                <option value="">All topics</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-text-secondary block mb-1 uppercase tracking-wider">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as '' | 'mcq' | 'calc');
                  setOffset(0);
                }}
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
              >
                <option value="">All</option>
                <option value="mcq">Multiple Choice</option>
                <option value="calc">Calculation</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-3 space-y-3">
        {!programCourseId ? (
          <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-12 text-center text-text-secondary">
            Pick a course on the left to browse its published questions.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center min-h-[200px] text-text-secondary">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 text-red-500 rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-12 text-center text-text-secondary flex flex-col items-center gap-2">
            <FileText className="w-6 h-6" />
            No questions in this {topicId ? 'topic' : 'course'} yet.
          </div>
        ) : (
          <>
            {rows.map((r) => (
              <div
                key={r.id}
                className="bg-surface-container-low border border-border-subtle rounded-2xl px-4 py-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary line-clamp-2 break-words">
                    {r.prompt || <em className="text-text-tertiary">(no prompt text)</em>}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-bold uppercase tracking-wider">
                    <Badge>{r.type === 'mcq' ? 'MCQ' : 'Calc'}</Badge>
                    <Badge tone="diff">{r.difficulty}</Badge>
                    <Badge tone="scope">{r.exam_scope}</Badge>
                    {topics.find((t) => t.id === r.topic_id)?.name && (
                      <Badge tone="topic">
                        {topics.find((t) => t.id === r.topic_id)?.name}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setEditingId(r.id)}
                    className="flex items-center gap-1.5 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="flex items-center gap-1.5 text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {deleting === r.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-text-secondary">
                Showing {offset + 1}–{offset + rows.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="flex items-center gap-1 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <button
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  disabled={rows.length < PAGE_SIZE}
                  className="flex items-center gap-1 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'diff' | 'scope' | 'topic';
}) {
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 rounded border',
        tone === 'default' && 'bg-bg-raised border-border-subtle text-text-secondary',
        tone === 'diff' && 'bg-primary/10 border-primary/20 text-primary',
        tone === 'scope' && 'bg-tertiary/10 border-tertiary/30 text-tertiary',
        tone === 'topic' && 'bg-bg-sunken border-border-subtle text-text-secondary normal-case tracking-normal font-normal'
      )}
    >
      {children}
    </span>
  );
}
