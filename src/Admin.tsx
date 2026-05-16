import React, { useState } from 'react';
import { ShieldAlert, ArrowLeft, Upload, FileText, Database, Users, Loader2, Search, Plus, Pencil } from 'lucide-react';
import { cn } from './lib/utils';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from './lib/firebase';
import { useAuth } from './lib/AuthContext';
import { IngestionUpload } from './components/admin/IngestionUpload';
import { IngestionJobList } from './components/admin/IngestionJobList';
import { DraftReviewTable } from './components/admin/DraftReviewTable';
import { ManualQuestionEntry } from './components/admin/ManualQuestionEntry';
import { TopicManager } from './components/admin/topics/TopicManager';

export function AdminLoginScreen({ onSuccess, onBack }: { onSuccess: () => void, onBack: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Special access password hardcoded for now
    if (passcode === 'STOIC2026') {
      onSuccess();
    } else {
      setError(true);
      setPasscode('');
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-surface px-4 z-50">
      <div className="absolute top-8 left-8">
        <button onClick={onBack} className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-bold">Back</span>
        </button>
      </div>
      
      <div 
        className="max-w-md w-full bg-surface-container-low p-8 rounded-3xl border border-border-subtle shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
        </div>
        
        <h2 className="text-2xl font-black text-center text-text-primary uppercase tracking-widest mb-2">Restricted Area</h2>
        <p className="text-center text-text-secondary text-sm mb-8">
          Authorized personnel only. Entering the Question Engine core.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input 
              type="password"
              placeholder="Enter passcode"
              value={passcode}
              onChange={(e) => { setPasscode(e.target.value); setError(false); }}
              className={cn(
                "w-full bg-bg-sunken border rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.5em] focus:outline-none transition-colors",
                error ? "border-red-500 text-red-500 placeholder:text-red-500/30" : "border-border-subtle text-text-primary focus:border-primary"
              )}
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:bg-primary-hover active:scale-[0.98] transition-all"
          >
            Authenticate
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminManager() {
  const [emailToSearch, setEmailToSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const { currentUser } = useAuth();

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailToSearch.trim()) return;
    setLoading(true);
    setMsg({ text: '', type: '' });

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', emailToSearch.trim()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setMsg({ text: 'User not found.', type: 'error' });
      } else {
        const userId = snap.docs[0].id;
        try {
          await setDoc(doc(db, 'admins', userId), {
            addedBy: currentUser?.uid || 'unknown',
            addedAt: serverTimestamp()
          });
          setMsg({ text: 'User promoted to Admin successfully!', type: 'success' });
          setEmailToSearch('');
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'admins');
          setMsg({ text: 'Failed to add admin.', type: 'error' });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'users');
      setMsg({ text: 'Failed to search user.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in max-w-lg mx-auto w-full bg-surface-container-low border border-border-subtle rounded-3xl p-8 shadow-xl mt-6">
      <h2 className="text-xl font-bold text-text-primary mb-2 flex items-center gap-3">
        <Users className="text-primary w-6 h-6" /> Add New Admin
      </h2>
      <p className="text-text-secondary text-sm mb-6">
        Search for a user by their registered email address to grant them system admin access. This grants full privileges!
      </p>

      <form onSubmit={handleAddAdmin} className="space-y-4">
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
                value={emailToSearch}
                onChange={(e) => setEmailToSearch(e.target.value)}
                placeholder="colleague@university.edu"
                className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-primary pl-10 transition-colors"
                required
             />
             <Search className="w-4 h-4 text-text-secondary absolute left-4 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <button 
          disabled={loading}
          type="submit"
          className="w-full bg-primary text-slate-950 font-bold py-3 rounded-xl hover:shadow-[0_0_20px_theme(colors.primary/0.4)] flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          {loading ? 'Searching...' : 'Grant Admin Access'}
        </button>
      </form>
    </div>
  );
}

function IngestionTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  if (selectedJobId) {
    return (
      <DraftReviewTable
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
  const [activeTab, setActiveTab] = useState<'upload' | 'manual' | 'manage' | 'admins'>('upload');
  
  return (
    <div className="absolute inset-0 flex flex-col bg-surface-dim z-50 overflow-hidden">
      <header className="h-20 flex items-center justify-between px-8 bg-surface-container-low/50 backdrop-blur-md sticky top-0 z-40 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="p-2 hover:bg-bg-raised/50 rounded-lg text-text-secondary hover:text-text-primary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg font-black text-text-primary uppercase tracking-widest">Question Engine</h1>
              <p className="text-[10px] text-text-tertiary uppercase tracking-widest font-bold">Admin Console</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto flex flex-col items-center">
        <div className="w-full max-w-5xl px-8 pb-8">

          <div className="sticky top-0 z-30 -mx-8 px-8 pt-6 pb-4 bg-surface-dim/95 backdrop-blur-sm">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTab('upload')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
                  activeTab === 'upload' ? "bg-bg-raised text-primary shadow-[0_0_20px_theme(colors.primary/0.1)] border border-primary/20" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised"
                )}
              >
                <Upload className="w-4 h-4" />
                Ingestion
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
                  activeTab === 'manual' ? "bg-bg-raised text-primary shadow-[0_0_20px_theme(colors.primary/0.1)] border border-primary/20" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised"
                )}
              >
                <Pencil className="w-4 h-4" />
                Manual Entry
              </button>
              <button
                onClick={() => setActiveTab('manage')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
                  activeTab === 'manage' ? "bg-bg-raised text-primary shadow-[0_0_20px_theme(colors.primary/0.1)] border border-primary/20" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised"
                )}
              >
                <FileText className="w-4 h-4" />
                Database
              </button>
              <button
                onClick={() => setActiveTab('admins')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
                  activeTab === 'admins' ? "bg-bg-raised text-primary shadow-[0_0_20px_theme(colors.primary/0.1)] border border-primary/20" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised"
                )}
              >
                <Users className="w-4 h-4" />
                Manage Admins
              </button>
            </div>
          </div>

          <div className="pt-2">
            {activeTab === 'admins' && <AdminManager />}
            {activeTab === 'upload' && <IngestionTab />}
            {activeTab === 'manual' && <ManualQuestionEntry />}
            {activeTab === 'manage' && <TopicManager />}
          </div>
        </div>
      </main>
    </div>
  );
}
