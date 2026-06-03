import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, FileText, Users, Loader2, Search, Plus, Trash2, Pencil, BarChart3, Library as LibraryIcon } from 'lucide-react';
import { cn } from './lib/utils';
import { apiGet, apiPost, apiDelete, ApiError } from './lib/apiClient';
import { useAuth } from './lib/AuthContext';
import { IngestionUpload } from './components/admin/IngestionUpload';
import { IngestionJobList } from './components/admin/IngestionJobList';
import { IngestionWizard } from './components/admin/IngestionWizard';
import { ManualQuestionEntry } from './components/admin/ManualQuestionEntry';
import { QuestionLibrary } from './components/admin/QuestionLibrary';
import { CurriculumManager } from './components/admin/curriculum/CurriculumManager';
import { UserAnalytics } from './components/admin/UserAnalytics';
import { usePersistentState } from './lib/usePersistentState';
import 'katex/dist/katex.min.css';

type AdminEntry = { uid: string; email: string | null; role: 'owner' | 'editor'; addedAt: string | null };

function AdminManager() {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [email, setEmail] = useState('');
  const [grantRole, setGrantRole] = useState<'editor' | 'owner'>('editor');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const load = async () => {
    setLoadingList(true);
    try {
      const data = await apiGet<{ admins: AdminEntry[] }>('/api/admins');
      setAdmins(data.admins);
    } catch (err) {
      setMsg({ text: err instanceof ApiError ? err.message : 'Failed to load admins.', type: 'error' });
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setMsg({ text: '', type: '' });
    try {
      await apiPost('/api/admins', { email: email.trim(), role: grantRole });
      setMsg({ text: 'Access granted.', type: 'success' });
      setEmail('');
      setGrantRole('editor');
      await load();
    } catch (err) {
      setMsg({ text: err instanceof ApiError ? err.message : 'Failed to grant access.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (entry: AdminEntry) => {
    if (!confirm(`Revoke admin access for ${entry.email ?? entry.uid}?`)) return;
    setMsg({ text: '', type: '' });
    try {
      await apiDelete(`/api/admins/${entry.uid}`);
      await load();
    } catch (err) {
      setMsg({ text: err instanceof ApiError ? err.message : 'Failed to revoke access.', type: 'error' });
    }
  };

  return (
    <div className="animate-in fade-in max-w-2xl mx-auto w-full mt-6 space-y-6">
      <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-8 shadow-xl">
        <h2 className="text-xl font-bold text-text-primary mb-2 flex items-center gap-3">
          <Users className="text-primary w-6 h-6" /> Grant Access
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Grant access by registered email. <strong>Editors</strong> can author and edit content;
          <strong> Owners</strong> can also delete curriculum/questions, manage admins, and view analytics.
        </p>

        <form onSubmit={handleGrant} className="space-y-4">
          {msg.text && (
            <div className={cn(
              "p-3 rounded-lg text-xs font-bold text-center border",
              msg.type === 'error' ? "bg-danger-muted border-danger/20 text-danger" : "bg-success/10 border-success/30 text-success-text"
            )}>
              {msg.text}
            </div>
          )}
          <div className="relative">
            <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-1">User Email</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@university.edu"
                className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-primary pl-10 transition-colors"
                required
              />
              <Search className="w-4 h-4 text-text-secondary absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-1">Role</label>
            <select
              value={grantRole}
              onChange={(e) => setGrantRole(e.target.value as 'editor' | 'owner')}
              className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
            >
              <option value="editor">Editor — author &amp; edit content</option>
              <option value="owner">Owner — full access</option>
            </select>
          </div>

          <button
            disabled={submitting}
            type="submit"
            className="w-full bg-primary text-slate-950 font-bold py-3 rounded-xl hover:shadow-[0_0_20px_theme(colors.primary/0.4)] flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-sm disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {submitting ? 'Granting…' : 'Grant Access'}
          </button>
        </form>
      </div>

      <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-8 shadow-xl">
        <h3 className="text-sm font-black text-text-primary uppercase tracking-widest mb-4">Current Admins</h3>
        {loadingList ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-text-secondary" /></div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-text-secondary">No granted admins yet. Bootstrap owners are configured in the server env.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {admins.map((a) => (
              <li key={a.uid} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{a.email ?? a.uid}</p>
                  {!a.email && <p className="text-[10px] text-text-tertiary">account deleted · {a.uid}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                    a.role === 'owner'
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-surface-container border-border-subtle text-text-secondary"
                  )}>
                    {a.role}
                  </span>
                  <button
                    onClick={() => handleRevoke(a)}
                    title="Revoke access"
                    className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IngestionTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  if (selectedJobId) {
    return (
      <IngestionWizard
        jobId={selectedJobId}
        onBack={() => {
          setSelectedJobId(null);
          setRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <IngestionUpload onCreated={() => setRefreshKey((k) => k + 1)} />
      <IngestionJobList refreshKey={refreshKey} onSelect={setSelectedJobId} />
    </div>
  );
}

export function AdminDashboardScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = usePersistentState<'upload' | 'manual' | 'library' | 'manage' | 'admins' | 'users'>('admin.activeTab', 'upload');
  const { isOwner } = useAuth();

  return (
    <div className="absolute inset-0 flex flex-col bg-surface-dim z-50 overflow-hidden">
      <header className="h-14 flex items-center gap-3 px-6 bg-surface-container-low/50 backdrop-blur-md sticky top-0 z-40 border-b border-border-subtle shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-bg-raised/50 rounded-lg text-text-secondary hover:text-text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-black text-text-primary uppercase tracking-widest">Question Engine</h1>
      </header>

      <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable] flex flex-col items-center">
        <div className="w-full max-w-5xl px-8 pb-8">

          <div className="sticky top-0 z-30 -mx-8 px-8 pt-6 pb-4 bg-surface-dim/95 backdrop-blur-sm">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTab('upload')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-transparent transition-colors",
                  activeTab === 'upload' ? "bg-bg-raised text-primary border-primary/30" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                )}
              >
                <Upload className="w-4 h-4" />
                Ingestion
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-transparent transition-colors",
                  activeTab === 'manual' ? "bg-bg-raised text-primary border-primary/30" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                )}
              >
                <Pencil className="w-4 h-4" />
                Manual Entry
              </button>
              <button
                onClick={() => setActiveTab('library')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-transparent transition-colors",
                  activeTab === 'library' ? "bg-bg-raised text-primary border-primary/30" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                )}
              >
                <LibraryIcon className="w-4 h-4" />
                Library
              </button>
              <button
                onClick={() => setActiveTab('manage')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-transparent transition-colors",
                  activeTab === 'manage' ? "bg-bg-raised text-primary border-primary/30" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                )}
              >
                <FileText className="w-4 h-4" />
                Database
              </button>
              {isOwner && (
                <button
                  onClick={() => setActiveTab('admins')}
                  className={cn(
                    "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-transparent transition-colors",
                    activeTab === 'admins' ? "bg-bg-raised text-primary border-primary/30" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                  )}
                >
                  <Users className="w-4 h-4" />
                  Manage Admins
                </button>
              )}
              {isOwner && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={cn(
                    "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-transparent transition-colors",
                    activeTab === 'users' ? "bg-bg-raised text-primary border-primary/30" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                  )}
                >
                  <BarChart3 className="w-4 h-4" />
                  Users
                </button>
              )}
            </div>
          </div>

          <div className="pt-2">
            {activeTab === 'admins' && isOwner && <AdminManager />}
            {activeTab === 'users' && isOwner && <UserAnalytics />}
            {activeTab === 'upload' && <IngestionTab />}
            {activeTab === 'manual' && <ManualQuestionEntry />}
            {activeTab === 'library' && <QuestionLibrary />}
            {activeTab === 'manage' && <CurriculumManager />}
          </div>
        </div>
      </main>
    </div>
  );
}
