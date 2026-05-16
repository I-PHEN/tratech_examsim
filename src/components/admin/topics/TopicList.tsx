import { useState } from 'react';
import { Edit2, Trash2, Loader2, Save, X } from 'lucide-react';
import { apiDelete, apiPatch } from '../../../lib/apiClient';

export interface Topic {
  id: string;
  name: string;
  description: string | null;
}

interface Props {
  topics: Topic[];
  onChanged: () => void;
}

export function TopicList({ topics, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const startEdit = (t: Topic) => {
    setEditing(t.id);
    setName(t.name);
    setDescription(t.description ?? '');
  };

  const cancel = () => {
    setEditing(null);
    setName('');
    setDescription('');
  };

  const save = async (id: string) => {
    setBusy(id);
    try {
      await apiPatch(`/api/topics/${id}`, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      cancel();
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this topic? Questions tagged with it will lose their topic.')) return;
    setBusy(id);
    try {
      await apiDelete(`/api/topics/${id}`);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (topics.length === 0) {
    return (
      <div className="text-sm text-text-secondary py-8 text-center">
        No topics yet. Add one manually or suggest from a syllabus.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {topics.map((t) => {
        const isEditing = editing === t.id;
        const isBusy = busy === t.id;
        return (
          <div
            key={t.id}
            className="border border-border-subtle rounded-2xl p-4 bg-bg-surface"
          >
            {isEditing ? (
              <div className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary font-bold focus:border-primary focus:outline-none"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-bg-sunken border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={cancel}
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-2 py-1"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button
                    onClick={() => save(t.id)}
                    disabled={isBusy}
                    className="flex items-center gap-1 bg-primary text-on-primary text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-text-primary mb-1">{t.name}</h4>
                  {t.description ? (
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {t.description}
                    </p>
                  ) : (
                    <p className="text-xs text-text-tertiary italic">No description</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(t)}
                    className="text-text-secondary hover:text-text-primary p-1.5 rounded-lg hover:bg-bg-raised"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    disabled={isBusy}
                    className="text-red-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                    title="Delete"
                  >
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
