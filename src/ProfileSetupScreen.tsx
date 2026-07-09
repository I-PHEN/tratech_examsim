import React, { useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import { useAuth } from './lib/AuthContext';
import { Loader2, ArrowRight } from 'lucide-react';

export function ProfileSetupScreen() {
  const { currentUser, updateProfileLocal } = useAuth();
  const [preferredName, setPreferredName] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [semester, setSemester] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    setLoading(true);
    setError(null);

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(userRef);
      
      if (!docSnap.exists()) {
        await setDoc(userRef, {
          email: currentUser.email,
          createdAt: serverTimestamp(),
          preferredName,
          department,
          year,
          semester,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(userRef, {
          preferredName,
          department,
          year,
          semester,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      
      updateProfileLocal({
        department,
        year,
        semester,
        preferredName
      });
    } catch (err) {
      console.error(err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-surface flex items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-md bg-surface-container-low border border-border-subtle rounded-3xl p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-primary/5 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        
        <div className="relative z-10 space-y-8">
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center mx-auto mb-6">
               <span className="text-xl text-accent font-black">G</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-text-primary uppercase tracking-tight">
              One Last Step
            </h1>
            <p className="text-sm text-text-secondary tracking-wide">
              Customize your experience by telling us what you're studying.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-danger-muted border border-danger/20 text-danger text-xs font-bold text-center">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">Preferred Name</label>
              <input
                required
                type="text"
                placeholder="What should we call you?"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                className="w-full px-4 py-3 bg-bg-surface border border-border-subtle rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text-primary text-sm font-medium transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">Department</label>
              <select
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-3 bg-bg-surface border border-border-subtle rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text-primary text-sm font-medium transition-colors appearance-none cursor-pointer"
              >
                <option value="" disabled>Select Department</option>
                <option value="Chemical Engineering">Chemical Engineering</option>
                <option value="Petroleum Engineering">Petroleum Engineering</option>
                <option value="Mechanical Engineering">Mechanical Engineering</option>
                <option value="Electrical Engineering">Electrical Engineering</option>
                <option value="Civil Engineering">Civil Engineering</option>
              </select>
              {department && department !== "Chemical Engineering" && (
                <p className="text-xs text-amber-500 font-medium px-1 pt-1">
                  Note: We currently only have courses available for Chemical Engineering.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">Year</label>
                <select
                  required
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-4 py-3 bg-bg-surface border border-border-subtle rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text-primary text-sm font-medium transition-colors appearance-none cursor-pointer"
                >
                  <option value="" disabled>Select Year</option>
                  <option value="Year 1">Year 1</option>
                  <option value="Year 2">Year 2</option>
                  <option value="Year 3">Year 3</option>
                  <option value="Year 4">Year 4</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">Semester</label>
                <select
                  required
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full px-4 py-3 bg-bg-surface border border-border-subtle rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text-primary text-sm font-medium transition-colors appearance-none cursor-pointer"
                >
                  <option value="" disabled>Select Sem</option>
                  <option value="Sem 1">Semester 1</option>
                  <option value="Sem 2">Semester 2</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 mt-8 bg-primary text-slate-950 font-black rounded-xl hover:scale-[1.02] active:scale-95 transition-[transform,opacity,box-shadow] shadow-lg shadow-primary/20 hover:shadow-primary/40 uppercase tracking-widest text-xs disabled:opacity-50 disabled:pointer-events-none group"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Let's Go
              {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </button>
            
            <button
              type="button"
              onClick={() => {
                import('firebase/auth').then(({ signOut }) => {
                  import('./lib/firebase').then(({ auth }) => {
                    signOut(auth);
                  });
                });
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-transparent text-text-tertiary hover:text-text-primary font-bold rounded-xl transition-colors uppercase tracking-widest text-[10px]"
            >
              Sign out instead
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
