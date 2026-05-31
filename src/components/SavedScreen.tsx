import { useEffect, useState } from 'react';
import { Loader2, Bookmark, Play } from 'lucide-react';
import { apiGet } from '../lib/apiClient';
import { RichText } from './ui/RichText';

interface SavedQuestion {
  id: string;
  topic_id: string;
  topic_name: string | null;
  type: 'mcq' | 'calc';
  prompt: string;
  explanation: string | null;
}

export function SavedScreen({
  programCourseId,
  onQuiz,
}: {
  programCourseId: string;
  onQuiz: (questionIds: string[]) => void;
}) {
  const [items, setItems] = useState<SavedQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!programCourseId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    apiGet<SavedQuestion[]>(`/api/bookmarks?program_course_id=${programCourseId}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [programCourseId]);

  if (loading) {
    return <div className="flex justify-center py-12 text-text-secondary"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary flex flex-col items-center gap-2">
        <Bookmark className="w-6 h-6" />
        No saved questions yet. Star a question from any review to save it here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-text-primary">Saved questions</h2>
        <button
          onClick={() => onQuiz(items.map((i) => i.id))}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-bg-page text-[11px] font-black uppercase tracking-widest hover:bg-accent-hover"
        >
          <Play className="w-4 h-4" /> Quiz me ({items.length})
        </button>
      </div>
      <div className="space-y-3">
        {items.map((q) => (
          <div key={q.id} className="bg-bg-surface border border-border-subtle rounded-2xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">
              {q.topic_name ?? 'Untitled topic'} · {q.type === 'mcq' ? 'MCQ' : 'Calc'}
            </div>
            <RichText className="text-sm text-text-primary">{q.prompt}</RichText>
            {q.explanation && (
              <details className="mt-2">
                <summary className="text-[11px] font-bold uppercase tracking-wider text-accent-text cursor-pointer">Explanation</summary>
                <RichText className="text-sm text-text-secondary mt-1">{q.explanation}</RichText>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
