import React, { useState } from 'react';
import { ArrowLeft, Clock, Search, History, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { StudyMode } from '../types';

export const MOCK_HISTORY = [
  ...Array.from({ length: 45 }).map((_, i) => {
     const modes = ['PRACTICE', 'DIAGNOSTIC', 'MIDSEM', 'FULL_EXAM'];
     const courses = ['Advanced Mathematics', 'Physics Mechanics', 'Chemistry 101', 'Basic Mechanics', 'Algorithm Design', 'Thermodynamics'];
     const topics = ['Calculus', 'Vectors & Kinematics', 'Atomic Structure', 'Statics', 'Dynamic Programming', 'Heat Transfer'];
     
     const m = modes[i % modes.length];
     const total = m === 'FULL_EXAM' ? 100 : m === 'MIDSEM' ? 30 : m === 'DIAGNOSTIC' ? 20 : 15;
     const score = Math.floor(Math.random() * total);
     
     return {
        id: `sess-${i + 1}`,
        course: courses[i % courses.length],
        topic: topics[i % topics.length],
        mode: m,
        score,
        total,
        timeTaken: `${Math.floor(Math.random() * 2) + 1}h ${Math.floor(Math.random() * 60)}m`,
        date: `Oct ${24 - Math.floor(i / 3)}, 2023`,
        accuracy: (score / total) * 100,
        status: 'completed'
     };
  })
];

export function MySessionsScreen({ onBack, onReview }: { onBack: () => void, onReview: (id: string) => void }) {
  const [filterMode, setFilterMode] = useState<StudyMode | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  React.useEffect(() => {
     setCurrentPage(1);
  }, [filterMode, searchQuery]);

  const filteredHistory = MOCK_HISTORY.filter(session => {
     if (filterMode !== 'ALL' && session.mode !== filterMode) return false;
     if (searchQuery && !session.course.toLowerCase().includes(searchQuery.toLowerCase()) && !session.topic.toLowerCase().includes(searchQuery.toLowerCase())) return false;
     return true;
  });

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex-1 w-full flex justify-center py-6 md:py-12 px-4 h-full overflow-y-auto">
      <div className="w-full max-w-4xl space-y-8 animate-fade-in pb-12">
        <header className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <button 
              onClick={onBack}
              className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors hover:-translate-x-1 duration-200"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-bold text-sm">Back</span>
            </button>
            <div className="bg-bg-raised px-4 py-1.5 rounded-full border border-border-subtle flex items-center gap-2 shadow-sm">
                <History className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Session History</span>
            </div>
          </div>

          <div>
             <h1 className="text-[32px] md:text-[40px] leading-tight font-black font-sans text-text-primary mb-2 tracking-tight">
                My Sessions
             </h1>
             <p className="text-text-secondary text-base">Review your past performance, analyze mistakes, and track your growth over time.</p>
          </div>
        </header>

        <div className="flex flex-col md:flex-row gap-4 bg-surface-container-low p-2 rounded-2xl border border-border-subtle shadow-sm">
           <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input 
                 type="text" 
                 placeholder="Search by course or topic..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full bg-bg-sunken border border-border-subtle rounded-xl py-3 pl-12 pr-4 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-colors"
              />
           </div>
           <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide shrink-0 items-center px-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-tertiary mr-2 shrink-0">Filter by</span>
              {['ALL', 'PRACTICE', 'DIAGNOSTIC', 'MIDSEM', 'FULL_EXAM'].map(mode => (
                  <button 
                    key={mode}
                    onClick={() => setFilterMode(mode as any)}
                    className={cn(
                       "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
                       filterMode === mode 
                          ? "bg-text-primary text-bg-page border-text-primary shadow-md" 
                          : "bg-bg-page text-text-secondary border-border-subtle hover:bg-bg-raised hover:text-text-primary hover:border-border-medium"
                    )}
                  >
                     {mode.replace('_', ' ')}
                  </button>
              ))}
           </div>
        </div>

        <div className="space-y-4">
           {paginatedHistory.length > 0 ? paginatedHistory.map((session) => (
              <div 
                 key={session.id} 
                 onClick={() => onReview(session.id)}
                 className="group p-6 rounded-3xl bg-surface-container-high border border-outline-variant/20 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-[border-color,box-shadow,transform] duration-300 flex flex-col md:flex-row md:items-center gap-6 cursor-pointer"
              >
                 <div className="flex items-center gap-6 flex-1">
                    <div className="w-16 h-16 rounded-2xl bg-bg-sunken flex items-center justify-center shrink-0 border border-border-subtle relative transition-transform">
                        <svg className="absolute inset-0 w-full h-full overflow-visible -rotate-90" viewBox="0 0 64 64">
                           <circle cx="32" cy="32" r="28" fill="transparent" stroke="var(--border-subtle)" strokeWidth="4" />
                           <circle cx="32" cy="32" r="28" fill="transparent" stroke={session.accuracy >= 50 ? "var(--success-text)" : "var(--danger-text)"} strokeWidth="4" strokeDasharray={`${(session.accuracy / 100) * 175.9} 175.9`} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                        </svg>
                        <span className="text-sm font-black text-text-primary absolute tracking-tighter ml-0.5">{Math.round(session.accuracy)}%</span>
                    </div>

                    <div className="flex-1 space-y-1.5">
                       <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black px-2 py-0.5 bg-bg-raised border border-border-medium text-text-secondary uppercase tracking-widest rounded-md">
                             {session.mode.replace('_', ' ')}
                          </span>
                       </div>
                       <h3 className="font-bold text-lg text-text-primary flex items-center gap-2">
                           {session.course}
                       </h3>
                       <p className="text-sm text-text-secondary line-clamp-1">{session.topic}</p>
                    </div>
                 </div>

                 <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-border-subtle pt-4 md:pt-0 md:pl-6">
                    <div className="flex flex-col gap-1 items-start md:items-end w-24">
                        <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Time</span>
                        <span className="text-sm font-bold text-text-primary">{session.timeTaken}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-start md:items-end w-24">
                        <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Score</span>
                        <span className="text-sm font-bold text-text-primary">{session.score} / {session.total}</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-bg-sunken flex items-center justify-center border border-border-subtle group-hover:bg-primary group-hover:border-primary transition-colors shrink-0">
                       <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-bg-page transition-colors" />
                    </div>
                 </div>
              </div>
           )) : (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 bg-surface-container-low rounded-3xl border border-dashed border-border-medium">
                 <div className="w-16 h-16 bg-bg-sunken rounded-full flex items-center justify-center">
                    <History className="w-8 h-8 text-text-tertiary" />
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-text-primary mb-1">No sessions found</h3>
                    <p className="text-sm text-text-secondary">Try adjusting your search or filter criteria.</p>
                 </div>
              </div>
           )}

           {totalPages > 1 && (
             <div className="flex justify-center items-center gap-2 mt-8 pt-6 border-t border-border-subtle">
               <button
                 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                 disabled={currentPage === 1}
                 className="px-4 py-2 rounded-xl text-sm font-bold border border-border-subtle disabled:opacity-50 hover:bg-bg-raised transition-colors"
               >
                 Previous
               </button>
               <div className="flex items-center gap-1 px-4">
                 {Array.from({ length: totalPages }).map((_, i) => (
                   <button
                     key={i}
                     onClick={() => setCurrentPage(i + 1)}
                     className={cn(
                       "w-8 h-8 rounded-lg text-sm font-bold transition-colors flex items-center justify-center",
                       currentPage === i + 1 
                         ? "bg-text-primary text-bg-page" 
                         : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                     )}
                   >
                     {i + 1}
                   </button>
                 ))}
               </div>
               <button
                 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                 disabled={currentPage === totalPages}
                 className="px-4 py-2 rounded-xl text-sm font-bold border border-border-subtle disabled:opacity-50 hover:bg-bg-raised transition-colors"
               >
                 Next
               </button>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
