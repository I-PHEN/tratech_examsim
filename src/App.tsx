/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { 
  Home, 
  Library, 
  History, 
  Zap, 
  Settings, 
  Bell,
  HelpCircle, 
  ArrowRight,
  Target,
  Timer,
  FileText,
  ChevronLeft,
  Sigma,
  Thermometer,
  Microscope,
  FlaskConical,
  Activity,
  Check,
  Flag,
  User,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Pause,
  Play,
  X,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Send,
  Menu,
  LucideIcon,
  AlertCircle,
  Circle,
  Database
} from 'lucide-react';
import { AppState, StudyMode, Course, Topic, COURSES, Question, QuestionType, TimerSession } from './types';
import { cn } from './lib/utils';

import { AdminLoginScreen, AdminDashboardScreen } from './Admin';

// Initialize GenAI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [state, setState] = useState<AppState & { 
    results?: { questions: Question[], answers: Record<number, string> } 
  }>({
    step: 'MODE_SELECT',
    mode: null,
    selectedCourse: null,
    selectedTopic: null,
    difficulty: 'Medium',
    questionCount: 10,
    practiceTimeLimit: 20,
    year: 'Year 3',
    semester: 'Sem 1'
  });

  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isRecentActivitiesOpen, setIsRecentActivitiesOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<'year' | 'semester' | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      setTouchStartX(e.touches[0].clientX);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX === null) return;
      const touchEndX = e.changedTouches[0].clientX;
      const deltaX = touchEndX - touchStartX;

      if (touchStartX < 50 && deltaX > 50) {
        setIsMobileMenuOpen(true);
      }
      if (isMobileMenuOpen && deltaX < -50) {
        setIsMobileMenuOpen(false);
      }
      setTouchStartX(null);
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [touchStartX, isMobileMenuOpen]);

  const handleModeSelect = (mode: StudyMode) => {
    setState(prev => ({ ...prev, mode, step: 'COURSE_SELECT' }));
  };

  const handleCourseSelect = (course: Course) => {
    if (state.mode === 'PRACTICE') {
      setState(prev => ({ ...prev, selectedCourse: course, step: 'TOPIC_SELECT' }));
    } else {
      setState(prev => ({ ...prev, selectedCourse: course, step: 'READY' }));
    }
  };

  const handleTopicSelect = (topic: Topic) => {
    setState(prev => ({ ...prev, selectedTopic: topic, step: 'READY' }));
  };

  const startExam = () => {
    setState(prev => ({ ...prev, step: 'EXAM' }));
  };

  const finishExam = (questions: Question[], answers: Record<number, string>) => {
    setState(prev => ({ 
      ...prev, 
      step: 'REVIEW', 
      results: { questions, answers } 
    }));
  };

  const goBack = () => {
    if (state.step === 'COURSE_SELECT') setState(prev => ({ ...prev, step: 'MODE_SELECT', mode: null }));
    if (state.step === 'TOPIC_SELECT') setState(prev => ({ ...prev, step: 'COURSE_SELECT', selectedCourse: null }));
    if (state.step === 'READY') {
      if (state.mode === 'PRACTICE') setState(prev => ({ ...prev, step: 'TOPIC_SELECT', selectedTopic: null }));
      else setState(prev => ({ ...prev, step: 'COURSE_SELECT', selectedCourse: null }));
    }
    if (state.step === 'EXAM' || state.step === 'REVIEW' || state.step === 'ADMIN_LOGIN' || state.step === 'ADMIN_DASHBOARD') {
      setState(prev => ({ ...prev, step: 'MODE_SELECT', mode: null, selectedCourse: null, selectedTopic: null, results: undefined }));
    }
  };

  return (
    <div className="flex h-screen bg-surface-dim overflow-hidden font-sans">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55] md:hidden"
          />
        )}
      </AnimatePresence>

      {openSelect && (
        <>
          <div
            onClick={() => setOpenSelect(null)}
            className="fixed inset-0 bg-transparent z-[60] md:hidden"
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-surface-container-low border-t border-border-subtle rounded-t-[2.5rem] z-[70] p-6 md:hidden flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center justify-end mb-6 px-2 gap-2">
              <button
                disabled={openSelect === 'year'}
                onClick={() => setOpenSelect('year')}
                className="px-4 py-2 bg-bg-raised text-text-secondary rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
              >
                Prev.
              </button>
              <button
                disabled={openSelect === 'semester'}
                onClick={() => setOpenSelect('semester')}
                className="px-4 py-2 bg-[#1A1A1A] text-bg-page rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
              >
                Next
              </button>
            </div>
            
            <div className="w-full space-y-2 mb-2">
              {(openSelect === 'year' ? ['Year 1', 'Year 2', 'Year 3', 'Year 4'] : ['Sem 1', 'Sem 2']).map((item) => (
                <button
                  key={item}
                  onClick={() => { 
                    setState(p => ({ ...p, [openSelect!]: item as any }));
                    if (openSelect === 'year') {
                      setTimeout(() => setOpenSelect('semester'), 50);
                    } else {
                      setTimeout(() => setOpenSelect(null), 50);
                    }
                  }}
                  className="w-full flex items-center gap-4 p-3 hover:bg-bg-raised/50 rounded-xl transition-colors active:scale-95"
                >
                  <div className={cn(
                    "w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
                    state[openSelect!] === item ? "border-primary bg-transparent" : "border-outline-variant"
                  )}>
                     {state[openSelect!] === item && <div className="w-[10px] h-[10px] rounded-full bg-primary" />}
                  </div>
                  <span className="font-bold text-[15px] text-text-primary">{item}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 text-center pb-2">
              <button
                onClick={() => setOpenSelect(null)}
                className="px-8 py-3 text-text-primary font-bold text-[15px] tracking-wide rounded-full transition-colors active:bg-bg-raised"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}

      {/* Sidebar - Hidden during focus modes */}
      <AnimatePresence>
        {state.step !== 'EXAM' && state.step !== 'REVIEW' && state.step !== 'ADMIN_LOGIN' && state.step !== 'ADMIN_DASHBOARD' && (
          <motion.nav 
            initial={{ x: -100 }}
            animate={{ x: 0 }}
            exit={{ x: -100 }}
            className={cn(
              "bg-bg-surface border-r border-border-subtle transition-[width,transform] duration-150 ease-out z-[60] flex flex-col pt-4 overflow-hidden h-full",
              "fixed inset-y-0 left-0 md:relative",
              isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
              isSidebarExpanded || isMobileMenuOpen ? "w-64" : "w-16"
            )}
            onMouseEnter={() => setIsSidebarExpanded(true)}
            onMouseLeave={() => setIsSidebarExpanded(false)}
          >
            <div className="px-4 mb-8 flex items-center gap-3 h-8 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center shrink-0">
                <span className="text-accent font-black">G</span>
              </div>
              <div className={cn(
                "flex flex-col whitespace-nowrap transition-opacity duration-100",
                isSidebarExpanded ? "opacity-100 " : "opacity-0"
              )}>
                <span className="text-sm font-bold text-text-primary uppercase tracking-wider">The Engine</span>
                <span className="text-[10px] text-text-tertiary uppercase tracking-widest leading-none">Stoic Performance</span>
              </div>
            </div>

            <div className="flex-1 px-3 space-y-2">
              <NavItem onClick={() => setIsMobileMenuOpen(false)} icon={Home} label="Home" active expanded={isSidebarExpanded || isMobileMenuOpen} />
              <NavItem onClick={() => setIsMobileMenuOpen(false)} icon={Target} label="Targeted Practice" expanded={isSidebarExpanded || isMobileMenuOpen} />
              <NavItem onClick={() => { setIsRecentActivitiesOpen(true); setIsMobileMenuOpen(false); }} icon={History} label="My Sessions" expanded={isSidebarExpanded || isMobileMenuOpen} />
              <NavItem onClick={() => setIsMobileMenuOpen(false)} icon={Activity} label="Performance" expanded={isSidebarExpanded || isMobileMenuOpen} />
            </div>

            <div className="mt-auto px-3 pb-6 space-y-4">
              <div className="flex items-center gap-3 px-2 h-6">
                <div className="relative shrink-0 ml-[2px]">
                  <Zap className="w-5 h-5 text-tertiary fill-tertiary" />
                  <span className="absolute -top-2 -right-2 text-[10px] bg-bg-sunken text-text-primary rounded-full px-1 font-bold border border-border-subtle">7</span>
                </div>
                <span className={cn(
                  "text-sm text-text-secondary font-semibold uppercase tracking-wide transition-opacity duration-100 whitespace-nowrap",
                  isSidebarExpanded ? "opacity-100 " : "opacity-0"
                )}>
                  Streak
                </span>
              </div>
              <NavItem onClick={() => setIsMobileMenuOpen(false)} icon={Settings} label="Settings" expanded={isSidebarExpanded || isMobileMenuOpen} />
              <NavItem onClick={() => setIsMobileMenuOpen(false)} icon={HelpCircle} label="Help" expanded={isSidebarExpanded || isMobileMenuOpen} />
              <NavItem onClick={() => { setState(p => ({ ...p, step: 'ADMIN_LOGIN' })); setIsMobileMenuOpen(false); }} icon={Database} label="System Admin" expanded={isSidebarExpanded || isMobileMenuOpen} />
              <div className="pt-4 border-t border-border-subtle flex items-center gap-3 px-1 h-[4.5rem]">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-border-medium shrink-0 ml-[2px]">
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop" alt="Profile" />
                </div>
                <div className={cn(
                  "flex flex-col whitespace-nowrap transition-opacity duration-100",
                  isSidebarExpanded ? "opacity-100 " : "opacity-0"
                )}>
                  <span className="text-sm font-semibold text-text-primary">Kwame A.</span>
                  <span className="text-xs text-text-tertiary">Candidate</span>
                </div>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative h-screen">
        {state.step === 'EXAM' ? (
          <ExamSimulation 
            onBack={goBack} 
            onFinish={finishExam}
            courseName={state.selectedCourse?.name || 'Session'} 
            mode={state.mode!} 
            totalQuestions={state.questionCount}
            practiceTimeLimit={state.practiceTimeLimit}
          />
        ) : state.step === 'REVIEW' ? (
          <ReviewScreen 
            questions={state.results!.questions}
            answers={state.results!.answers}
            onBack={goBack}
            courseName={state.selectedCourse?.name || 'Session'}
          />
        ) : state.step === 'ADMIN_LOGIN' ? (
          <AdminLoginScreen 
            onSuccess={() => setState(prev => ({ ...prev, step: 'ADMIN_DASHBOARD' }))} 
            onBack={goBack} 
          />
        ) : state.step === 'ADMIN_DASHBOARD' ? (
          <AdminDashboardScreen onBack={goBack} />
        ) : (
          <>
            {/* Header */}
        <header className="h-20 flex items-center justify-between px-4 md:px-8 bg-surface-container-low/50 backdrop-blur-md sticky top-0 z-40 border-b border-outline-variant">
          <div className="flex items-center gap-3 md:gap-6">
            {state.step === 'MODE_SELECT' ? (
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden p-2 text-text-secondary hover:text-text-primary  -ml-1 shrink-0"
              >
                <Menu className="w-6 h-6" />
              </button>
            ) : (
              <button 
                onClick={goBack} 
                className="p-2 hover:bg-bg-raised/50 rounded-lg  group shrink-0 -ml-1 md:ml-0"
              >
                <ChevronLeft className="w-5 h-5 text-text-secondary group-hover:text-text-primary group-hover:-translate-x-1 transition-[transform,opacity,box-shadow]" />
              </button>
            )}
            <div className="flex items-center gap-2 md:gap-6">
              <div className="flex items-center gap-1 md:gap-4">
                <div className="flex flex-col relative w-[5.5rem] md:w-24">
                   <span className="hidden md:inline-block text-[10px] text-text-tertiary font-bold uppercase tracking-widest pl-1 mb-1">Year</span>
                   {/* Desktop Select */}
                   <select 
                     value={state.year}
                     onChange={(e) => setState(p => ({ ...p, year: e.target.value as any }))}
                     className="hidden md:block appearance-none bg-surface-container-low border border-border-subtle rounded-lg px-2 md:px-3 py-1.5 md:py-1.5 text-[11px] md:text-sm font-bold text-text-primary cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-[transform,opacity,box-shadow] pr-5 md:pr-8"
                   >
                     <option value="Year 1" className="bg-bg-page text-text-primary">Year 1</option>
                     <option value="Year 2" className="bg-bg-page text-text-primary">Year 2</option>
                     <option value="Year 3" className="bg-bg-page text-text-primary">Year 3</option>
                     <option value="Year 4" className="bg-bg-page text-text-primary">Year 4</option>
                   </select>
                   <ChevronDown className="hidden md:block absolute right-1.5 md:right-2 bottom-1.5 md:bottom-2 w-3 h-3 md:w-4 md:h-4 text-text-secondary pointer-events-none" />

                   {/* Mobile Button */}
                   <button 
                     onClick={() => setOpenSelect('year')}
                     className={cn(
                       "md:hidden flex items-center justify-between w-full bg-surface-container-low border rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors",
                       openSelect === 'year' ? "border-primary text-primary" : "border-border-subtle text-text-primary"
                     )}
                   >
                     {state.year}
                     <ChevronDown className={cn("w-3 h-3", openSelect === 'year' ? "text-primary" : "text-text-secondary")} />
                   </button>
                </div>
                <div className="flex flex-col relative w-[6rem] md:w-36">
                   <span className="hidden md:inline-block text-[10px] text-text-tertiary font-bold uppercase tracking-widest pl-1 mb-1">Semester</span>
                   {/* Desktop Select */}
                   <select 
                     value={state.semester}
                     onChange={(e) => setState(p => ({ ...p, semester: e.target.value as any }))}
                     className="hidden md:block appearance-none bg-surface-container-low border border-border-subtle rounded-lg px-2 md:px-3 py-1.5 md:py-1.5 text-[11px] md:text-sm font-bold text-text-primary cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-[transform,opacity,box-shadow] pr-5 md:pr-8"
                   >
                     <option value="Sem 1" className="bg-bg-page text-text-primary">Sem 1</option>
                     <option value="Sem 2" className="bg-bg-page text-text-primary">Sem 2</option>
                   </select>
                   <ChevronDown className="hidden md:block absolute right-1.5 md:right-2 bottom-1.5 md:bottom-2 w-3 h-3 md:w-4 md:h-4 text-text-secondary pointer-events-none" />

                   {/* Mobile Button */}
                   <button 
                     onClick={() => setOpenSelect('semester')}
                     className={cn(
                       "md:hidden flex items-center justify-between w-full bg-surface-container-low border rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors",
                       openSelect === 'semester' ? "border-primary text-primary" : "border-border-subtle text-text-primary"
                     )}
                   >
                     {state.semester}
                     <ChevronDown className={cn("w-3 h-3", openSelect === 'semester' ? "text-primary" : "text-text-secondary")} />
                   </button>
                </div>
              </div>
              <div className="text-xs font-medium text-text-secondary hidden sm:block">
                 Department of Chemical Engineering
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-6">
            <div className="flex items-center gap-1 md:gap-2">
              <ThemeToggle />
              <button 
                onClick={() => setIsRecentActivitiesOpen(true)}
                className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-raised/50 transition-[transform,opacity,box-shadow] active:scale-95"
              >
                <History className="w-5 h-5 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-8 pb-32">
          <div className="max-w-5xl mx-auto">
            <AnimatePresence mode="wait">
              {state.step === 'MODE_SELECT' && (
                <motion.div
                  key="mode"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-8 md:space-y-12"
                >
                  <header>
                    <p className="text-xs md:text-sm font-bold text-accent-text tracking-[0.2em] uppercase mb-1">Step 1</p>
                    <h2 className="text-xl md:text-[26px] italic no-underline text-justify font-['Times_New_Roman'] font-bold tracking-tight text-text-primary uppercase">What do you want to tackle today?</h2>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <ModeCard 
                      title="Practice by Topic" 
                      description="Target specific weaknesses. Choose concepts and set your own pace without time pressure."
                      tag="Flexible"
                      icon={Target}
                      onClick={() => handleModeSelect('PRACTICE')}
                    />
                    <ModeCard 
                      title="Midsem Simulation" 
                      color="secondary"
                      description="Simulate a mid-term environment. 50% length, strict timing, focused on first-half syllabus."
                      tag="Timed"
                      icon={Timer}
                      onClick={() => handleModeSelect('MIDSEM')}
                    />
                    <ModeCard 
                      title="Full Exam Simulation" 
                      color="tertiary"
                      description="The ultimate test. Full duration, comprehensive syllabus coverage. Prepare for the real thing."
                      tag="Full Paper"
                      icon={FileText}
                      onClick={() => handleModeSelect('FULL_EXAM')}
                    />
                  </div>

                  {/* Recent Performance Section directly on dashboard */}
                  <section className="pt-4 md:pt-8 space-y-4 md:space-y-6">
                    <header className="flex items-end justify-between">
                      <div>
                         <p className="text-xs md:text-sm font-bold text-accent-text tracking-[0.2em] uppercase mb-1">Analytics</p>
                         <h2 className="text-xl md:text-[26px] italic no-underline text-justify font-['Times_New_Roman'] font-bold tracking-tight text-text-primary uppercase">Recent Performance</h2>
                      </div>
                      <button className="text-xs md:text-sm font-bold text-text-secondary hover:text-text-primary uppercase tracking-widest transition-colors">View All</button>
                    </header>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {MOCK_ACTIVITIES.filter(a => a.type === 'completed').map(activity => (
                        <div key={activity.id} className="p-6 rounded-3xl bg-surface-container-high border border-outline-variant/20 hover:border-outline-variant/40 transition-colors flex gap-6 items-center group cursor-pointer">
                           <div className="w-16 h-16 rounded-full bg-bg-sunken flex items-center justify-center shrink-0 border border-border-subtle relative group-hover:scale-105 transition-transform">
                              <svg className="absolute inset-0 w-full h-full overflow-visible -rotate-90" viewBox="0 0 64 64">
                                 <circle cx="32" cy="32" r="28" fill="transparent" stroke="var(--border-subtle)" strokeWidth="4" />
                                 <circle cx="32" cy="32" r="28" fill="transparent" stroke={activity.percent! >= 50 ? "var(--success-text)" : "var(--danger-text)"} strokeWidth="4" strokeDasharray={`${(activity.percent! / 100) * 175.9} 175.9`} strokeLinecap="round" />
                              </svg>
                              <span className={cn(
                                 "text-sm font-black",
                                 activity.percent! >= 50 ? "text-success-text" : "text-danger-text"
                              )}>
                                 {activity.score}
                              </span>
                           </div>
                           <div className="flex-1 min-w-0">
                               <h4 className="text-base font-bold text-text-primary truncate">{activity.title}</h4>
                               <p className="text-sm text-text-secondary truncate mt-1">{activity.subtitle}</p>
                               <div className="flex items-center gap-3 mt-3">
                                  <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest bg-bg-sunken px-2 py-1 rounded-md">{activity.time}</span>
                                  <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">{activity.percent}% Yield</span>
                               </div>
                           </div>
                           <div className="p-3 rounded-xl bg-bg-raised text-text-secondary group-hover:text-text-primary group-hover:bg-bg-sunken transition-colors">
                              <ArrowRight className="w-5 h-5" />
                           </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </motion.div>
              )}

              {state.step === 'COURSE_SELECT' && (
                <motion.div
                  key="course"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8 md:space-y-12"
                >
                  <header>
                    <p className="text-xs md:text-sm font-bold text-accent-text tracking-[0.2em] uppercase mb-1">Step 2</p>
                    <h2 className="text-xl md:text-[26px] italic no-underline text-justify font-['Times_New_Roman'] font-bold tracking-tight text-text-primary uppercase">Choose your course</h2>
                  </header>

                  {COURSES.filter(c => c.year === state.year && c.semester === state.semester).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {COURSES.filter(c => c.year === state.year && c.semester === state.semester).map(course => (
                        <button
                          key={course.id}
                          onClick={() => handleCourseSelect(course)}
                          className="group flex flex-col text-left p-4 md:p-5 rounded-xl bg-surface-container-high border border-outline-variant/10 hover:border-primary/50 transition-[transform,opacity,box-shadow] duration-100 relative overflow-hidden h-auto min-h-36 md:min-h-40"
                        >
                           <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-primary/5 blur-3xl rounded-full" />
                           <h3 className="text-lg md:text-xl font-bold mb-1.5 md:mb-2 group-hover:text-primary transition-colors">{course.name}</h3>
                           <p className="text-on-surface-variant text-[10px] md:text-xs leading-relaxed max-w-xs mb-4 md:mb-0">{course.description}</p>
                           <div className="mt-auto flex items-center text-[9px] md:text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest gap-2">
                             Select Course <ArrowRight className="w-3 h-3" />
                           </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 bg-surface-container/50 border border-border-subtle rounded-3xl text-center">
                      <div className="w-16 h-16 bg-bg-sunken rounded-2xl flex items-center justify-center mb-6">
                         <Target className="w-8 h-8 text-text-tertiary opacity-50" />
                      </div>
                      <h3 className="text-lg font-bold text-text-primary mb-2">No Courses Available</h3>
                      <p className="text-text-secondary text-sm max-w-md mx-auto">
                        There are no simulated mock exams available for {state.year}, {state.semester} yet. Check back later or select a different academic period.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {state.step === 'TOPIC_SELECT' && state.selectedCourse && (
                <motion.div
                  key="topic"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6 md:space-y-8"
                >
                  <header>
                    <p className="text-xs md:text-sm font-bold text-outline uppercase tracking-[0.2em] mb-1">Step 2 of 2</p>
                    <h2 className="text-xl md:text-[26px] italic no-underline text-justify font-['Times_New_Roman'] font-bold tracking-tight">Pick a topic and begin</h2>
                    <nav className="flex flex-wrap items-center gap-2 text-[10px] md:text-xs text-on-surface-variant mt-2 uppercase tracking-widest font-bold">
                       <span>Home</span> / <span>Practice by Topic</span> / <span className="text-primary">{state.selectedCourse.name}</span>
                    </nav>
                  </header>

                  <div className="pb-8 border-b border-white/5 flex flex-col md:flex-row gap-8">
                    <div className="space-y-4">
                      <span className="block text-[10px] font-bold text-outline uppercase tracking-widest">Difficulty</span>
                      <div className="flex gap-2">
                        {['Easy', 'Medium', 'Hard', 'All'].map(d => (
                          <button 
                            key={d}
                            onClick={() => setState(s => ({ ...s, difficulty: d as any }))}
                            className={cn(
                              "px-6 py-2 rounded-full text-xs font-bold transition-[transform,opacity,box-shadow] border",
                              state.difficulty === d 
                                ? "bg-primary border-primary text-slate-950" 
                                : "border-outline-variant/30 text-on-surface-variant hover:text-white"
                            )}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <span className="block text-[10px] font-bold text-outline uppercase tracking-widest">Questions</span>
                      <div className="flex gap-2">
                        {[5, 10, 20].map(q => (
                          <button 
                             key={q}
                             onClick={() => setState(s => ({ ...s, questionCount: q as any, practiceTimeLimit: q * 2 }))}
                             className={cn(
                               "px-6 py-2 rounded-full text-xs font-bold transition-[transform,opacity,box-shadow] border",
                               state.questionCount === q
                                 ? "bg-primary border-primary text-slate-950"
                                 : "border-outline-variant/30 text-on-surface-variant hover:text-white"
                             )}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {state.selectedCourse.topics.map(topic => (
                      <TopicCard 
                        key={topic.id}
                        topic={topic}
                        active={state.selectedTopic?.id === topic.id}
                        onClick={() => handleTopicSelect(topic)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {state.step === 'READY' && (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="max-w-2xl mx-auto space-y-8 mt-8"
                >
                  <div className="text-center space-y-4 mb-12">
                    <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Zap className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-[24px] leading-[35px] italic font-['Times_New_Roman'] font-bold text-text-primary capitalize">
                      {state.mode === 'PRACTICE' ? 'Targeted Practice Ready' : 
                       state.mode === 'MIDSEM' ? 'Midsem Simulation Ready' : 
                       'Full Exam Simulation Ready'}
                    </h2>
                    <p className="text-text-secondary text-sm">
                      {state.mode === 'PRACTICE' ? 'Focus mode engaged. Time to solidify those concepts.' :
                       'Deep breath. You are about to enter exam conditions.'}
                    </p>
                  </div>

                  <div className="p-8 rounded-2xl bg-surface-container-high border border-border-medium shadow-xl space-y-6">
                    <div className="flex items-center gap-4 pb-6 border-b border-border-subtle">
                      <div className="w-12 h-12 bg-bg-sunken rounded-xl flex items-center justify-center shrink-0">
                        {state.mode === 'PRACTICE' ? <Target className="w-6 h-6 text-primary" /> : <Timer className="w-6 h-6 text-tertiary" />}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-text-primary">{state.selectedCourse?.name}</h3>
                        <p className="text-sm text-text-secondary">
                          {state.mode === 'PRACTICE' && state.selectedTopic 
                            ? `Topic: ${state.selectedTopic.name}` 
                            : state.mode === 'MIDSEM' 
                            ? 'First Half Syllabus (Weeks 1-6)' 
                            : 'Comprehensive Coverage'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-bg-sunken border border-border-subtle flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">Questions</span>
                        <span className="text-xl font-bold text-text-primary">
                          {state.mode === 'PRACTICE' ? state.questionCount :
                           state.mode === 'MIDSEM' ? 30 : 60}
                        </span>
                      </div>
                      
                      <div className="p-4 rounded-xl bg-bg-sunken border border-border-subtle flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">Time Limit</span>
                        {state.mode === 'PRACTICE' ? (
                          <div className="flex items-center gap-2">
                             <input 
                               type="number" 
                               min="1" 
                               max="120"
                               value={state.practiceTimeLimit} 
                               onChange={(e) => setState(s => ({ ...s, practiceTimeLimit: parseInt(e.target.value) || 1 }))}
                               className="bg-transparent border-b border-primary/50 text-xl font-bold text-text-primary w-16 outline-none focus:border-primary transition-colors text-center"
                             />
                             <span className="text-sm font-medium text-text-secondary">mins</span>
                          </div>
                        ) : (
                          <span className="text-xl font-bold text-text-primary">
                            {state.mode === 'MIDSEM' ? '60 mins' : '150 mins'}
                          </span>
                        )}
                      </div>
                    </div>

                    {state.mode !== 'PRACTICE' && (
                      <div className="mt-6 p-4 rounded-xl bg-red-900/10 border border-red-500/20">
                        <h4 className="flex items-center gap-2 text-sm font-bold text-red-400 mb-2">
                          <AlertCircle className="w-4 h-4" /> Strict Conditions
                        </h4>
                        <ul className="text-xs text-text-secondary space-y-1 list-disc pl-5">
                          <li>Timer cannot be paused once started.</li>
                          <li>Ensure stable connection before proceeding.</li>
                          <li>Results will impact your overall performance metrics.</li>
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center pt-8">
                    <button 
                      onClick={startExam}
                      className="px-10 py-4 w-full md:w-auto rounded-2xl font-bold flex items-center justify-center gap-3 transition-[transform,opacity,box-shadow] duration-100 transform bg-primary text-slate-950 hover:scale-105 hover:shadow-[0_0_30px_theme(colors.primary)] cursor-pointer"
                    >
                      <span>Start Solving</span>
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Footer removed from global layout, placed directly on READY step */}
      </>
    )}
    
    <RecentActivitiesDrawer isOpen={isRecentActivitiesOpen} onClose={() => setIsRecentActivitiesOpen(false)} />
  </div>
</div>
  );
}

const MOCK_ACTIVITIES = [
  {
    id: "1",
    type: "in-progress",
    title: "Advanced Mathematics",
    subtitle: "Exam Simulation - Midterm",
    progress: "12 / 20",
    time: "2 hours ago"
  },
  {
    id: "2",
    type: "completed",
    title: "Physics Mechanics",
    subtitle: "Practice: Vectors & Kinematics",
    score: "18",
    total: "20",
    percent: 90,
    time: "Yesterday"
  },
  {
    id: "3",
    type: "completed",
    title: "Chemistry 101",
    subtitle: "Practice: Atomic Structure",
    score: "8",
    total: "20",
    percent: 40,
    time: "3 days ago"
  }
];

function RecentActivitiesDrawer({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const inProgressActivities = MOCK_ACTIVITIES.filter(a => a.type === 'in-progress');

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-bg-page/80 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-bg-surface border-l border-border-subtle z-50 flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0 bg-bg-surface/80 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center">
                  <History className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-text-primary tracking-tight uppercase">Recent Activities</h2>
                  <p className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">Session History & Drafts</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-bg-raised rounded-lg text-text-secondary hover:text-text-primary transition-colors active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
               <section className="space-y-4">
                  <h3 className="text-xs font-black text-text-secondary uppercase tracking-[0.2em]">In Progress</h3>
                  
                  {inProgressActivities.length > 0 ? (
                    <div className="space-y-3">
                      {inProgressActivities.map(activity => (
                        <div key={activity.id} className="p-4 rounded-2xl bg-bg-sunken border border-border-subtle hover:border-accent/40 transition-colors cursor-pointer group">
                           <div className="flex justify-between items-start mb-3">
                              <div>
                                 <h4 className="text-sm font-bold text-text-primary">{activity.title}</h4>
                                 <p className="text-xs text-text-secondary">{activity.subtitle}</p>
                              </div>
                              <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">{activity.time}</span>
                           </div>
                           <div className="flex items-center justify-between text-xs font-bold text-accent">
                              <span className="uppercase tracking-widest">Resume Session</span>
                              <span>{activity.progress} Questions</span>
                           </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-12">
                       <History className="w-12 h-12 text-text-tertiary mb-4 opacity-50" />
                       <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">No Sessions In Progress</h3>
                       <p className="text-xs text-text-tertiary max-w-[200px] leading-relaxed mt-2">Unfinished drafts will appear here.</p>
                    </div>
                  )}
               </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ReviewScreen({ questions, answers, onBack, courseName }: { questions: Question[], answers: Record<number, string>, onBack: () => void, courseName: string }) {
  const [filter, setFilter] = useState<'All' | 'Correct' | 'Incorrect' | 'Unanswered'>('All');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [judeIdx, setJudeIdx] = useState<number | null>(null);

  const stats = useMemo(() => {
    // For demo, we assume first option is always correct for MCQs
    // For INPUT, we check if answer exists
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    
    questions.forEach((q, i) => {
      const ans = answers[i];
      if (!ans) unanswered++;
      else if (q.type === 'MCQ') {
        if (ans === q.options![0]) correct++;
        else incorrect++;
      } else {
        // Assume all non-empty input is correct for demo
        correct++;
      }
    });

    return { correct, incorrect, unanswered, total: questions.length, score: correct, percent: Math.round((correct / questions.length) * 100) };
  }, [questions, answers]);

  const filteredQuestions = useMemo(() => {
    return questions.map((q, i) => ({ ...q, originalIdx: i })).filter(q => {
      const ans = answers[q.originalIdx];
      if (filter === 'All') return true;
      if (filter === 'Unanswered') return !ans;
      const isCorrect = q.type === 'MCQ' ? ans === q.options![0] : !!ans;
      if (filter === 'Correct') return isCorrect;
      if (filter === 'Incorrect') return ans && !isCorrect;
      return true;
    });
  }, [questions, answers, filter]);

  const isPassed = stats.percent >= 50;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-screen bg-bg-page text-text-primary font-sans overflow-hidden"
    >
      {/* Header HUD */}
      <header className="h-16 bg-bg-surface border-b border-border-subtle flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-bg-raised rounded-lg transition-colors group">
            <ChevronLeft className="w-5 h-5 text-text-secondary group-hover:text-text-primary" />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-accent-text uppercase tracking-widest leading-none">Diagnostic Review</span>
            <h1 className="text-sm font-black text-text-primary uppercase tracking-widest mt-1">{courseName}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <ThemeToggle />
           <div className="px-4 py-1.5 bg-bg-sunken border border-border-subtle rounded-xl flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", isPassed ? "bg-success-text" : "bg-danger-text")} />
              <span className="text-[10px] font-black uppercase tracking-widest">{isPassed ? "Pass Threshold Met" : "Requires Calibration"}</span>
           </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar relative">
        <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
          {/* Layer 1: Results Summary */}
          <section className="bg-bg-surface border border-border-subtle rounded-[2rem] p-10 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
            <div className="flex flex-col md:flex-row items-center justify-between gap-10 relative z-10">
              <div className="flex flex-col items-center md:items-start text-center md:text-left">
                <span className="text-[12px] font-black text-text-tertiary uppercase tracking-[0.3em] mb-2">Performance Yield</span>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-7xl font-black text-text-primary tracking-tighter italic">{stats.score}</h2>
                  <span className="text-2xl font-black text-text-tertiary">/ {stats.total}</span>
                </div>
                <div className={cn(
                  "mt-4 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2",
                  isPassed ? "bg-success-bg text-success-text" : "bg-danger-bg text-danger-text"
                )}>
                  {isPassed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  {isPassed ? "Simulation Passed" : "Simulation Failed"} • {stats.percent}%
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
                <StatPill label="Correct" value={stats.correct} color="text-success-text" />
                <StatPill label="Incorrect" value={stats.incorrect} color="text-danger-text" />
                <StatPill label="Unanswered" value={stats.unanswered} color="text-text-tertiary" />
                <StatPill label="Time Taken" value="42:15" color="text-accent" />
              </div>

              <button 
                onClick={() => document.getElementById('review-list')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full md:w-auto px-8 py-5 bg-text-primary text-bg-page font-black text-sm uppercase tracking-[0.2em] rounded-2xl hover:scale-105 active:scale-95 transition-[transform,opacity,box-shadow] shadow-xl flex items-center justify-center gap-3"
              >
                Review Answers <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </section>

          {/* Filter Bar */}
          <div id="review-list" className="flex flex-wrap items-center gap-2 md:gap-3 pb-4 border-b border-border-subtle sticky top-0 bg-bg-page z-30 pt-4 w-full">
            {(['All', 'Correct', 'Incorrect', 'Unanswered'] as const).map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 md:px-6 py-1.5 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-colors border shrink-0",
                  filter === f
                    ? "bg-text-primary border-text-primary text-bg-page"
                    : "bg-bg-raised border-border-subtle text-text-tertiary hover:text-text-primary hover:border-border-medium"
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Layer 2: Question Review List */}
          <div className="space-y-4 pb-20">
            {filteredQuestions.map((q, i) => {
              const ans = answers[q.originalIdx];
              const isCorrect = q.type === 'MCQ' ? ans === q.options![0] : !!ans;
              const isUnanswered = !ans;
              const isExpanded = expandedIdx === q.originalIdx;

              return (
                <div 
                  key={q.id}
                  className={cn(
                    "bg-bg-surface border border-border-subtle rounded-2xl overflow-hidden transition-colors",
                    isExpanded ? "ring-2 ring-accent/30 shadow-2xl" : "hover:border-border-medium"
                  )}
                >
                  {/* Collapsed Item */}
                  <div 
                    onClick={() => setExpandedIdx(isExpanded ? null : q.originalIdx)}
                    className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 cursor-pointer select-none group"
                  >
                    <div className="flex items-start md:items-center gap-3 md:gap-4 flex-1 min-w-0">
                      <span className="text-xs font-black text-text-tertiary shrink-0 w-6 md:w-8 mt-0.5 md:mt-0">Q{q.originalIdx + 1}</span>
                      <p className="text-sm font-medium text-text-primary line-clamp-2 md:truncate">{q.prompt}</p>
                    </div>
                    
                    <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 shrink-0 pl-9 md:pl-0 w-full md:w-auto mt-2 md:mt-0">
                      <div className="flex items-center gap-2 md:gap-4">
                        <div className={cn(
                          "px-2 md:px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                          isUnanswered ? "bg-bg-raised text-text-tertiary" : isCorrect ? "bg-success-bg text-success-text" : "bg-danger-bg text-danger-text"
                        )}>
                          {isUnanswered ? "Unanswered" : isCorrect ? "Correct" : "Incorrect"}
                        </div>
                        
                        {!isExpanded && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setJudeIdx(q.originalIdx); }}
                            className={cn(
                              "flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-colors border",
                              isCorrect ? "text-text-tertiary border-border-subtle" : "text-accent border-accent/20 bg-accent/5 hover:bg-accent/10"
                            )}
                          >
                            Ask Jude {isCorrect && "✦"}
                          </button>
                        )}
                      </div>
                      
                      <ChevronRight className={cn("w-4 h-4 text-text-tertiary transition-transform", isExpanded && "rotate-90")} />
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div 
                      className="border-t border-border-subtle bg-bg-sunken/30"
                    >
                      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
                          <p className="text-lg text-text-primary leading-relaxed font-medium">{q.prompt}</p>
                          
                          {q.type === 'MCQ' ? (
                            <div className="grid grid-cols-1 gap-3">
                              {q.options?.map((opt, optIdx) => {
                                const isCorrectOpt = optIdx === 0; // Assume first is correct
                                const isStudentAns = ans === opt;
                                const label = String.fromCharCode(65 + optIdx) + '.';

                                return (
                                  <div 
                                    key={optIdx}
                                    className={cn(
                                      "flex items-center gap-4 p-5 rounded-2xl border transition-[transform,opacity,box-shadow]",
                                      isCorrectOpt 
                                        ? "bg-success-bg border-success-border text-success-text shadow-[0_4px_12px_rgba(34,197,94,0.1)]" 
                                        : isStudentAns && !isCorrectOpt
                                          ? "bg-danger-bg border-danger-border text-danger-text"
                                          : "bg-bg-surface border-border-subtle text-text-tertiary opacity-60"
                                    )}
                                  >
                                    <div className={cn(
                                      "w-6 h-6 rounded-full border flex items-center justify-center shrink-0",
                                      isCorrectOpt ? "bg-success-text border-success-text text-bg-page" : isStudentAns ? "bg-danger-text border-danger-text text-bg-page" : "border-border-subtle"
                                    )}>
                                      {isCorrectOpt ? <Check className="w-3 h-3" /> : isStudentAns ? <X className="w-3 h-3" /> : null}
                                    </div>
                                    <div className="flex gap-3 text-sm">
                                      <span className="font-black tracking-widest uppercase">{label}</span>
                                      <span className="font-medium">{opt}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest">Your Response</span>
                                <div className="p-4 bg-bg-surface border border-border-subtle rounded-xl font-mono text-sm">
                                   {ans || "No response provided"}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <span className="text-[10px] font-black text-success-text uppercase tracking-widest">Model Answer</span>
                                <div className="p-4 bg-success-bg/10 border border-success-border rounded-xl font-mono text-sm text-success-text">
                                   [Correct Numerical/Conceptual Key]
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="bg-bg-sunken border border-border-subtle rounded-2xl p-6 space-y-4">
                            <span className="text-[10px] font-black text-accent-text uppercase tracking-widest flex items-center gap-2">
                               <Sigma className="w-3.5 h-3.5" /> Worked Solution
                            </span>
                            <div className="text-sm text-text-secondary leading-relaxed font-mono whitespace-pre-line opacity-80">
                               1. Identify independent parameters: T₁=100C, T₂=20C
                               2. Apply Fourier's Law: Q = -kA(dT/dx)
                               3. Solve for thermal resistance: R = L/(kA)
                               4. Result verified at node limit.
                            </div>
                          </div>

                          <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-4 pt-6 border-t border-border-subtle">
                             <div className="flex justify-between w-full md:w-auto gap-2">
                               <button 
                                 disabled={q.originalIdx === 0}
                                 onClick={() => setExpandedIdx(questions[q.originalIdx - 1]?.id ? q.originalIdx - 1 : null)}
                                 className="flex-1 md:flex-none p-3 bg-bg-raised border border-border-subtle rounded-xl text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-30 flex justify-center items-center"
                               >
                                 <ChevronLeft className="w-4 h-4" />
                               </button>
                               <button 
                                 disabled={q.originalIdx === questions.length - 1}
                                 onClick={() => setExpandedIdx(questions[q.originalIdx + 1]?.id ? q.originalIdx + 1 : null)}
                                 className="flex-1 md:flex-none p-3 bg-bg-raised border border-border-subtle rounded-xl text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-30 flex justify-center items-center"
                               >
                                 <ChevronRight className="w-4 h-4" />
                               </button>
                             </div>
                             
                             <button 
                                onClick={() => setJudeIdx(q.originalIdx)}
                                className="w-full md:w-auto px-6 md:px-10 py-3 md:py-4 bg-accent text-bg-page text-[10px] md:text-xs font-black uppercase tracking-widest rounded-xl md:rounded-2xl shadow-lg hover:-translate-y-0.5 transition-[transform,opacity,box-shadow] flex items-center justify-center gap-3"
                              >
                                Ask Jude {isCorrect && "✦"}
                              </button>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Jude Integration Panel */}
      <AnimatePresence>
         {judeIdx !== null && (
           <JudePanel 
             question={questions[judeIdx]} 
             answer={answers[judeIdx]} 
             onClose={() => setJudeIdx(null)}
           />
         )}
      </AnimatePresence>
    </motion.div>
  );
}

function JudePanel({ question, answer, onClose }: { question: Question, answer: string, onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'jude', content: string }[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [streamedText, setStreamedText] = useState("");
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial explanation
  useEffect(() => {
    let isMounted = true;
    
    async function startJude() {
      const prompt = `System:
You are Jude, an academic tutor built into an exam simulation app for university students.
Your job is to explain exam answers clearly, honestly, and at a university level.
Be direct. Do not use filler phrases like "Great question!" or "Certainly!".
For calculation questions, show every step on a new line with the operation labelled.
Keep the initial explanation under 200 words unless the question is a multi-step calculation.
Respond in plain text. Use LaTeX notation for math (wrapped in $$ for display, $ for inline).

Context:
- Question: ${question.prompt}
- Correct answer: ${question.type === 'MCQ' ? question.options![0] : '[Model Answer]'}
- Student's answer: ${answer || "unanswered"}
- Question type: ${question.type}
${question.options ? `- All options: ${question.options.join(', ')}` : ''}

Task:
Explain why the correct answer is right. If the student answered incorrectly, explain
specifically why their answer was wrong. End with one sentence connecting this to a
broader concept or common exam trap.`;

      try {
        const stream = await ai.models.generateContentStream({
          model: "gemini-3-flash-preview",
          contents: prompt
        });

        let fullText = "";
        for await (const chunk of stream) {
          if (!isMounted) break;
          const text = chunk.text || "";
          fullText += text;
          
          // Typewriter simulation
          for (let i = 0; i < text.length; i++) {
            await new Promise(r => setTimeout(r, 15));
            if (!isMounted) return;
            setStreamedText(prev => prev + text[i]);
          }
        }
        
        setIsStreaming(false);
        setMessages([{ role: 'jude', content: fullText }]);
      } catch (err) {
        console.error(err);
        setStreamedText("Calibration error. Please reset neural link.");
        setIsStreaming(false);
      }
    }

    startJude();
    return () => { isMounted = false; };
  }, [question, answer]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamedText, messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;
    
    const userMsg = inputValue;
    setInputValue("");
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(newMessages);
    setIsStreaming(true);
    setStreamedText("");

    try {
      const chat = ai.chats.create({
         model: "gemini-3-flash-preview",
         config: {
           systemInstruction: "You are Jude, the AI tutor. Help the student with this specific question only. Be concise."
         },
         history: [
           { role: 'user', parts: [{ text: `I'm asking about this question: ${question.prompt}` }] },
           ...messages.map(m => ({ 
             role: m.role === 'jude' ? ('model' as const) : ('user' as const), 
             parts: [{ text: m.content }] 
           }))
         ]
      });

      const result = await chat.sendMessageStream({ message: userMsg });
      let fullText = "";
      for await (const chunk of result) {
        const text = chunk.text || "";
        fullText += text;
        for (let i = 0; i < text.length; i++) {
          await new Promise(r => setTimeout(r, 10));
          setStreamedText(prev => prev + text[i]);
        }
      }
      setMessages([...newMessages, { role: 'jude', content: fullText }]);
      setIsStreaming(false);
    } catch (err) {
      console.error(err);
      setIsStreaming(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-bg-page/40 backdrop-blur-sm z-[100]"
      />
      
      {/* Panel */}
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 h-full w-full md:w-[450px] bg-bg-surface border-l border-border-subtle shadow-[0_0_50px_rgba(0,0,0,0.3)] z-[110] flex flex-col"
      >
        {/* Header */}
        <div className="h-20 border-b border-border-subtle bg-bg-surface/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-accent fill-accent/10" />
            </div>
            <div className="flex flex-col">
              <h3 className="text-sm font-black text-text-primary uppercase tracking-widest leading-none">Jude</h3>
              <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest mt-1 italic opacity-60">Academic Tutor ✦ Simulation Mode</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-raised/50 rounded-xl transition-[transform,opacity,box-shadow]">
            <X className="w-5 h-5 text-text-tertiary" />
          </button>
        </div>

        {/* Conversation Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 scroll-smooth">
          {/* Initial explanation as First message if streaming is done, or live text */}
          {messages.length === 0 || (messages.length === 1 && isStreaming) ? (
            <div className="space-y-4">
               <div className="flex items-center gap-2 mb-4 shrink-0">
                 <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                 <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest">Thought Stream Active</span>
               </div>
               <div className="text-sm text-text-primary leading-relaxed font-medium whitespace-pre-wrap">
                  {streamedText}
                  {isStreaming && <span className="inline-block w-1.5 h-4 bg-accent ml-1 animate-pulse" />}
               </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex flex-col", m.role === 'user' ? "items-end" : "items-start")}>
                   <div className={cn(
                     "max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed",
                     m.role === 'user' 
                      ? "bg-accent text-bg-page font-medium rounded-tr-none" 
                      : "bg-bg-raised border border-border-subtle text-text-primary rounded-tl-none"
                   )}>
                      {m.content}
                   </div>
                </div>
              ))}
              {isStreaming && (
                <div className="flex flex-col items-start">
                   <div className="max-w-[90%] p-4 bg-bg-raised border border-border-subtle text-text-primary rounded-2xl rounded-tl-none text-sm leading-relaxed whitespace-pre-wrap">
                      {streamedText}
                      <span className="inline-block w-1.5 h-4 bg-accent ml-1 animate-pulse" />
                   </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-border-subtle bg-bg-surface shrink-0">
           <div className="relative group">
              <input 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask a follow-up question..."
                className="w-full bg-bg-raised border border-border-subtle rounded-2xl pl-6 pr-14 py-4 text-sm text-text-primary focus:outline-none focus:border-accent/40 transition-[transform,opacity,box-shadow] placeholder:text-text-tertiary"
              />
              <button 
                onClick={handleSend}
                disabled={!inputValue.trim() || isStreaming}
                className="absolute right-2 top-2 bottom-2 w-10 bg-accent text-bg-page rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-[transform,opacity,box-shadow] disabled:opacity-30 disabled:hover:scale-100"
              >
                <Send className="w-4 h-4" />
              </button>
           </div>
           <p className="text-[9px] text-center text-text-tertiary uppercase tracking-widest mt-4 opacity-50">
             Conversation context restricted to Simulation Node {question.id}
           </p>
        </div>
      </motion.aside>
    </>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') || 'light';
    }
    return 'light';
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  };

  return (
    <button 
      onClick={toggleTheme}
      className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-[transform,opacity,box-shadow] active:scale-95"
      aria-label="Toggle Theme"
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

function StatPill({ label, value, color }: { label: string, value: string | number, color: string }) {
  return (
    <div className="bg-bg-sunken border border-border-subtle rounded-2xl p-4 flex flex-col items-center justify-center text-center">
      <span className="text-[9px] font-black text-text-tertiary uppercase tracking-widest mb-1">{label}</span>
      <span className={cn("text-xl font-black italic tracking-tighter truncate w-full", color)}>{value}</span>
    </div>
  );
}

const MOCK_QUESTIONS: Question[] = ([
  {
    id: 'q1',
    type: 'MCQ' as QuestionType,
    prompt: 'A composite wall is made up of two layers of different materials with thermal conductivities k₁ and k₂. If the thickness of both layers is the same, which material will have a higher temperature gradient for the same heat flux?',
    options: [
      'The material with higher thermal conductivity',
      'The material with lower thermal conductivity',
      'Both will have the same gradient',
      'It depends on the surface area'
    ],
    marks: 1.0
  },
  {
    id: 'q2',
    type: 'INPUT' as QuestionType,
    prompt: 'Calculate the convective heat transfer coefficient (h) in W/m²K if the heat flux is 5000 W/m², the surface temperature is 100°C, and the fluid temperature is 20°C.',
    marks: 2.0
  },
  {
    id: 'q3',
    type: 'MCQ' as QuestionType,
    prompt: 'In the context of fluid dynamics, what does a Reynolds number of 1500 typically indicate for flow in a circular pipe?',
    options: [
      'Laminar flow',
      'Turbulent flow',
      'Transitional flow',
      'Supersonic flow'
    ],
    marks: 1.5
  },
  {
    id: 'q4',
    type: 'INPUT' as QuestionType,
    prompt: 'A gas occupies 2.0 m³ at 300 K. If the pressure is held constant, what will be its volume (m³) at 450 K?',
    marks: 2.0
  },
  {
    id: 'q5',
    type: 'MCQ' as QuestionType,
    prompt: 'Which thermodynamic cycle is used as the ideal model for spark-ignition internal combustion engines?',
    options: ['Diesel cycle', 'Brayton cycle', 'Otto cycle', 'Rankine cycle'],
    marks: 1.0
  },
  {
    id: 'q6',
    type: 'INPUT' as QuestionType,
    prompt: 'Determine the work done (kJ) during an isothermal expansion of 1 kg of an ideal gas from 2 bar to 1 bar at 300 K. (R = 0.287 kJ/kgK)',
    marks: 3.0
  }
] as Question[]).concat(Array.from({ length: 19 }, (_, i) => ({
  id: `q${i + 7}`,
  type: (i % 2 === 0 ? 'MCQ' : 'INPUT') as QuestionType,
  prompt: `Advanced technical evaluation node #${i + 7}. Analyze the system parameters provided in the diagrams and determine the ${i % 2 === 0 ? 'optimal configuration' : 'resultant vector magnitude'}. High precision required.`,
  options: i % 2 === 0 ? ['Configuration Alpha-7', 'Configuration Beta-2', 'Configuration Gamma-9', 'Configuration Sigma-0'] : undefined,
  marks: 1.0 + (i % 3) * 0.5
})));

function ExamSimulation({ onBack, onFinish, courseName, mode, totalQuestions, practiceTimeLimit }: { onBack: () => void, onFinish: (qs: Question[], ans: Record<number, string>) => void, courseName: string, mode: StudyMode, totalQuestions: number, practiceTimeLimit: number }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [showTimer, setShowTimer] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Persistent Timer Logic
  const storageKey = `engine_session_${courseName}_${mode}`;
  const [session, setSession] = useState<TimerSession>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
    
    // 1h for midsem, 2.5h for full exam, practiceTimeLimit (mins) for practice
    const duration = mode === 'MIDSEM' ? 3600000 : mode === 'FULL_EXAM' ? 9000000 : practiceTimeLimit * 60000;
    return {
      startedAt: Date.now(),
      durationMs: duration,
      totalPausedMs: 0,
      pauseCount: 0,
      pausedAt: null
    };
  });

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(session));
  }, [session]);

  const togglePause = () => {
    if (mode !== 'PRACTICE') return;
    
    setSession(prev => {
      if (prev.pausedAt) {
        // Unpausing
        const pauseTime = Date.now() - prev.pausedAt;
        return { ...prev, pausedAt: null, totalPausedMs: prev.totalPausedMs + pauseTime };
      }
      // Pausing: limit to 3 pauses
      if (prev.pauseCount >= 3) return prev;
      return { ...prev, pausedAt: Date.now(), pauseCount: prev.pauseCount + 1 };
    });
  };

  // Auto-resume if pause caps at 15m (900,000ms)
  useEffect(() => {
    if (session.pausedAt && (now - session.pausedAt >= 900000)) {
      togglePause();
    }
  }, [now, session.pausedAt]);

  const timeLeftMs = useMemo(() => {
    const timeRef = session.pausedAt || now;
    const elapsed = timeRef - session.startedAt - session.totalPausedMs;
    return Math.max(0, session.durationMs - elapsed);
  }, [session, now]);

  const timeLeftSeconds = Math.floor(timeLeftMs / 1000);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isUrgent = timeLeftSeconds <= 600; // 10 minutes warning
  const timerText = formatTime(timeLeftSeconds);

  const questions = useMemo(() => MOCK_QUESTIONS.slice(0, totalQuestions), [totalQuestions]);
  const currentQuestion = questions[currentIdx];

  const handleFinish = () => {
    localStorage.removeItem(storageKey);
    onFinish(questions, answers);
  };

  // Auto-submit handle
  useEffect(() => {
    if (timeLeftMs <= 0) {
      handleFinish();
    }
  }, [timeLeftMs]);

  const handleAnswer = (answer: string) => {
    setAnswers(prev => ({ ...prev, [currentIdx]: answer }));
  };

  const toggleFlag = () => {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(currentIdx)) next.delete(currentIdx);
      else next.add(currentIdx);
      return next;
    });
  };

  const nextQuestion = () => {
    if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
    else handleFinish();
  };

  const prevQuestion = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const navigatorJSX = (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-accent-text uppercase tracking-widest">Question Navigator</h3>
          <button 
            onClick={() => setIsMobileNavOpen(false)} 
            className="lg:hidden p-1.5 hover:bg-bg-raised rounded-lg transition-[transform,opacity,box-shadow]"
          >
            <X className="w-4 h-4 text-text-tertiary hover:text-text-primary" />
          </button>
        </div>
        <div className="h-1 w-12 bg-accent rounded-full" />
      </header>

      <div className="bg-surface-container-high border border-outline-variant/10 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex justify-between items-center text-xs text-text-secondary font-bold">
           <span>Progress</span>
           <span>{Object.keys(answers).length} / {totalQuestions}</span>
        </div>
        <div className="flex gap-4 text-[10px] uppercase font-black tracking-widest">
           <span className="flex items-center gap-1.5 text-success-text">
              <Check className="w-3 h-3"/> {Object.keys(answers).length} done
           </span>
           <span className="flex items-center gap-1.5 text-text-tertiary">
              <Circle className="w-3 h-3"/> {totalQuestions - Object.keys(answers).length} left
           </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-surface-container-low p-1 rounded-xl">
        <button className="flex-1 py-1.5 bg-bg-surface text-text-primary rounded-lg shadow-sm border border-outline-variant/10 transition-[transform,opacity,box-shadow]">All</button>
        <button className="flex-1 py-1.5 text-text-secondary hover:text-text-primary transition-colors">Flagged</button>
        <button className="flex-1 py-1.5 text-text-secondary hover:text-text-primary transition-colors">Unanswered <span className="opacity-50 ml-1">{totalQuestions - Object.keys(answers).length}</span></button>
      </div>

      <div className="grid grid-cols-5 gap-2 lg:gap-3">
         {questions.map((_, i) => {
            const num = i + 1;
            const isActive = currentIdx === i;
            const isDone = !!answers[i];
            const isFlagged = flagged.has(i);
            
            return (
              <button 
                key={i}
                onClick={() => {
                  setCurrentIdx(i);
                  setIsMobileNavOpen(false);
                }}
                className={cn(
                  "w-full aspect-square border transition-[transform,opacity,box-shadow] transform active:scale-95 flex items-center justify-center text-[11px] font-black rounded-[0.85rem] relative overflow-hidden",
                  isActive 
                    ? "border-accent bg-accent text-bg-page shadow-[0_0_20px_var(--accent-muted)] z-10 scale-105" 
                    : isFlagged
                      ? "border-yellow-400 bg-yellow-400 text-slate-900 shadow-[0_0_12px_rgba(250,204,21,0.5)] scale-105"
                      : isDone
                        ? "border-success-border bg-success-bg/80 text-success-text border-2"
                        : "border-border-subtle bg-surface-container-low text-text-tertiary hover:border-border-medium hover:bg-surface-container-high hover:text-text-primary"
                )}
              >
                {num}
              </button>
            );
         })}
      </div>

      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest font-black text-text-secondary pt-4 border-t border-border-subtle mt-6">
        <div className="flex items-center gap-1.5">
           <div className="w-2 h-2 rounded-full bg-accent" /> Current
        </div>
        <div className="flex items-center gap-1.5">
           <div className="w-2 h-2 rounded-full bg-success-border" /> Answered
        </div>
        <div className="flex items-center gap-1.5">
           <div className="w-2 h-2 rounded-full bg-yellow-400" /> Flagged
        </div>
      </div>

      <button onClick={() => { setIsMobileNavOpen(false); handleFinish(); }} className="w-full py-3.5 mt-2 bg-primary hover:bg-primary/90 text-slate-950 font-black text-xs uppercase tracking-widest rounded-[1rem] shadow-lg hover:-translate-y-0.5 transition-[transform,opacity,box-shadow]">
        Submit Exam
      </button>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-screen flex-1 bg-bg-page text-text-primary font-sans overflow-hidden"
    >
      <AnimatePresence>
        {isMobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] lg:hidden"
          >
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileNavOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 right-0 w-80 bg-bg-surface border-l border-border-subtle shadow-2xl p-6 overflow-y-auto overscroll-contain flex flex-col"
            >
              {navigatorJSX}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {session.pausedAt && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-bg-page flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="w-24 h-24 bg-accent/10 border border-accent/20 rounded-3xl flex items-center justify-center mb-8 animate-pulse">
              <Pause className="w-10 h-10 text-accent fill-accent" />
            </div>
            <h2 className="text-5xl font-black text-text-primary uppercase tracking-tighter italic mb-4">Neural Link Suspended</h2>
            <p className="text-text-secondary max-w-md mb-12 text-sm uppercase tracking-widest leading-relaxed">
              Active simulation parameters are masked. Evaluation integrity protocols are active.
              <br/><br/>
              <span className="text-accent font-black">
                PAUSE CAPACITY: {session.pauseCount} / 3
              </span>
            </p>
            <button 
              onClick={togglePause}
              disabled={session.pauseCount >= 3 && !session.pausedAt}
              className="px-12 py-5 bg-accent text-bg-page text-sm font-black uppercase tracking-[0.2em] rounded-2xl shadow-[0_20px_40px_var(--accent-muted)] hover:scale-105 active:scale-95 transition-[transform,opacity,box-shadow] flex items-center gap-4 group"
            >
              Resume Simulation <Play className="w-4 h-4 fill-current group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD Header */}
      <header className="relative h-16 bg-bg-surface border-b border-border-subtle flex items-center justify-between px-4 md:px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              localStorage.removeItem(storageKey);
              onBack();
            }}
            className="p-2 -ml-2 hover:bg-bg-raised/50 rounded-lg group shrink-0"
            title="Terminate Session"
          >
            <ChevronLeft className="w-5 h-5 text-text-secondary group-hover:text-text-primary transition-colors" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-accent-muted rounded-xl flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 md:w-6 md:h-6 text-accent fill-accent" />
            </div>
            <div className="hidden md:flex flex-col">
              <h1 className="text-sm font-black text-text-primary tracking-widest uppercase leading-none">
                {courseName}
              </h1>
              <span className="text-[10px] text-accent-text font-bold uppercase tracking-widest mt-1">Active Session</span>
            </div>
          </div>
        </div>

        {/* Global Timer Section - Fixed in Header */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 md:gap-4">
          {mode === 'PRACTICE' && (
             <button 
               onClick={(e) => { e.stopPropagation(); togglePause(); }}
               className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-bg-raised border border-border-subtle flex items-center justify-center text-text-secondary hover:text-accent transition-[transform,opacity,box-shadow] transform active:scale-90"
               title="Pause Session"
             >
               {session.pausedAt ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
             </button>
          )}

          <div className={cn(
            "flex items-center gap-3 md:gap-6 px-3 md:px-6 py-1.5 md:py-2 border rounded-2xl backdrop-blur-md transition-[transform,opacity,box-shadow] duration-150 cursor-pointer select-none",
            isUrgent 
              ? "bg-danger-bg border-danger-border shadow-[0_0_20px_var(--danger-border)] animate-pulse" 
              : "bg-bg-raised border-border-subtle hover:bg-bg-raised",
            !showTimer && "opacity-50 grayscale"
          )}
          onClick={() => setShowTimer(!showTimer)}
          >
           <div className={cn(
             "hidden md:flex items-center gap-2",
             isUrgent ? "text-danger-text" : "text-text-secondary"
           )}>
              <Timer className={cn("w-4 h-4", isUrgent && "animate-spin-slow")} />
              <span className="text-[10px] font-black uppercase tracking-widest">Temporal</span>
           </div>
           
           <span className={cn(
             "text-lg md:text-xl font-mono font-black transition-[transform,opacity,box-shadow]",
             isUrgent ? "text-danger-text" : "text-text-primary",
             !showTimer && "blur-md select-none"
           )}>
            {timerText}
           </span>

           <div className="pl-3 md:pl-4 border-l border-border-subtle">
             {showTimer ? <Eye className="w-3.5 h-3.5 text-text-tertiary" /> : <EyeOff className="w-3.5 h-3.5 text-text-tertiary" />}
           </div>
        </div>
      </div>

        <div className="flex items-center gap-4">
           {/* Mobile Navigator Trigger */}
           <button 
             onClick={() => setIsMobileNavOpen(true)}
             className="lg:hidden p-2 text-text-secondary hover:text-text-primary focus:outline-none transition-colors rounded-lg hover:bg-bg-raised"
           >
             <Menu className="w-5 h-5" />
           </button>

           <ThemeToggle />
           <div className="hidden md:flex w-8 h-8 rounded-lg bg-bg-sunken border border-border-subtle items-center justify-center">
              <User className="w-4 h-4 text-accent" />
           </div>
        </div>
      </header>

      {/* Global Progress Bar */}
      <div className="w-full bg-surface-container-high h-1.5 shrink-0">
        <div 
          className="h-full bg-primary rounded-r-full transition-all duration-300 ease-out"
          style={{ width: `${(Object.keys(answers).length / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-8">
          <div className="grid grid-cols-12 gap-6 md:gap-8 items-start">
            {/* Left/Middle: Question Core */}
            <div className="col-span-12 lg:col-span-9 flex flex-col md:flex-row gap-6">

               {/* Question Arena */}
               <div className="flex-1 bg-bg-surface p-6 md:p-8 rounded-3xl border border-border-subtle shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-50" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] rotate-[-25deg] select-none text-4xl md:text-6xl font-black text-accent uppercase">
                    ENGINE SIMULATION
                  </div>

                  {flagged.has(currentIdx) && (
                    <div 
                      className="absolute top-0 left-0 right-0 bg-amber-500/10 border-b border-amber-500/20 py-2 px-6 md:px-8 flex items-center gap-2 z-20 backdrop-blur-sm"
                    >
                      <Flag className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Flagged for Verification</span>
                    </div>
                  )}

                  {isUrgent && (
                    <div 
                      className="absolute top-4 right-4 bg-danger-bg/80 border border-danger-border py-1 px-3 flex items-center gap-2 z-30 rounded-full backdrop-blur-md animate-pulse shadow-lg"
                    >
                      <Timer className="w-3 h-3 text-danger-text" />
                      <span className="text-[9px] font-black text-danger-text uppercase tracking-widest">Time Critical</span>
                    </div>
                  )}

                  <div className={cn("relative z-10 space-y-6 md:space-y-8", flagged.has(currentIdx) ? "mt-8" : "mt-0 md:mt-4")}>
                    <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-text-primary">Q{currentIdx + 1}</span>
                        <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest">/ {questions.length}</span>
                      </div>
                      
                      <button
                        onClick={toggleFlag}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-colors border",
                          flagged.has(currentIdx) ? "bg-amber-500 border-amber-500 text-white" : "border-border-subtle hover:border-border-medium hover:bg-bg-raised text-text-tertiary hover:text-text-primary"
                        )}
                      >
                        <Flag className={cn("w-3 h-3", flagged.has(currentIdx) ? "fill-white" : "fill-none")} />
                        {flagged.has(currentIdx) ? "Flagged" : "Flag"}
                      </button>
                    </div>

                    <p className="text-base md:text-lg text-text-primary leading-relaxed font-medium tracking-tight">
                      {currentQuestion.prompt}
                    </p>

                    {currentQuestion.type === 'MCQ' ? (
                      <div className="grid grid-cols-1 gap-4">
                        {currentQuestion.options?.map((opt, i) => {
                          const label = String.fromCharCode(65 + i) + '.';
                          return (
                            <QuizOption 
                              key={i}
                              id={`opt-${i}`} 
                              label={label} 
                              text={opt} 
                              selected={answers[currentIdx] === opt}
                              onSelect={() => handleAnswer(opt)}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <label className="block text-[10px] font-black text-accent-text uppercase tracking-widest">Input Response</label>
                        <input 
                          type="text"
                          value={answers[currentIdx] || ''}
                          onChange={(e) => handleAnswer(e.target.value)}
                          placeholder="Type your final result here..."
                          className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-6 py-4 text-text-primary focus:outline-none focus:border-accent transition-[transform,opacity,box-shadow] font-mono"
                        />
                        <p className="text-[10px] text-text-tertiary italic">Numerical answers must match specified precision (±0.01).</p>
                      </div>
                    )}
                  </div>
               </div>
            </div>

            {/* Right Coast: Navigation HUD (Desktop) */}
            <aside className="hidden lg:block lg:col-span-3">
               <div className="bg-bg-surface border border-border-subtle rounded-3xl p-6 shadow-xl sticky top-8">
                  {navigatorJSX}
               </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Controller Footer */}
      <footer className="fixed bottom-0 left-0 right-0 h-24 bg-bg-surface/90 backdrop-blur-2xl border-t border-border-subtle px-8 flex items-center justify-between z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.1)]">
         <button 
          onClick={prevQuestion}
          disabled={currentIdx === 0}
          className="group flex items-center gap-4 text-text-secondary hover:text-text-primary transition-[transform,opacity,box-shadow] disabled:opacity-20 disabled:cursor-not-allowed"
        >
            <div className="w-12 h-12 rounded-2xl bg-bg-raised border border-border-subtle flex items-center justify-center group-hover:bg-accent-muted group-hover:border-accent transition-[transform,opacity,box-shadow] group-hover:-translate-x-1 group-active:scale-95 shadow-sm">
              <ChevronLeft className="w-6 h-6" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Back</span>
              <span className="text-xs font-black uppercase tracking-widest">Recall Previous</span>
            </div>
         </button>
         
         <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end mr-6 text-right space-y-2">
               <div className="flex items-center justify-between w-48">
                  <span className="text-[9px] font-black text-text-tertiary uppercase tracking-widest leading-none">Global Progress</span>
                  <span className="text-[10px] font-black text-accent">{Math.round((Object.keys(answers).length / questions.length) * 100)}%</span>
               </div>
               <div className="w-48 h-2 bg-bg-sunken border border-border-subtle rounded-full overflow-hidden p-[1.5px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="h-full bg-accent rounded-full shadow-[0_0_25px_var(--accent),0_0_10px_var(--accent)] brightness-125" 
                  />
               </div>
            </div>
            <button 
              onClick={nextQuestion}
              className="px-10 py-4 bg-accent hover:bg-accent-hover text-bg-page text-xs font-black uppercase tracking-widest rounded-2xl shadow-[0_8px_20px_var(--accent-muted)] hover:shadow-[0_12px_24px_var(--accent-muted)] transition-[transform,opacity,box-shadow] hover:scale-[1.02] active:scale-95 flex items-center gap-3"
            >
              {currentIdx === questions.length - 1 ? 'Commit Verdict' : 'Next Question'}
              <ArrowRight className="w-4 h-4" />
            </button>
         </div>
      </footer>
    </motion.div>
  );
}

function StatusTag({ label, icon: Icon, color }: { label: string, icon: LucideIcon, color: string }) {
  return (
    <div className={cn("flex items-center gap-2 px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-[transform,opacity,box-shadow]", color)}>
      <Icon className="w-3 h-3" />
      {label}
    </div>
  );
}

function QuizOption({ id, label, text, selected, onSelect, key }: { id: string, label: string, text: string, selected: boolean, onSelect: () => void, key?: string | number }) {
  return (
    <button 
      onClick={onSelect}
      className={cn(
        "flex items-center gap-4 p-5 rounded-2xl border transition-[transform,opacity,box-shadow] duration-100 text-left group relative overflow-hidden",
        selected 
          ? "bg-accent-muted border-accent/30 shadow-[inset_0_0_20px_var(--accent-muted)]" 
          : "bg-bg-raised/30 border-border-subtle hover:bg-bg-raised/50 hover:border-border-medium"
      )}
    >
      <div className={cn(
        "w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-[transform,opacity,box-shadow]",
        selected ? "bg-accent border-accent" : "border-border-medium group-hover:border-accent/50"
      )}>
        {selected && <Check className="w-3 h-3 text-bg-page font-black" />}
      </div>
      <div className="flex gap-3 text-sm relative z-10">
        <span className={cn("font-black tracking-widest uppercase shrink-0 transition-colors", selected ? "text-accent-text" : "text-text-tertiary")}>{label}</span>
        <span className={cn("font-medium transition-colors", selected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary")}>{text}</span>
      </div>
    </button>
  );
}

function SidebarTab({ icon: Icon, label, active = false }: { icon: LucideIcon, label: string, active?: boolean }) {
  return (
    <button className={cn(
      "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-[transform,opacity,box-shadow]",
      active ? "bg-surface-container-highest text-primary border border-primary/20 shadow-[0_0_15px_theme(colors.primary/0.1)]" : "text-on-surface-variant hover:text-white"
    )}>
       <Icon className="w-4 h-4" />
       <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function OptionButton({ label, text, selected, onClick }: { label: string, text: string, selected: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl border transition-[transform,opacity,box-shadow] duration-100 relative overflow-hidden group",
        selected 
          ? "bg-surface-container-highest border-primary shadow-[0_0_15px_theme(colors.primary/0.1)]" 
          : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container-high hover:border-white/20"
      )}
    >
      {selected && <div className="absolute inset-0 bg-primary/2 pointer-events-none" />}
      <div className="flex items-center gap-4 relative z-10">
         <div className={cn(
           "w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold transition-[transform,opacity,box-shadow] shrink-0",
           selected ? "bg-primary border-primary text-slate-950" : "border-outline-variant/30 text-on-surface-variant group-hover:border-primary/50 group-hover:text-primary"
         )}>
           {label}
         </div>
         <span className={cn(
           "text-xs tracking-tight transition-colors flex-1 line-clamp-2",
           selected ? "text-white font-medium" : "text-on-surface-variant group-hover:text-on-surface"
         )}>
           {text}
         </span>
      </div>
    </button>
  );
}

function CommandBarItem({ icon: Icon, label }: { icon: LucideIcon, label: string }) {
  return (
    <button className="flex flex-col items-center gap-1 group px-4 py-2 hover:bg-white/5 rounded-xl transition-[transform,opacity,box-shadow]">
       <Icon className="w-5 h-5 text-on-surface-variant group-hover:text-primary group-hover:scale-110 transition-[transform,opacity,box-shadow]" />
       <span className="text-[9px] font-black uppercase tracking-widest text-outline group-hover:text-primary transition-colors">{label}</span>
    </button>
  );
}

function NavItem({ icon: Icon, label, active = false, expanded = false, onClick }: { icon: LucideIcon, label: string, active?: boolean, expanded: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center h-10 px-2 rounded-lg transition-[transform,opacity,box-shadow] group overflow-hidden relative",
        active ? "bg-accent-muted text-accent-text border-l-2 border-accent" : "text-text-tertiary hover:text-text-primary hover:bg-bg-raised"
      )}
    >
      <Icon className={cn("w-5 h-5 shrink-0 ml-0.5", active && "fill-accent/20")} />
      <span className={cn(
        "ml-4 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-opacity duration-100",
        expanded ? "opacity-100" : "opacity-0"
      )}>
        {label}
      </span>
    </button>
  );
}

function ModeCard({ title, description, tag, icon: Icon, color = 'primary', onClick }: { title: string, description: string, tag: string, icon: LucideIcon, color?: 'primary' | 'secondary' | 'tertiary', onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col text-left group bg-bg-surface rounded-2xl md:rounded-3xl p-4 md:p-5 border border-border-subtle hover:border-accent/40 hover:bg-bg-raised transition-[transform,opacity,box-shadow] duration-100 relative overflow-hidden h-auto min-h-40 md:min-h-44"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-accent-hover opacity-0 group-hover:opacity-100 transition-[transform,opacity,box-shadow]" />
      <div className="flex justify-between items-start mb-3 md:mb-5">
        <div className={cn(
          "w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl bg-bg-page flex items-center justify-center transition-transform duration-150 group-hover:scale-110 group-hover:rotate-6",
          color === 'primary' ? 'text-accent' : color === 'secondary' ? 'text-accent-text' : 'text-accent'
        )}>
          <Icon className="w-4 h-4 md:w-5 md:h-5" />
        </div>
        <span className="px-2 md:px-3 py-0.5 md:py-1 rounded-full bg-bg-page text-[8px] md:text-[9px] font-black uppercase tracking-widest text-text-secondary border border-border-subtle">
          {tag}
        </span>
      </div>
      <h3 className="text-base md:text-lg font-bold mb-1.5 md:mb-2 text-text-primary group-hover:translate-x-1 transition-transform">{title}</h3>
      <p className="text-[10px] md:text-[11px] text-text-secondary leading-relaxed mb-3 md:mb-4 opacity-70 group-hover:opacity-100 transition-opacity line-clamp-3">
        {description}
      </p>
      <div className="mt-auto flex items-center text-[9px] md:text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity  text-text-tertiary">
        <span className="mr-2">&mdash;</span> Enter Mode
      </div>
    </button>
  );
}

function TopicCard({ topic, active, onClick }: { topic: Topic, active: boolean, onClick: () => void, key?: string | number }) {
  // Map hardcoded icons for demo
  const getIcon = (name: string) => {
    if (name.includes('Rate')) return Sigma;
    if (name.includes('Arrhenius')) return Thermometer;
    if (name.includes('Reactor')) return FlaskConical;
    if (name.includes('Enzyme')) return Microscope;
    return Activity;
  };

  const Icon = getIcon(topic.name);

  return (
    <button 
      onClick={onClick}
      className={cn(
        "group flex flex-col p-4 md:p-5 rounded-2xl transition-[transform,opacity,box-shadow] duration-100 relative overflow-hidden h-auto min-h-36 md:min-h-40 text-left",
        active 
          ? "bg-accent-muted border-2 border-accent" 
          : "bg-surface-container-high border border-border-subtle hover:border-accent/30"
      )}
    >
      {active && <div className="absolute top-0 right-0 w-20 md:w-24 h-20 md:h-24 bg-accent/10 blur-3xl rounded-full" />}
      <div className="flex justify-between items-start mb-auto">
        <div className={cn(
          "w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center transition-colors",
          active ? "bg-accent text-bg-page" : "bg-bg-page text-text-tertiary group-hover:text-accent-text"
        )}>
          <Icon className="w-4 h-4 md:w-5 md:h-5" />
        </div>
        <div className="flex gap-1.5">
           <span className={cn(
             "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]",
             topic.difficulty === 'Easy' ? 'bg-success-text text-success-text' : topic.difficulty === 'Medium' ? 'bg-warning-text text-warning-text' : 'bg-danger-text text-danger-text'
           )} />
        </div>
      </div>

      <div className="mt-3 md:mt-0">
        <h3 className="text-sm md:text-base font-bold mb-3 md:mb-4 tracking-tight leading-tight text-text-primary">{topic.name}</h3>
        <div className="pt-3 md:pt-4 border-t border-border-subtle space-y-1.5 md:space-y-2">
          <div className="flex justify-between items-center text-[9px] md:text-[10px] font-black tracking-widest uppercase">
            <span className={active ? "text-accent-text" : "text-text-tertiary"}>{topic.questionsCount} Questions</span>
            <span className={active ? "text-accent-text" : "text-text-tertiary"}>{topic.mastery}% Mastery</span>
          </div>
          <div className="w-full h-1 bg-bg-sunken rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${topic.mastery}%` }}
              className={cn("h-full rounded-full transition-colors", active ? "bg-accent" : "bg-text-tertiary/40")}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
