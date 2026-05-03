import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, ArrowLeft, Upload, FileText, Settings, Database, Activity, ChevronRight, Plus } from 'lucide-react';
import { cn } from './lib/utils';

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
    <div className="flex flex-col h-full items-center justify-center bg-bg-surface px-4">
      <div className="absolute top-8 left-8">
        <button onClick={onBack} className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-bold">Back</span>
        </button>
      </div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-surface-container-low p-8 rounded-3xl border border-border-subtle shadow-2xl"
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
      </motion.div>
    </div>
  );
}

export function AdminDashboardScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'upload' | 'manage'>('upload');
  
  return (
    <div className="flex flex-col h-full bg-surface-dim">
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

      <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
        <div className="w-full max-w-5xl">
          
          <div className="flex gap-4 mb-8">
            <button 
              onClick={() => setActiveTab('upload')}
              className={cn(
                "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all",
                activeTab === 'upload' ? "bg-bg-raised text-primary shadow-[0_0_20px_theme(colors.primary/0.1)] border border-primary/20" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised"
              )}
            >
              <Upload className="w-5 h-5" />
              Ingestion
            </button>
            <button 
              onClick={() => setActiveTab('manage')}
              className={cn(
                "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all",
                activeTab === 'manage' ? "bg-bg-raised text-primary shadow-[0_0_20px_theme(colors.primary/0.1)] border border-primary/20" : "bg-surface-container-low text-text-secondary hover:bg-bg-raised"
              )}
            >
              <FileText className="w-5 h-5" />
              Database
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Uploader Card */}
                  <div className="lg:col-span-2 bg-surface-container-low border border-border-subtle rounded-3xl p-8 flex flex-col items-center justify-center min-h-[400px] border-dashed">
                    <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
                      <Upload className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-bold text-text-primary mb-2">Upload Source Material</h3>
                    <p className="text-text-secondary text-center max-w-sm mb-8">
                      Upload past exam PDFs, presentation slides, or reference material. The AI agent will extract, tag, and structure the questions automatically.
                    </p>
                    <button className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold tracking-wide hover:bg-primary/90 transition-colors shadow-[0_0_30px_theme(colors.primary/0.2)]">
                      Select Files
                    </button>
                  </div>

                  {/* Settings / Config */}
                  <div className="space-y-6">
                    <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-6">
                      <div className="flex items-center gap-3 mb-4 text-text-primary">
                        <Settings className="w-5 h-5 text-primary" />
                        <h4 className="font-bold uppercase tracking-widest text-sm">Target Course</h4>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">Department</label>
                          <select className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none">
                            <option>Chemical Engineering</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">Year & Sem</label>
                          <div className="grid grid-cols-2 gap-2">
                            <select className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none">
                              <option>Year 3</option>
                            </select>
                            <select className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none">
                              <option>Sem 1</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-text-secondary font-bold mb-1.5 block uppercase tracking-wider">Course</label>
                          <select className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none">
                            <option>Chemical Reaction Kinetics</option>
                            <option>Heat Transfer</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface-container-low border border-border-subtle rounded-3xl p-6">
                       <div className="flex items-center gap-3 mb-4 text-text-primary">
                        <Activity className="w-5 h-5 text-tertiary" />
                        <h4 className="font-bold uppercase tracking-widest text-sm">Agent Status</h4>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-text-secondary">
                        <div className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                        <span>Ready for ingestion</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'manage' && (
              <motion.div
                key="manage"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-surface-container-low border border-border-subtle rounded-3xl p-8"
              >
                 <div className="flex items-center justify-center min-h-[300px] text-text-secondary flex-col gap-4">
                    <Database className="w-12 h-12 opacity-20" />
                    <p>Database management coming soon.</p>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>
    </div>
  );
}
