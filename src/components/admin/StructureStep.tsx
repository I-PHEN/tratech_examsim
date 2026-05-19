import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Scissors,
  Hash,
  Wand2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowUpToLine,
  Eye,
  EyeOff,
  Sparkles,
  Send,
  Maximize2,
  Minimize2,
  SplitSquareVertical,
  TextCursorInput,
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../../lib/apiClient';
import { RichText } from '../ui/RichText';
import { splitByMarker, splitByQuestionNumber } from '../../lib/splitQuestions';

interface Job {
  id: string;
  program_course_id: string | null;
  reviewed_text: string | null;
  transcripts: { page_number: number; text: string }[] | null;
}

interface Topic {
  id: string;
  name: string;
}

interface GlobalFill {
  topic_id?: string;
  exam_scope?: 'midsem' | 'final' | 'both';
  difficulty?: 'easy' | 'medium' | 'hard';
  source_reference?: string;
}

export function StructureStep({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [segments, setSegments] = useState<string[] | null>(null);
  const [previews, setPreviews] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [topics, setTopics] = useState<Topic[]>([]);
  const [global, setGlobal] = useState<GlobalFill>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [fmtBusy, setFmtBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const taRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  const load = useCallback(async () => {
    try {
      const { job } = await apiGet<{ job: Job }>(`/api/ingestion/jobs/${jobId}`);
      setText(
        job.reviewed_text && job.reviewed_text.trim().length > 0
          ? job.reviewed_text
          : (job.transcripts ?? []).map((t) => t.text).join('\n\n')
      );
      if (job.program_course_id) {
        const ts = await apiGet<Topic[]>(
          `/api/topics?program_course_id=${job.program_course_id}`
        );
        setTopics(ts);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const applySegments = (parts: string[]) =>
    setSegments(parts.length > 0 ? parts : [text.trim()]);

  const aiSuggest = async () => {
    setBusy('suggest');
    setErr(null);
    try {
      await apiPatch(`/api/ingestion/jobs/${jobId}/text`, { reviewed_text: text });
      const { segments: s } = await apiPost<{ segments: string[] }>(
        `/api/ingestion/jobs/${jobId}/suggest-boundaries`,
        {}
      );
      applySegments(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const setSeg = (i: number, value: string) =>
    setSegments((prev) => prev!.map((s, idx) => (idx === i ? value : s)));

  const removeSeg = (i: number) =>
    setSegments((prev) => prev!.filter((_, idx) => idx !== i));

  const moveSeg = (i: number, dir: -1 | 1) =>
    setSegments((prev) => {
      const next = [...prev!];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const mergeUp = (i: number) =>
    setSegments((prev) => {
      if (i === 0) return prev;
      const next = [...prev!];
      next[i - 1] = `${next[i - 1]}\n\n${next[i]}`;
      next.splice(i, 1);
      return next;
    });

  // True manual split: cut segment i in two at the textarea caret.
  const splitAtCursor = (i: number) => {
    const ta = taRefs.current.get(i);
    if (!ta) return;
    const pos = ta.selectionStart;
    setSegments((prev) => {
      const next = [...prev!];
      const full = next[i];
      const before = full.slice(0, pos).trim();
      const after = full.slice(pos).trim();
      if (!before || !after) return next; // caret at an edge — nothing to split
      next.splice(i, 1, before, after);
      return next;
    });
  };

  const toggleIn = (
    set: Set<number>,
    setter: (s: Set<number>) => void,
    i: number
  ) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setter(next);
  };

  const formatSeg = async (i: number) => {
    setFmtBusy(i);
    setErr(null);
    try {
      const { formatted } = await apiPost<{ formatted: string }>(`/api/ingestion/format`, {
        text: segments![i],
      });
      setSeg(i, formatted);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFmtBusy(null);
    }
  };

  const cleanGlobal = (): GlobalFill => {
    const g: GlobalFill = {};
    if (global.topic_id) g.topic_id = global.topic_id;
    if (global.exam_scope) g.exam_scope = global.exam_scope;
    if (global.difficulty) g.difficulty = global.difficulty;
    if (global.source_reference?.trim())
      g.source_reference = global.source_reference.trim();
    return g;
  };

  const classifyWithAi = async () => {
    setBusy('classify');
    setErr(null);
    try {
      // Classify each segment INDIVIDUALLY — the split the admin made is kept
      // exactly (one draft per question); AI only enriches each block.
      await apiPost(`/api/ingestion/jobs/${jobId}/classify-segments`, {
        segments: segments!.map((s) => s.trim()).filter((s) => s.length > 0),
        global: cleanGlobal(),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const classifyManually = async () => {
    setBusy('manual');
    setErr(null);
    try {
      await apiPost(`/api/ingestion/jobs/${jobId}/segments`, {
        segments: segments!.map((s) => s.trim()).filter((s) => s.length > 0),
        global: cleanGlobal(),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const body = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="font-bold uppercase tracking-widest text-sm text-text-primary">
          {segments === null
            ? 'Structure into individual questions'
            : `${segments.length} question${segments.length === 1 ? '' : 's'}`}
        </h4>
        <button
          onClick={() => setFullscreen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border-subtle rounded-lg px-2.5 py-1.5"
          title={fullscreen ? 'Exit fullscreen' : 'Maximize editor'}
        >
          {fullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
          {fullscreen ? 'Exit' : 'Maximize'}
        </button>
      </div>

      {err && (
        <div className="px-3 py-2 rounded-lg text-xs bg-red-500/10 text-red-500 border border-red-500/30">
          {err}
        </div>
      )}

      {segments === null ? (
        <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-6">
          <p className="text-[11px] text-text-secondary mb-3">
            <strong>Edit manually</strong> loads everything as one block so you can cut it
            yourself (place the cursor and hit <em>Split here</em>).{' '}
            <strong>Auto-split by Q#</strong> cuts on numbered headers (Q1, 1., (2)…) and
            never drops text. Or insert a line of <code className="font-mono">---</code>{' '}
            between questions, or let AI find boundaries. Everything stays editable
            afterwards.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`w-full bg-bg-sunken border border-border-subtle rounded-xl p-4 text-sm text-text-primary font-mono leading-relaxed focus:border-primary focus:outline-none resize-y ${
              fullscreen ? 'min-h-[60vh]' : 'min-h-[340px]'
            }`}
          />
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={() => applySegments([text.trim()])}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
            >
              <TextCursorInput className="w-4 h-4" /> Edit manually
            </button>
            <button
              onClick={() => applySegments(splitByQuestionNumber(text))}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 bg-bg-raised border border-border-subtle text-text-primary px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-bg-sunken"
            >
              <Hash className="w-4 h-4" /> Auto-split by Q#
            </button>
            <button
              onClick={() => applySegments(splitByMarker(text))}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 bg-bg-raised border border-border-subtle text-text-primary px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-bg-sunken"
            >
              <Scissors className="w-4 h-4" /> Split by ---
            </button>
            <button
              onClick={aiSuggest}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 bg-bg-raised border border-border-subtle text-text-primary px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-bg-sunken"
            >
              {busy === 'suggest' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              AI suggest boundaries
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setSegments(null)}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              ← Re-split
            </button>
            <button
              onClick={() =>
                setCollapsed(new Set(segments.map((_, i) => i)))
              }
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              Collapse all
            </button>
            <button
              onClick={() => setCollapsed(new Set())}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              Expand all
            </button>
          </div>

          {/* Global fill — applied to every segment, overridable per question later */}
          <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs col-span-2 md:col-span-1">
              <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
                Topic (all)
              </span>
              <select
                value={global.topic_id ?? ''}
                onChange={(e) =>
                  setGlobal((g) => ({ ...g, topic_id: e.target.value || undefined }))
                }
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
              >
                <option value="">—</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
                Exam scope (all)
              </span>
              <select
                value={global.exam_scope ?? ''}
                onChange={(e) =>
                  setGlobal((g) => ({
                    ...g,
                    exam_scope: (e.target.value || undefined) as GlobalFill['exam_scope'],
                  }))
                }
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
              >
                <option value="">—</option>
                <option value="midsem">Midsem</option>
                <option value="final">Final</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
                Difficulty (all)
              </span>
              <select
                value={global.difficulty ?? ''}
                onChange={(e) =>
                  setGlobal((g) => ({
                    ...g,
                    difficulty: (e.target.value || undefined) as GlobalFill['difficulty'],
                  }))
                }
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
              >
                <option value="">—</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label className="text-xs col-span-2 md:col-span-1">
              <span className="text-text-secondary font-bold uppercase tracking-wider block mb-1">
                Source (all)
              </span>
              <input
                value={global.source_reference ?? ''}
                onChange={(e) =>
                  setGlobal((g) => ({ ...g, source_reference: e.target.value }))
                }
                placeholder="e.g. 2021 Final Exam"
                className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-text-primary"
              />
            </label>
          </div>

          <div className="space-y-3">
            {segments.map((seg, i) => {
              const isCollapsed = collapsed.has(i);
              return (
                <div
                  key={i}
                  className="border border-border-subtle rounded-2xl p-4 bg-bg-surface space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleIn(collapsed, setCollapsed, i)}
                      className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-text-secondary hover:text-text-primary"
                    >
                      {isCollapsed ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronUp className="w-3.5 h-3.5" />
                      )}
                      Q{i + 1}
                      <span className="font-normal normal-case tracking-normal text-text-tertiary">
                        · {seg.trim().length} chars
                      </span>
                    </button>
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <button
                        onClick={() => formatSeg(i)}
                        disabled={fmtBusy !== null}
                        title="AI clean-up formatting (Markdown + LaTeX)"
                        className="flex items-center gap-1 text-xs hover:text-primary disabled:opacity-50"
                      >
                        {fmtBusy === i ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Format
                      </button>
                      <button
                        onClick={() => toggleIn(previews, setPreviews, i)}
                        title="Toggle rendered preview"
                        className="p-1 hover:text-text-primary"
                      >
                        {previews.has(i) ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => moveSeg(i, -1)}
                        disabled={i === 0}
                        className="p-1 hover:text-text-primary disabled:opacity-30"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveSeg(i, 1)}
                        disabled={i === segments.length - 1}
                        className="p-1 hover:text-text-primary disabled:opacity-30"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => splitAtCursor(i)}
                        disabled={isCollapsed || previews.has(i)}
                        title="Split this question in two at the text cursor"
                        className="flex items-center gap-1 text-xs hover:text-primary disabled:opacity-30"
                      >
                        <SplitSquareVertical className="w-3.5 h-3.5" />
                        Split here
                      </button>
                      <button
                        onClick={() => mergeUp(i)}
                        disabled={i === 0}
                        title="Merge into previous question"
                        className="p-1 hover:text-text-primary disabled:opacity-30"
                      >
                        <ArrowUpToLine className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeSeg(i)}
                        className="p-1 text-red-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {isCollapsed ? (
                    <p className="text-xs text-text-tertiary truncate">
                      {seg.trim().slice(0, 140) || '(empty)'}
                    </p>
                  ) : previews.has(i) ? (
                    <div className="bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary min-h-[100px]">
                      <RichText>{seg}</RichText>
                    </div>
                  ) : (
                    <textarea
                      ref={(el) => {
                        if (el) taRefs.current.set(i, el);
                        else taRefs.current.delete(i);
                      }}
                      value={seg}
                      onChange={(e) => setSeg(i, e.target.value)}
                      className={`w-full bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary font-mono leading-relaxed focus:border-primary focus:outline-none resize-y ${
                        fullscreen ? 'min-h-[220px]' : 'min-h-[150px]'
                      }`}
                    />
                  )}
                </div>
              );
            })}
            <button
              onClick={() => setSegments((prev) => [...prev!, ''])}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add a question
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle">
            <button
              onClick={classifyManually}
              disabled={busy !== null || segments.length === 0}
              className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
            >
              {busy === 'manual' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              I'll classify manually
            </button>
            <button
              onClick={classifyWithAi}
              disabled={busy !== null || segments.length === 0}
              className="inline-flex items-center gap-2 bg-bg-raised border border-border-subtle text-text-primary px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-bg-sunken"
            >
              {busy === 'classify' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              Let AI classify these
            </button>
            <p className="text-[11px] text-text-secondary basis-full">
              Manual keeps your split as-is (type defaults to Calc, fix per question in the
              next step). AI re-reads each block to detect MCQ options, answers, and topics.
            </p>
          </div>
        </>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-surface overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">{body}</div>
      </div>
    );
  }
  return body;
}
