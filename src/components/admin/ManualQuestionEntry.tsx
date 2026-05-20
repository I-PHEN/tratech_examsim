import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, ListChecks, Calculator, Image as ImageIcon, ImageUp, X, Sparkles, Eye, EyeOff } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { RichText } from '../ui/RichText';
import { CourseSelect } from './CourseSelect';

type QType = 'mcq' | 'calc';
type Difficulty = 'easy' | 'medium' | 'hard';
type ExamScope = 'midsem' | 'final' | 'both';
type AnswerType = 'exact' | 'range';

interface Topic {
  id: string;
  name: string;
}

interface CreatedAsset {
  id: string;
  url: string;
  mime_type: string;
  position: number;
}

interface PendingImage {
  localId: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  remoteId?: string;
}

interface AttachedAsset {
  id: string;
  url: string;
  mime_type: string;
  position: number;
  kind?: 'prompt' | 'solution';
}

interface LoadedQuestion {
  id: string;
  program_course_id: string;
  topic_id: string;
  type: QType;
  difficulty: Difficulty;
  exam_scope: ExamScope;
  answer_type: AnswerType | null;
  content: {
    prompt: string;
    explanation: string | null;
    correct_answer: string;
    answer_tolerance: number | null;
    unit: string | null;
    source_reference?: string | null;
  };
  options?: Array<{ id: string; text: string; is_correct: boolean }>;
  assets: AttachedAsset[];
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const EXAM_SCOPES: ExamScope[] = ['midsem', 'final', 'both'];

function emptyOption() {
  return { text: '', is_correct: false };
}

export interface ManualQuestionEntryProps {
  editing?: { id: string } | null;
  courseLabel?: string;
  topicLabel?: string;
  onDone?: () => void;
  onCancel?: () => void;
}

export function ManualQuestionEntry({
  editing = null,
  courseLabel,
  topicLabel,
  onDone,
  onCancel,
}: ManualQuestionEntryProps = {}) {
  const [type, setType] = useState<QType>('mcq');
  const [programCourseId, setProgramCourseId] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState('');
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [topicSaving, setTopicSaving] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [examScope, setExamScope] = useState<ExamScope>('both');

  const [prompt, setPrompt] = useState('');
  const [explanation, setExplanation] = useState('');
  const [fmtBusy, setFmtBusy] = useState<'prompt' | 'explanation' | null>(null);
  const [preview, setPreview] = useState<Set<'prompt' | 'explanation'>>(new Set());

  const togglePreview = (k: 'prompt' | 'explanation') =>
    setPreview((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const formatField = async (
    field: 'prompt' | 'explanation',
    value: string,
    setter: (v: string) => void
  ) => {
    if (!value.trim()) return;
    setFmtBusy(field);
    try {
      const { formatted } = await apiPost<{ formatted: string }>('/api/ingestion/format', {
        text: value,
      });
      setter(formatted);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setFmtBusy(null);
    }
  };
  const [sourceReference, setSourceReference] = useState('');
  const [solutionImage, setSolutionImage] = useState<File | null>(null);
  const [solutionOcrBusy, setSolutionOcrBusy] = useState(false);

  const [options, setOptions] = useState([emptyOption(), emptyOption()]);

  const [correctAnswer, setCorrectAnswer] = useState('');
  const [answerType, setAnswerType] = useState<AnswerType>('exact');
  const [answerTolerance, setAnswerTolerance] = useState('');
  const [unit, setUnit] = useState('');

  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [attachedDiagrams, setAttachedDiagrams] = useState<AttachedAsset[]>([]);
  const [attachedSolution, setAttachedSolution] = useState<AttachedAsset | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState(editing ? 'Save changes' : 'Save Question');
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const [loading, setLoading] = useState(Boolean(editing));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    apiGet<LoadedQuestion>(`/api/questions/${editing.id}`)
      .then((q) => {
        if (cancelled) return;
        setType(q.type);
        setProgramCourseId(q.program_course_id);
        setTopicId(q.topic_id);
        setDifficulty(q.difficulty);
        setExamScope(q.exam_scope);
        setPrompt(q.content.prompt ?? '');
        setExplanation(q.content.explanation ?? '');
        setSourceReference(q.content.source_reference ?? '');
        if (q.type === 'mcq' && q.options) {
          setOptions(q.options.map((o) => ({ text: o.text, is_correct: o.is_correct })));
        } else {
          setCorrectAnswer(q.content.correct_answer ?? '');
          setAnswerType(q.answer_type ?? 'exact');
          setAnswerTolerance(
            q.content.answer_tolerance != null ? String(q.content.answer_tolerance) : ''
          );
          setUnit(q.content.unit ?? '');
        }
        const diagrams = (q.assets ?? []).filter((a) => a.kind !== 'solution');
        const sol = (q.assets ?? []).find((a) => a.kind === 'solution') ?? null;
        setAttachedDiagrams(diagrams);
        setAttachedSolution(sol);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing]);

  useEffect(() => {
    if (!editing) setTopicId('');
    setAddingTopic(false);
    setNewTopicName('');
    setTopicError(null);
    if (!programCourseId) {
      setTopics([]);
      return;
    }
    setTopicsLoading(true);
    apiGet<Topic[]>(`/api/topics?program_course_id=${programCourseId}`)
      .then(setTopics)
      .catch(console.error)
      .finally(() => setTopicsLoading(false));
  }, [programCourseId, editing]);

  const createTopic = async () => {
    const name = newTopicName.trim();
    if (!name) return;
    if (!programCourseId) return;
    setTopicSaving(true);
    setTopicError(null);
    try {
      const created = await apiPost<Topic>('/api/topics', {
        program_course_id: programCourseId,
        name,
      });
      setTopics((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setTopicId(created.id);
      setNewTopicName('');
      setAddingTopic(false);
    } catch (e) {
      setTopicError(e instanceof Error ? e.message : String(e));
    } finally {
      setTopicSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setPrompt('');
    setExplanation('');
    setSourceReference('');
    setSolutionImage(null);
    setOptions([emptyOption(), emptyOption()]);
    setCorrectAnswer('');
    setAnswerType('exact');
    setAnswerTolerance('');
    setUnit('');
    pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPendingImages([]);
  };

  const handleOptionChange = (i: number, field: 'text' | 'is_correct', value: string | boolean) => {
    setOptions((prev) => {
      const next = prev.map((o) => ({ ...o }));
      if (field === 'text') next[i].text = value as string;
      else {
        next.forEach((o, idx) => {
          o.is_correct = idx === i ? (value as boolean) : false;
        });
      }
      return next;
    });
  };

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, emptyOption()]);
  };

  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleImagesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: PendingImage[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      next.push({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: 'pending',
      });
    }
    setPendingImages((prev) => [...prev, ...next]);
  };

  const removePendingImage = (localId: string) => {
    setPendingImages((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  };

  const removeAttachedAsset = async (assetId: string, kind: 'prompt' | 'solution') => {
    if (!editing) return;
    if (!confirm('Remove this image? This cannot be undone.')) return;
    try {
      await apiDelete(`/api/questions/${editing.id}/assets/${assetId}`);
      if (kind === 'solution') {
        setAttachedSolution(null);
      } else {
        setAttachedDiagrams((prev) => prev.filter((a) => a.id !== assetId));
      }
    } catch (e) {
      setMsg({
        text: `Failed to remove image: ${e instanceof Error ? e.message : String(e)}`,
        type: 'err',
      });
    }
  };

  const validateBeforeSubmit = (): string | null => {
    if (!programCourseId) return 'Pick a course.';
    if (!topicId) return 'Pick a topic.';
    if (prompt.trim().length === 0) return 'Question prompt is required.';
    if (type === 'mcq') {
      if (options.length < 2) return 'MCQ needs at least 2 options.';
      if (options.some((o) => o.text.trim().length === 0)) return 'Every option needs text.';
      const correctCount = options.filter((o) => o.is_correct).length;
      if (correctCount !== 1) return 'Exactly one option must be marked correct.';
    } else {
      if (correctAnswer.trim().length === 0) return 'Calc question needs a correct answer.';
      if (answerType === 'range' && !answerTolerance.trim()) {
        return 'Range answers need a tolerance.';
      }
      if (answerTolerance && Number.isNaN(Number(answerTolerance))) {
        return 'Tolerance must be a number.';
      }
    }
    return null;
  };

  const submit = async () => {
    const error = validateBeforeSubmit();
    if (error) {
      setMsg({ text: error, type: 'err' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    setStatusText(editing ? 'Saving changes…' : 'Saving question…');

    try {
      const createPayload =
        type === 'mcq'
          ? {
              program_course_id: programCourseId,
              topic_id: topicId,
              difficulty,
              exam_scope: examScope,
              type: 'mcq' as const,
              content: {
                prompt: prompt.trim(),
                explanation: explanation.trim() || undefined,
                ...(sourceReference.trim() ? { source_reference: sourceReference.trim() } : {}),
              },
              options: options.map((o) => ({ text: o.text.trim(), is_correct: o.is_correct })),
            }
          : {
              program_course_id: programCourseId,
              topic_id: topicId,
              difficulty,
              exam_scope: examScope,
              type: 'calc' as const,
              answer_type: answerType,
              content: {
                prompt: prompt.trim(),
                explanation: explanation.trim() || undefined,
                ...(sourceReference.trim() ? { source_reference: sourceReference.trim() } : {}),
                correct_answer: correctAnswer.trim(),
                ...(answerTolerance ? { answer_tolerance: Number(answerTolerance) } : {}),
                ...(unit.trim() ? { unit: unit.trim() } : {}),
              },
            };

      let targetId: string;
      if (editing) {
        const { program_course_id: _omit, ...rest } = createPayload;
        await apiPatch(`/api/questions/${editing.id}`, rest);
        targetId = editing.id;
      } else {
        const created = await apiPost<{ id: string }>('/api/questions', createPayload);
        targetId = created.id;
      }

      let solutionImageError: string | null = null;
      if (solutionImage) {
        setStatusText('Uploading solution image…');
        try {
          const sfd = new FormData();
          sfd.append('file', solutionImage);
          sfd.append('kind', 'solution');
          await apiUpload<CreatedAsset>(`/api/questions/${targetId}/assets`, sfd);
        } catch (e) {
          solutionImageError = e instanceof Error ? e.message : String(e);
        }
      }

      const total = pendingImages.length;
      const uploadedRemoteIds: string[] = [];
      let imageError: string | null = null;

      for (let i = 0; i < pendingImages.length; i++) {
        const img = pendingImages[i];
        setStatusText(`Uploading ${i + 1}/${total} diagrams…`);
        setPendingImages((prev) =>
          prev.map((p) => (p.localId === img.localId ? { ...p, status: 'uploading' } : p))
        );
        try {
          const fd = new FormData();
          fd.append('file', img.file);
          const asset = await apiUpload<CreatedAsset>(
            `/api/questions/${targetId}/assets`,
            fd
          );
          uploadedRemoteIds.push(asset.id);
          setPendingImages((prev) =>
            prev.map((p) =>
              p.localId === img.localId ? { ...p, status: 'done', remoteId: asset.id } : p
            )
          );
        } catch (e) {
          imageError = e instanceof Error ? e.message : String(e);
          setPendingImages((prev) =>
            prev.map((p) =>
              p.localId === img.localId
                ? { ...p, status: 'error', error: imageError ?? undefined }
                : p
            )
          );
          break;
        }
      }

      const verb = editing ? 'updated' : 'published';
      if (imageError) {
        setMsg({
          text: `Question ${verb} (${uploadedRemoteIds.length}/${total} diagrams uploaded). Last error: ${imageError}. Remove or retry the failing diagram.`,
          type: 'err',
        });
      } else if (solutionImageError) {
        setMsg({
          text: `Question ${verb}, but the solution image failed to attach: ${solutionImageError}`,
          type: 'err',
        });
      } else {
        setMsg({
          text:
            total > 0
              ? `Question ${verb} with ${total} new diagram${total === 1 ? '' : 's'}.`
              : `Question ${verb}.`,
          type: 'ok',
        });
        if (!editing) {
          resetForm();
        } else {
          pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          setPendingImages([]);
          setSolutionImage(null);
          onDone?.();
        }
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : String(err), type: 'err' });
    } finally {
      setSubmitting(false);
      setStatusText(editing ? 'Save changes' : 'Save Question');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 text-red-500 rounded-2xl px-4 py-3 text-sm">
        Failed to load question: {loadError}
        {onCancel && (
          <button onClick={onCancel} className="ml-3 underline font-bold">
            Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-in fade-in duration-200">
      <div className="lg:col-span-2 bg-surface-container-low border border-border-subtle rounded-2xl p-5 flex flex-col gap-4">
        {editing && (
          <div className="flex items-center justify-between bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2">
            <div className="text-xs text-text-secondary">
              Editing question
              {(courseLabel || topicLabel) && (
                <span className="text-text-primary font-bold">
                  {' '}
                  in {courseLabel ?? '—'} / {topicLabel ?? '—'}
                </span>
              )}
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                className="text-xs font-bold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {(['mcq', 'calc'] as QType[]).map((t) => (
            <button
              key={t}
              onClick={() => !editing && setType(t)}
              disabled={Boolean(editing) && type !== t}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all',
                type === t
                  ? 'bg-bg-raised text-primary border border-primary/20'
                  : 'bg-surface-container-low text-text-secondary border border-border-subtle hover:bg-bg-raised',
                editing && 'disabled:opacity-30 disabled:cursor-not-allowed'
              )}
              title={editing ? 'Type cannot be changed after publish' : undefined}
            >
              {t === 'mcq' ? <ListChecks className="w-3.5 h-3.5" /> : <Calculator className="w-3.5 h-3.5" />}
              {t === 'mcq' ? 'Multiple Choice' : 'Calculation'}
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-text-secondary font-bold block uppercase tracking-wider">
              Question Prompt
            </label>
            <div className="flex items-center gap-3 text-text-secondary">
              <button
                type="button"
                onClick={() => formatField('prompt', prompt, setPrompt)}
                disabled={fmtBusy !== null || !prompt.trim()}
                title="AI clean-up formatting (Markdown + LaTeX)"
                className="flex items-center gap-1 text-[11px] hover:text-primary disabled:opacity-40"
              >
                {fmtBusy === 'prompt' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Format
              </button>
              <button
                type="button"
                onClick={() => togglePreview('prompt')}
                title="Toggle rendered preview"
                className="flex items-center gap-1 text-[11px] hover:text-text-primary"
              >
                {preview.has('prompt') ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                Preview
              </button>
            </div>
          </div>
          {preview.has('prompt') ? (
            <div className="w-full min-h-[120px] bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary">
              <RichText>{prompt}</RichText>
            </div>
          ) : (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type the full question text here. Paste raw text and hit Format to auto-typeset math/units. For multi-part questions, create one entry per sub-part."
              className="w-full min-h-[120px] bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none resize-y"
            />
          )}
        </div>

        {type === 'mcq' ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">
                Options · pick one correct
              </label>
              <button
                type="button"
                onClick={addOption}
                disabled={options.length >= 6}
                className="flex items-center gap-1 text-xs font-bold text-primary disabled:opacity-30 hover:underline"
              >
                <Plus className="w-3 h-3" /> Add option
              </button>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label
                    className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-lg border cursor-pointer shrink-0 transition-colors',
                      opt.is_correct
                        ? 'bg-tertiary/15 border-tertiary text-tertiary'
                        : 'bg-bg-sunken border-border-subtle text-text-secondary hover:border-primary/40'
                    )}
                    title="Mark as correct"
                  >
                    <input
                      type="radio"
                      name="correct"
                      checked={opt.is_correct}
                      onChange={() => handleOptionChange(i, 'is_correct', true)}
                      className="hidden"
                    />
                    <span className="text-xs font-bold">{String.fromCharCode(65 + i)}</span>
                  </label>
                  <input
                    value={opt.text}
                    onChange={(e) => handleOptionChange(i, 'text', e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 bg-bg-sunken border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    className="p-2 text-text-secondary hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove option"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
                Correct Answer
              </label>
              <input
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                placeholder="e.g. 0.0231"
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
                Unit
              </label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. mol/L"
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
                Answer Type
              </label>
              <select
                value={answerType}
                onChange={(e) => setAnswerType(e.target.value as AnswerType)}
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              >
                <option value="exact">Exact</option>
                <option value="range">Range</option>
              </select>
            </div>
            {answerType === 'range' && (
              <div className="md:col-span-2">
                <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
                  Tolerance (±)
                </label>
                <input
                  value={answerTolerance}
                  onChange={(e) => setAnswerTolerance(e.target.value)}
                  placeholder="e.g. 0.05"
                  className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-text-secondary font-bold block uppercase tracking-wider">
              Explanation (optional)
            </label>
            <div className="flex items-center gap-3 text-text-secondary">
              <button
                type="button"
                onClick={() => formatField('explanation', explanation, setExplanation)}
                disabled={fmtBusy !== null || !explanation.trim()}
                title="AI clean-up formatting (Markdown + LaTeX)"
                className="flex items-center gap-1 text-[11px] hover:text-primary disabled:opacity-40"
              >
                {fmtBusy === 'explanation' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Format
              </button>
              <button
                type="button"
                onClick={() => togglePreview('explanation')}
                title="Toggle rendered preview"
                className="flex items-center gap-1 text-[11px] hover:text-text-primary"
              >
                {preview.has('explanation') ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                Preview
              </button>
            </div>
          </div>
          {preview.has('explanation') ? (
            <div className="w-full min-h-[70px] bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary">
              <RichText>{explanation}</RichText>
            </div>
          ) : (
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Worked solution or hint shown after the student answers. Paste raw text and hit Format to auto-typeset."
              className="w-full min-h-[70px] bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none resize-y"
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
              Source / reference (optional)
            </label>
            <input
              value={sourceReference}
              onChange={(e) => setSourceReference(e.target.value)}
              placeholder="e.g. 2021 Final Exam, Q3"
              className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
              Handwritten solution image (optional)
            </label>
            <label className="flex items-center gap-2 cursor-pointer bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:border-primary/40">
              {solutionOcrBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageUp className="w-4 h-4" />
              )}
              <span className="truncate">
                {solutionImage
                  ? `${solutionImage.name} — replace`
                  : solutionOcrBusy
                    ? 'Reading image…'
                    : 'Upload & OCR into solution'}
              </span>
              <input
                type="file"
                hidden
                accept="image/*"
                disabled={solutionOcrBusy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setSolutionImage(f);
                  setSolutionOcrBusy(true);
                  try {
                    const fd = new FormData();
                    fd.append('file', f);
                    const r = await apiUpload<{ text: string }>(
                      '/api/questions/ocr-solution',
                      fd
                    );
                    if (!explanation.trim() && r.text) setExplanation(r.text);
                  } catch (err) {
                    setMsg({
                      text: `OCR failed: ${err instanceof Error ? err.message : String(err)}`,
                      type: 'err',
                    });
                  } finally {
                    setSolutionOcrBusy(false);
                  }
                }}
              />
            </label>
            <p className="text-[10px] text-text-secondary mt-1">
              OCR fills the explanation above; the single answer stays the marking input.
            </p>
            {attachedSolution && (
              <div className="mt-2 flex items-center gap-2 bg-bg-sunken border border-border-subtle rounded-lg p-2">
                <img
                  src={attachedSolution.url}
                  alt="attached solution"
                  className="w-12 h-12 object-cover rounded"
                />
                <span className="text-[10px] text-text-secondary flex-1 truncate">
                  Existing solution image attached
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachedAsset(attachedSolution.id, 'solution')}
                  className="p-1.5 text-text-secondary hover:text-red-500"
                  title="Remove attached solution image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">
              Diagrams (optional)
            </label>
            <label className="cursor-pointer flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <Plus className="w-3 h-3" /> Add image
              <input
                type="file"
                hidden
                multiple
                accept="image/*"
                onChange={(e) => {
                  handleImagesPicked(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {pendingImages.length === 0 && attachedDiagrams.length === 0 ? (
            <div className="bg-bg-sunken border border-dashed border-border-subtle rounded-xl px-4 py-6 text-center text-xs text-text-secondary flex flex-col items-center gap-1.5">
              <ImageIcon className="w-5 h-5" />
              No diagrams attached. Use “Add image” for figures students need to see.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {attachedDiagrams.map((a) => (
                <div
                  key={a.id}
                  className="relative group rounded-lg overflow-hidden border border-border-subtle bg-bg-sunken"
                >
                  <img
                    src={a.url}
                    alt="attached diagram"
                    className="w-full h-28 object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-tertiary/80 text-on-primary">
                    Attached
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachedAsset(a.id, 'prompt')}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove attached image"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {pendingImages.map((img) => (
                <div
                  key={img.localId}
                  className="relative group rounded-lg overflow-hidden border border-border-subtle bg-bg-sunken"
                >
                  <img
                    src={img.previewUrl}
                    alt="diagram preview"
                    className="w-full h-28 object-cover"
                  />
                  <div
                    className={cn(
                      'absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                      img.status === 'done' && 'bg-tertiary/80 text-on-primary',
                      img.status === 'uploading' && 'bg-primary/80 text-on-primary',
                      img.status === 'error' && 'bg-red-500/80 text-white',
                      img.status === 'pending' && 'bg-black/40 text-white'
                    )}
                  >
                    {img.status === 'pending' && 'Ready'}
                    {img.status === 'uploading' && 'Uploading…'}
                    {img.status === 'done' && 'Uploaded'}
                    {img.status === 'error' && (img.error?.slice(0, 40) ?? 'Failed')}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePendingImage(img.localId)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          disabled={submitting}
          onClick={submit}
          className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {statusText}
        </button>

        {msg && (
          <div
            className={cn(
              'px-3 py-2 rounded-lg text-xs font-medium whitespace-pre-wrap break-words',
              msg.type === 'ok'
                ? 'bg-tertiary/10 text-tertiary border border-tertiary/30'
                : 'bg-red-500/10 text-red-500 border border-red-500/30'
            )}
          >
            {msg.text}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {!editing && (
          <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4">
            <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary mb-3">
              Target Course
            </h4>
            <CourseSelect value={programCourseId} onChange={setProgramCourseId} compact />
          </div>
        )}
        {editing && (
          <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4">
            <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary mb-2">
              Course
            </h4>
            <div className="bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-2 text-sm text-text-primary">
              {courseLabel ?? 'Locked — change requires delete + recreate'}
            </div>
            <p className="text-[10px] text-text-tertiary mt-2 leading-snug">
              A question cannot be moved across courses. Delete and recreate it if needed.
            </p>
          </div>
        )}

        <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary">
              Topic
            </h4>
            {programCourseId && !addingTopic && (
              <button
                type="button"
                onClick={() => {
                  setAddingTopic(true);
                  setTopicError(null);
                }}
                className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline uppercase tracking-wider"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            )}
          </div>

          {!programCourseId ? (
            <div className="bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-2 text-xs text-text-secondary">
              Pick a course first.
            </div>
          ) : (
            <>
              {topicsLoading ? (
                <div className="text-xs text-text-secondary">Loading topics…</div>
              ) : topics.length === 0 && !addingTopic ? (
                <div className="bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-2 text-xs text-text-secondary">
                  No topics yet. Use “New” above to add one.
                </div>
              ) : !addingTopic ? (
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
                >
                  <option value="" disabled hidden>
                    — pick —
                  </option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {addingTopic && (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        createTopic();
                      } else if (e.key === 'Escape') {
                        setAddingTopic(false);
                        setNewTopicName('');
                        setTopicError(null);
                      }
                    }}
                    placeholder="e.g. Batch reactor design"
                    className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={createTopic}
                      disabled={topicSaving || !newTopicName.trim()}
                      className="flex-1 bg-primary text-on-primary text-xs font-bold uppercase tracking-wider py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {topicSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                      Save Topic
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingTopic(false);
                        setNewTopicName('');
                        setTopicError(null);
                      }}
                      disabled={topicSaving}
                      className="text-xs font-bold text-text-secondary hover:text-text-primary uppercase tracking-wider px-2"
                    >
                      Cancel
                    </button>
                  </div>
                  {topicError && (
                    <div className="text-[10px] text-red-500 bg-red-500/10 border border-red-500/20 rounded px-2 py-1 break-words">
                      {topicError}
                    </div>
                  )}
                  <p className="text-[10px] text-text-tertiary leading-snug">
                    Saved to this course's topic list — AI ingestion will use it for matching.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4">
          <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary mb-3">
            Difficulty
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={cn(
                  'px-2 py-1.5 rounded-lg border text-xs font-bold uppercase transition-all',
                  difficulty === d
                    ? 'bg-bg-raised border-primary/30 text-primary'
                    : 'bg-bg-sunken border-border-subtle text-text-secondary hover:bg-bg-raised'
                )}
              >
                {d}
              </button>
            ))}
          </div>

          <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary mt-4 mb-3">
            Exam Scope
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {EXAM_SCOPES.map((s) => (
              <button
                key={s}
                onClick={() => setExamScope(s)}
                className={cn(
                  'px-2 py-1.5 rounded-lg border text-xs font-bold uppercase transition-all',
                  examScope === s
                    ? 'bg-bg-raised border-primary/30 text-primary'
                    : 'bg-bg-sunken border-border-subtle text-text-secondary hover:bg-bg-raised'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
