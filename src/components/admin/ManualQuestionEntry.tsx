import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, ListChecks, Calculator, Image as ImageIcon, X } from 'lucide-react';
import { apiGet, apiPost, apiUpload } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
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

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const EXAM_SCOPES: ExamScope[] = ['midsem', 'final', 'both'];

function emptyOption() {
  return { text: '', is_correct: false };
}

export function ManualQuestionEntry() {
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

  const [options, setOptions] = useState([emptyOption(), emptyOption()]);

  const [correctAnswer, setCorrectAnswer] = useState('');
  const [answerType, setAnswerType] = useState<AnswerType>('exact');
  const [answerTolerance, setAnswerTolerance] = useState('');
  const [unit, setUnit] = useState('');

  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('Save Question');
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    setTopicId('');
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
  }, [programCourseId]);

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
    setStatusText('Saving question…');

    try {
      const basePayload = {
        program_course_id: programCourseId,
        topic_id: topicId,
        difficulty,
        exam_scope: examScope,
      };

      const payload =
        type === 'mcq'
          ? {
              ...basePayload,
              type: 'mcq' as const,
              content: {
                prompt: prompt.trim(),
                explanation: explanation.trim() || undefined,
              },
              options: options.map((o) => ({ text: o.text.trim(), is_correct: o.is_correct })),
            }
          : {
              ...basePayload,
              type: 'calc' as const,
              answer_type: answerType,
              content: {
                prompt: prompt.trim(),
                explanation: explanation.trim() || undefined,
                correct_answer: correctAnswer.trim(),
                ...(answerTolerance ? { answer_tolerance: Number(answerTolerance) } : {}),
                ...(unit.trim() ? { unit: unit.trim() } : {}),
              },
            };

      const created = await apiPost<{ id: string }>('/api/questions', payload);

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
            `/api/questions/${created.id}/assets`,
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

      if (imageError) {
        setMsg({
          text: `Question saved (${uploadedRemoteIds.length}/${total} diagrams uploaded). Last error: ${imageError}. Remove or retry the failing diagram.`,
          type: 'err',
        });
      } else {
        setMsg({
          text:
            total > 0
              ? `Question published with ${total} diagram${total === 1 ? '' : 's'}.`
              : 'Question published.',
          type: 'ok',
        });
        resetForm();
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : String(err), type: 'err' });
    } finally {
      setSubmitting(false);
      setStatusText('Save Question');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-in fade-in duration-200">
      <div className="lg:col-span-2 bg-surface-container-low border border-border-subtle rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex gap-2">
          {(['mcq', 'calc'] as QType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all',
                type === t
                  ? 'bg-bg-raised text-primary border border-primary/20'
                  : 'bg-surface-container-low text-text-secondary border border-border-subtle hover:bg-bg-raised'
              )}
            >
              {t === 'mcq' ? <ListChecks className="w-3.5 h-3.5" /> : <Calculator className="w-3.5 h-3.5" />}
              {t === 'mcq' ? 'Multiple Choice' : 'Calculation'}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
            Question Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type the full question text here. For multi-part questions, create one entry per sub-part."
            className="w-full min-h-[120px] bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none resize-y"
          />
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
          <label className="text-[10px] text-text-secondary font-bold mb-1 block uppercase tracking-wider">
            Explanation (optional)
          </label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Worked solution or hint shown after the student answers."
            className="w-full min-h-[70px] bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none resize-y"
          />
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
          {pendingImages.length === 0 ? (
            <div className="bg-bg-sunken border border-dashed border-border-subtle rounded-xl px-4 py-6 text-center text-xs text-text-secondary flex flex-col items-center gap-1.5">
              <ImageIcon className="w-5 h-5" />
              No diagrams attached. Use “Add image” for figures students need to see.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
        <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4">
          <h4 className="font-bold uppercase tracking-widest text-xs text-text-primary mb-3">
            Target Course
          </h4>
          <CourseSelect value={programCourseId} onChange={setProgramCourseId} compact />
        </div>

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
