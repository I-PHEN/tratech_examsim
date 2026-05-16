import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiPost } from '../../../lib/apiClient';

interface Props {
  programCourseId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTopicModal({ programCourseId, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiPost('/api/topics', {
        program_course_id: programCourseId,
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-subtle rounded-3xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold uppercase tracking-widest text-sm text-text-primary">
            Add Topic
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rate Laws"
              className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">
              Description (optional, used for AI matching)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="e.g. Order of reaction, integrated rate laws, half-life, rate constant determination, Arrhenius equation"
              className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none resize-none"
            />
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
