import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiPost, ApiError } from '../../../lib/apiClient';

interface CreatedDepartment {
  id: string;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export function AddDepartmentModal({ onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim() || !code.trim()) {
      setErr('Name and code are required');
      return;
    }
    const n = name.trim();
    const c = code.trim();
    setSaving(true);
    setErr(null);
    try {
      const dept = await apiPost<CreatedDepartment>('/api/departments', { name: n, code: c });
      // Every department has exactly one program; create it transparently so the
      // admin only fills this in once.
      try {
        await apiPost('/api/programs', { department_id: dept.id, name: n, code: c });
      } catch (pe) {
        setErr(
          `Department created, but setting up its program failed (${pe instanceof Error ? pe.message : String(pe)}). ` +
            `Re-open it and use “Set up program”.`,
        );
        onSaved();
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DUPLICATE') {
        setErr(`A department with code "${c}" already exists.`);
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-subtle rounded-3xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold uppercase tracking-widest text-sm text-text-primary">
            Add Department
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Creates the department and its program in one step.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chemical Engineering"
              className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">
              Code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. CHE"
              className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
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
