import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Trash2, ChevronLeft, ChevronRight, FileText, Layers } from 'lucide-react';
import { apiDelete, apiGet } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { usePersistentState } from '../../lib/usePersistentState';
import { RichText } from '../ui/RichText';
import { CourseSelect } from './CourseSelect';
import { ManualQuestionEntry } from './ManualQuestionEntry';
import { QuestionGroupEditor } from './QuestionGroupEditor';

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
  question_group_id: string | null;
  part_label: string | null;
  part_index: number | null;
}

type LibraryItem =
  | { kind: 'single'; row: QuestionRow }
  | { kind: 'group'; groupId: string; parts: QuestionRow[] };

function buildItems(rows: QuestionRow[]): LibraryItem[] {
  const items: LibraryItem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.question_group_id) {
      if (seen.has(r.question_group_id)) continue;
      seen.add(r.question_group_id);
      const parts = rows
        .filter((x) => x.question_group_id === r.question_group_id)
        .sort((a, b) => (a.part_index ?? 0) - (b.part_index ?? 0));
      items.push({ kind: 'group', groupId: r.question_group_id, parts });
    } else {
      items.push({ kind: 'single', row: r });
    }
  }
  return items;
}

const PAGE_SIZE = 25;

export function QuestionLibrary() {
  const [programCourseId, setProgramCourseId] = usePersistentState('library.programCourseId', '');
  const [courseLabel, setCourseLabel] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = usePersistentState('library.topicId', '');
  const [typeFilter, setTypeFilter] = usePersistentState<'' | 'mcq' | 'calc'>('library.typeFilter', '');

  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = usePersistentState('library.offset', 0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Persisted filters must survive a refresh — only clear topic/offset when
  // the course actually changes, not when state is rehydrated on mount.
  const lastCourseRef = useRef(programCourseId);
  useEffect(() => {
    if (lastCourseRef.current !== programCourseId) {
      setTopicId('');
      setOffset(0);
      lastCourseRef.current = programCourseId;
    }
    if (!programCourseId) {
      setTopics([]);
      setCourseLabel('');
      return;
    }
    apiGet<Topic[]>(`/api/topics?program_course_id=${programCourseId}`)
      .then((next) => {
        setTopics(next);
        if (topicId && !next.find((t) => t.id === topicId)) setTopicId('');
      })
      .catch((e) => console.error(e));
    apiGet<ProgramCourseDetail>(`/api/program-courses/${programCourseId}`)
      .then((pc) => setCourseLabel(pc?.courses?.name ?? ''))
      .catch(() => setCourseLabel(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleDeleteGroup = async (groupId: string, partCount: number) => {
    if (!confirm(`Delete all ${partCount} parts of this multi-part question? This also removes their options and any attached diagrams.`)) return;
    setDeletingGroup(groupId);
    try {
      await apiDelete(`/api/questions/by-group/${groupId}`);
      setRows((prev) => prev.filter((r) => r.question_group_id !== groupId));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingGroup(null);
    }
  };

  if (editingGroupId) {
    return (
      <QuestionGroupEditor
        groupId={editingGroupId}
        topics={topics}
        courseLabel={courseLabel || undefined}
        onCancel={() => setEditingGroupId(null)}
        onDone={() => {
          setEditingGroupId(null);
          fetchList();
        }}
      />
    );
  }

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

  const items = buildItems(rows);

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
            {items.map((item) =>
              item.kind === 'group' ? (
                <div
                  key={item.groupId}
                  className="bg-surface-container-low border border-primary/30 rounded-2xl px-4 py-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">
                        <Layers className="w-3 h-3" />
                        Multi-part · {item.parts.length} parts
                      </span>
                      <span className="text-[10px] text-text-secondary">
                        Parts: {item.parts.map((p) => p.part_label ?? '?').join(', ')}
                      </span>
                    </div>
                    <PromptPreview text={item.parts[0].prompt} />
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-bold uppercase tracking-wider">
                      <Badge tone="diff">{item.parts[0].difficulty}</Badge>
                      <Badge tone="scope">{item.parts[0].exam_scope}</Badge>
                      {topics.find((t) => t.id === item.parts[0].topic_id)?.name && (
                        <Badge tone="topic">
                          {topics.find((t) => t.id === item.parts[0].topic_id)?.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setEditingGroupId(item.groupId)}
                      className="flex items-center gap-1.5 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(item.groupId, item.parts.length)}
                      disabled={deletingGroup === item.groupId}
                      className="flex items-center gap-1.5 text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {deletingGroup === item.groupId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={item.row.id}
                  className="bg-surface-container-low border border-border-subtle rounded-2xl px-4 py-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <PromptPreview text={item.row.prompt} />
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-bold uppercase tracking-wider">
                      <Badge>{item.row.type === 'mcq' ? 'MCQ' : 'Calc'}</Badge>
                      <Badge tone="diff">{item.row.difficulty}</Badge>
                      <Badge tone="scope">{item.row.exam_scope}</Badge>
                      {topics.find((t) => t.id === item.row.topic_id)?.name && (
                        <Badge tone="topic">
                          {topics.find((t) => t.id === item.row.topic_id)?.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setEditingId(item.row.id)}
                      className="flex items-center gap-1.5 text-xs bg-bg-raised border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-bg-sunken"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.row.id)}
                      disabled={deleting === item.row.id}
                      className="flex items-center gap-1.5 text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {deleting === item.row.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              )
            )}

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

function PromptPreview({ text }: { text?: string | null }) {
  const trimmed = text?.trim();
  return (
    <div className="text-sm text-text-primary line-clamp-2 break-words">
      {trimmed ? (
        <RichText inline className="text-sm text-text-primary">
          {trimmed}
        </RichText>
      ) : (
        <em className="text-text-tertiary">(no prompt text)</em>
      )}
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
