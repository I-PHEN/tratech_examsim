/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { useAuth } from './lib/AuthContext';
import { RichText } from './components/ui/RichText';
import 'katex/dist/katex.min.css';
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
  Database,
  LogOut,
  Globe,
  Plus,
  Minus,
  AlertTriangle,
  MoreVertical,
  PauseCircle,
  StopCircle
} from 'lucide-react';
import { AppState, StudyMode, Course, Topic, Question, TimerSession } from './types';
import { cn } from './lib/utils';
import { MySessionsScreen } from './components/MySessionsScreen';
import { PerformanceScreen } from './components/PerformanceScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { HelpScreen } from './components/HelpScreen';
import { Button } from './components/ui/Button';
import { Card } from './components/ui/Card';
import { EmptyState } from './components/ui/EmptyState';
import { Spinner } from './components/ui/Spinner';
import { SectionHeader } from './components/ui/SectionHeader';
import { Pill } from './components/ui/Pill';
import { NavItem } from './components/ui/NavItem';
import { ModeCard } from './components/ui/ModeCard';
import { TopicCard } from './components/ui/TopicCard';
import { NotificationsBell } from './components/NotificationsBell';
import { ApiError, apiDelete, apiGet, apiPost } from './lib/apiClient';
import { Loader2 } from 'lucide-react';

interface ApiProgramCourse {
  id: string;
  year_level: number;
  semester: number;
  courses: { name: string; code: string };
  programs: { name: string; code: string };
}

interface ApiTopic {
  id: string;
  name: string;
  description?: string | null;
}

interface ApiAsset {
  id: string;
  url: string;
  mime_type: string;
  position: number;
}

interface ApiOption {
  id: string;
  text: string;
  is_correct: boolean;
}

interface ApiContent {
  prompt: string;
  explanation?: string | null;
  correct_answer?: string | null;
  answer_tolerance?: number | null;
  unit?: string | null;
}

interface ApiQuestion {
  id: string;
  type: 'mcq' | 'calc';
  difficulty: 'easy' | 'medium' | 'hard';
  exam_scope: 'midsem' | 'final' | 'both';
  topic_id: string;
  answer_type: 'exact' | 'range' | null;
  content: ApiContent;
  options?: ApiOption[];
  assets: ApiAsset[];
}

interface ApiSessionCreated {
  session_id: string;
  picked: ApiQuestion[];
}

function yearStringToNumber(y: string): number {
  return parseInt(y.replace(/\D/g, ''), 10) || 1;
}
function semStringToNumber(s: string): number {
  return parseInt(s.replace(/\D/g, ''), 10) || 1;
}
function modeToApi(m: StudyMode): 'practice' | 'diagnostic' | 'midsem' | 'full_exam' {
  if (m === 'PRACTICE') return 'practice';
  if (m === 'DIAGNOSTIC') return 'diagnostic';
  if (m === 'MIDSEM') return 'midsem';
  return 'full_exam';
}

function apiToMode(m: 'practice' | 'diagnostic' | 'midsem' | 'full_exam'): StudyMode {
  if (m === 'practice') return 'PRACTICE';
  if (m === 'diagnostic') return 'DIAGNOSTIC';
  if (m === 'midsem') return 'MIDSEM';
  return 'FULL_EXAM';
}

function apiQuestionToFrontend(q: ApiQuestion, idx: number): Question {
  if (q.type === 'mcq') {
    return {
      id: q.id,
      type: 'MCQ',
      prompt: q.content.prompt,
      options: (q.options ?? []).map((o) => o.text),
      optionIds: (q.options ?? []).map((o) => o.id),
      correctOptionId: (q.options ?? []).find((o) => o.is_correct)?.id,
      marks: 1,
      assets: q.assets,
    };
  }
  return {
    id: q.id,
    type: 'INPUT',
    prompt: q.content.prompt,
    correctAnswer: q.content.correct_answer ?? undefined,
    marks: 1,
    assets: q.assets,
  };
}

async function* streamOpenRouter(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok || !response.body) throw new Error(`AI proxy error: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const text = JSON.parse(data).choices?.[0]?.delta?.content || '';
        if (text) yield text;
      } catch {}
    }
  }
}

const ACCENT_COLORS: Record<string, { light: any, dark: any }> = {
  blue: {
    light: { accent: '#5B6CF9', hover: '#4A5AE8', muted: '#5B6CF914', text: '#3A48D4' },
    dark: { accent: '#7B8CFA', hover: '#8F9EFB', muted: '#7B8CFA18', text: '#A0ADFB' }
  },
  green: {
    light: { accent: '#10B981', hover: '#059669', muted: '#10B98114', text: '#047857' },
    dark: { accent: '#34D399', hover: '#6EE7B7', muted: '#34D39918', text: '#A7F3D0' }
  },
  purple: {
    light: { accent: '#8B5CF6', hover: '#7C3AED', muted: '#8B5CF614', text: '#6D28D9' },
    dark: { accent: '#A78BFA', hover: '#C4B5FD', muted: '#A78BFA18', text: '#DDD6FE' }
  },
  rose: {
    light: { accent: '#F43F5E', hover: '#E11D48', muted: '#F43F5E14', text: '#BE123C' },
    dark: { accent: '#FB7185', hover: '#FDA4AF', muted: '#FB718518', text: '#FECDD3' }
  },
  orange: {
    light: { accent: '#F97316', hover: '#EA580C', muted: '#F9731614', text: '#C2410C' },
    dark: { accent: '#FB923C', hover: '#FDBA74', muted: '#FB923C18', text: '#FED7AA' }
  },
  yellow: {
    light: { accent: '#EAB308', hover: '#CA8A04', muted: '#EAB30814', text: '#A16207' },
    dark: { accent: '#FDE047', hover: '#FEF08A', muted: '#FDE04718', text: '#FEF9C3' }
  }
};

export default function App() {
  const navigate = useNavigate();
  const { currentUser, isAdmin, userProfile, updateProfileLocal } = useAuth();
  
  useEffect(() => {
    const handleThemeChange = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const colorId = userProfile?.themeAccent || 'blue';
      const selectedColor = ACCENT_COLORS[colorId] || ACCENT_COLORS['blue'];
      const themeColors = isDark ? selectedColor.dark : selectedColor.light;
      
      const COMPLEMENTARY_MAP: Record<string, string> = {
        blue: 'orange',
        green: 'rose',
        purple: 'yellow',
        rose: 'green',
        orange: 'blue',
        yellow: 'purple'
      };
      
      const compId = COMPLEMENTARY_MAP[colorId] || 'orange';
      const compColor = ACCENT_COLORS[compId] || ACCENT_COLORS['orange'];
      const compThemeColors = isDark ? compColor.dark : compColor.light;
      
      document.documentElement.style.setProperty('--accent', themeColors.accent);
      document.documentElement.style.setProperty('--accent-hover', themeColors.hover);
      document.documentElement.style.setProperty('--accent-muted', themeColors.muted);
      document.documentElement.style.setProperty('--accent-text', themeColors.text);
      
      document.documentElement.style.setProperty('--accent-danger', compThemeColors.accent);
      document.documentElement.style.setProperty('--accent-danger-text', compThemeColors.text);
    };

    handleThemeChange();

    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-hover');
      document.documentElement.style.removeProperty('--accent-muted');
      document.documentElement.style.removeProperty('--accent-text');
      document.documentElement.style.removeProperty('--accent-danger');
      document.documentElement.style.removeProperty('--accent-danger-text');
    };
  }, [userProfile?.themeAccent]);

  const initialYear = userProfile?.year ? (userProfile.year.startsWith("Year") ? userProfile.year : `Year ${userProfile.year}`) : 'Year 3';
  const initialSem = userProfile?.semester ? (userProfile.semester.startsWith("Sem") ? userProfile.semester : `Sem ${userProfile.semester}`) : 'Sem 1';

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  const [state, setState] = useState<AppState>({
    step: 'MODE_SELECT',
    mode: null,
    selectedCourse: null,
    selectedTopic: null,
    difficulty: 'Medium',
    questionCount: 10,
    practiceTimeLimit: 20,
    year: initialYear as any,
    semester: initialSem as any
  });

  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [recentSessions, setRecentSessions] = useState<Array<{
    id: string;
    course_name: string | null;
    topic_name: string | null;
    mode: 'practice' | 'diagnostic' | 'midsem' | 'full_exam';
    accuracy: number | null;
    score: number | null;
    total_questions: number;
    started_at: string;
    finished_at: string | null;
    paused_at: string | null;
    program_course_id: string;
  }>>([]);
  const [weaknesses, setWeaknesses] = useState<Array<{
    topic_id: string;
    topic_name: string | null;
    attempts: number;
    correct: number;
    accuracy: number;
  }>>([]);

  // Practice ready-screen ephemeral state
  const [practiceTimeRaw, setPracticeTimeRaw] = useState<string>('20');
  const [practiceTimeUserSet, setPracticeTimeUserSet] = useState(false);
  const [startingExam, setStartingExam] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<{ sessionId: string; questions: Question[]; prefilledAnswers?: Record<number, string> } | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const yl = yearStringToNumber(state.year);
    const sm = semStringToNumber(state.semester);
    setCoursesLoading(true);
    apiGet<ApiProgramCourse[]>(
      `/api/program-courses?year_level=${yl}&semester=${sm}`
    )
      .then((rows) => {
        if (cancelled) return;
        setAvailableCourses(
          rows.map((r) => ({
            id: r.id,
            name: r.courses?.name ?? 'Unknown course',
            description: r.programs?.name ?? '',
            year: state.year,
            semester: state.semester,
          }))
        );
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('Failed to load courses', e);
        setAvailableCourses([]);
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.year, state.semester]);

  useEffect(() => {
    let cancelled = false;
    if (!state.selectedCourse?.id) {
      setAvailableTopics([]);
      setTopicsLoading(false);
      return;
    }
    setTopicsLoading(true);
    apiGet<ApiTopic[]>(`/api/topics?program_course_id=${state.selectedCourse.id}`)
      .then((rows) => {
        if (!cancelled) setAvailableTopics(rows.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('Failed to load topics', e);
        setAvailableTopics([]);
      })
      .finally(() => {
        if (!cancelled) setTopicsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.selectedCourse?.id]);

  useEffect(() => {
    if (state.step !== 'MODE_SELECT') return;
    // Pull more than we display so the 24h transience filter still leaves
    // a useful row count, and so the Resume banner can find in-progress rows.
    apiGet<typeof recentSessions>('/api/sessions?limit=12')
      .then(setRecentSessions)
      .catch(() => setRecentSessions([]));
  }, [state.step]);

  useEffect(() => {
    if (state.step !== 'TARGETED_PRACTICE') return;
    // Scope weakness suggestions to the user's current academic period so
    // they aren't seeing last year's weak topics on a fresh dashboard.
    const yl = yearStringToNumber(state.year);
    const sem = semStringToNumber(state.semester);
    apiGet<typeof weaknesses>(`/api/analytics/by-topic?year_level=${yl}&semester=${sem}`)
      .then((rows) => {
        const sorted = rows
          .filter((r) => r.attempts > 0)
          .sort((a, b) => a.accuracy - b.accuracy)
          .slice(0, 5);
        setWeaknesses(sorted);
      })
      .catch(() => setWeaknesses([]));
  }, [state.step, state.year, state.semester]);

  // Purge any legacy resume blob from previous app versions
  useEffect(() => {
    if (state.step === 'MODE_SELECT') {
      localStorage.removeItem('active_exam');
    }
  }, [state.step]);

  useEffect(() => {
    if (userProfile) {
      const year = userProfile.year ? (userProfile.year.startsWith("Year") ? userProfile.year : `Year ${userProfile.year}`) : 'Year 3';
      const semester = userProfile.semester ? (userProfile.semester.startsWith("Sem") ? userProfile.semester : `Sem ${userProfile.semester}`) : 'Sem 1';
      setState(p => ({ ...p, year: year as any, semester: semester as any }));
    }
  }, [userProfile]);

  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isRecentActivitiesOpen, setIsRecentActivitiesOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<'year' | 'semester' | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        profileMenuRef.current && 
        !profileMenuRef.current.contains(event.target as Node) &&
        profileButtonRef.current &&
        !profileButtonRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

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

  const setQuestionCount = (n: number) => {
    const clamped = Math.max(1, Math.min(50, Math.floor(n)));
    setState(prev => {
      const next: AppState = { ...prev, questionCount: clamped };
      if (!practiceTimeUserSet) {
        next.practiceTimeLimit = Math.max(1, clamped * 2);
      }
      return next;
    });
    if (!practiceTimeUserSet) {
      setPracticeTimeRaw(String(Math.max(1, clamped * 2)));
    }
  };

  const handleCourseSelect = (course: Course) => {
    setStartError(null);
    setActiveSession(null);
    if (state.mode === 'PRACTICE') {
      setAvailableTopics([]);
      setTopicsLoading(true);
      setState(prev => ({ ...prev, selectedCourse: course, step: 'TOPIC_SELECT' }));
    } else {
      setState(prev => ({ ...prev, selectedCourse: course, step: 'READY' }));
    }
  };

  const persistYearSemester = (next: { year?: string; semester?: string }) => {
    setState(prev => ({
      ...prev,
      ...(next.year ? { year: next.year as any } : {}),
      ...(next.semester ? { semester: next.semester as any } : {}),
    }));
    updateProfileLocal(next);
    if (currentUser) {
      updateDoc(doc(db, 'users', currentUser.uid), next).catch((e) => {
        console.error('Failed to persist year/semester to Firestore', e);
      });
    }
  };

  const handleTopicSelect = (topic: Topic) => {
    setStartError(null);
    setActiveSession(null);
    setState(prev => ({ ...prev, selectedTopic: topic, step: 'READY' }));
  };

  const startExam = async () => {
    if (!state.selectedCourse?.id || !state.mode) return;
    setStartError(null);
    setStartingExam(true);
    try {
      const res = await apiPost<ApiSessionCreated>('/api/sessions', {
        program_course_id: state.selectedCourse.id,
        mode: modeToApi(state.mode),
        ...(state.selectedTopic?.id ? { topic_id: state.selectedTopic.id } : {}),
        ...(state.mode === 'PRACTICE' ? { count: state.questionCount } : {}),
      });
      const questions = res.picked.map((q, i) => apiQuestionToFrontend(q, i));
      setActiveSession({ sessionId: res.session_id, questions });
      setState(prev => ({ ...prev, step: 'EXAM' }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NO_QUESTIONS') {
        setStartError(
          'No questions yet for this course' +
            (state.selectedTopic ? ` / topic (${state.selectedTopic.name})` : '') +
            '. Ask an admin to add some via Manual Entry, or try a different topic.'
        );
      } else if (e instanceof ApiError) {
        setStartError(e.message);
      } else {
        setStartError(e instanceof Error ? e.message : 'Something went wrong, try again.');
      }
    } finally {
      setStartingExam(false);
    }
  };

  const finishExam = (sessionId: string) => {
    setActiveSession(null);
    setState(prev => ({
      ...prev,
      step: 'REVIEW',
      reviewSessionId: sessionId,
    }));
  };

  const goBack = () => {
    setStartError(null);
    if (state.returnStep) {
      const step = state.returnStep;
      setState(prev => ({ ...prev, step, returnStep: undefined, reviewSessionId: undefined }));
      return;
    }

    if (state.step === 'COURSE_SELECT') setState(prev => ({ ...prev, step: 'MODE_SELECT', mode: null }));
    if (state.step === 'TOPIC_SELECT') setState(prev => ({ ...prev, step: 'COURSE_SELECT', selectedCourse: null }));
    if (state.step === 'READY') {
      if (state.mode === 'PRACTICE' || state.mode === 'DIAGNOSTIC') setState(prev => ({ ...prev, step: 'TOPIC_SELECT', selectedTopic: null }));
      else setState(prev => ({ ...prev, step: 'COURSE_SELECT', selectedCourse: null }));
    }
    if (state.step === 'EXAM' || state.step === 'REVIEW') {
      setActiveSession(null);
      setState(prev => ({ ...prev, step: 'MODE_SELECT', mode: null, selectedCourse: null, selectedTopic: null, reviewSessionId: undefined }));
    }
    if (state.step === 'TARGETED_PRACTICE' || state.step === 'SESSIONS_HISTORY' || state.step === 'PERFORMANCE' || state.step === 'SETTINGS' || state.step === 'HELP') {
      setState(prev => ({ ...prev, step: 'MODE_SELECT', mode: null, selectedCourse: null, selectedTopic: null, reviewSessionId: undefined }));
    }
  };

  return (
    <div className="fixed inset-0 flex bg-surface-dim overflow-hidden font-sans">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55] md:hidden"
        />
      )}

      {openSelect && (
        <>
          <div
            onClick={() => setOpenSelect(null)}
            className="fixed inset-0 bg-transparent z-[60] md:hidden"
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-bg-surface border-t border-border-subtle rounded-t-3xl z-[70] p-4 pb-8 md:hidden flex flex-col shadow-2xl"
          >
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1.5 bg-border-medium rounded-full" />
            </div>
            
            <div className="w-full space-y-1">
              {(openSelect === 'year' ? ['Year 1', 'Year 2', 'Year 3', 'Year 4'] : ['Sem 1', 'Sem 2']).map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    persistYearSemester(openSelect === 'year' ? { year: item } : { semester: item });
                    if (openSelect === 'year') {
                      setTimeout(() => setOpenSelect('semester'), 50);
                    } else {
                      setTimeout(() => setOpenSelect(null), 50);
                    }
                  }}
                  className="w-full flex items-center justify-between gap-4 p-3 hover:bg-bg-raised rounded-xl transition-colors active:scale-95"
                >
                  <span className="font-semibold text-sm text-text-primary">{item}</span>
                  <div className={cn(
                    "w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
                    state[openSelect!] === item ? "border-accent bg-transparent" : "border-border-medium"
                  )}>
                     {state[openSelect!] === item && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Sidebar - Hidden during focus modes */}
      {state.step !== 'EXAM' && state.step !== 'REVIEW' && (
        <nav 
          onClick={() => {
            if (!isSidebarExpanded && !isMobileMenuOpen) {
              setIsSidebarExpanded(true);
            }
          }}
          className={cn(
            "bg-bg-surface border-r border-border-subtle transition-[width,transform] duration-200 ease-out z-[60] flex flex-col pt-4 overflow-visible h-full will-change-transform",
            !isSidebarExpanded && !isMobileMenuOpen ? "cursor-pointer" : "cursor-default",
            "fixed inset-y-0 left-0 md:relative",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
            isSidebarExpanded || isMobileMenuOpen ? "w-64" : "w-16"
          )}
        >
            <div className="px-3 mb-8 flex items-center gap-2 h-10 shrink-0 overflow-hidden cursor-default" onClick={(e) => e.stopPropagation()}>
              <button 
                onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-text-secondary hover:text-text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
                title="Toggle Sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className={cn(
                "flex flex-col whitespace-nowrap transition-opacity duration-100",
                isSidebarExpanded || isMobileMenuOpen ? "opacity-100 " : "opacity-0"
              )}>
                <span className="text-base font-display italic text-text-primary leading-tight">The Engine</span>
                <span className="text-[10px] text-text-tertiary uppercase tracking-[0.18em] leading-none">Stoic Performance</span>
              </div>
            </div>

            <div className="flex-1 px-3 space-y-2">
              <NavItem onClick={() => { setState(p => ({ ...p, returnStep: undefined, step: 'MODE_SELECT' })); setIsMobileMenuOpen(false); }} icon={Home} label="Home" active={state.step !== 'TARGETED_PRACTICE' && state.step !== 'SESSIONS_HISTORY' && state.step !== 'PERFORMANCE' && state.step !== 'SETTINGS' && state.step !== 'HELP'} expanded={isSidebarExpanded || isMobileMenuOpen} />
              <NavItem onClick={() => { setState(p => ({ ...p, returnStep: p.step, step: 'TARGETED_PRACTICE' })); setIsMobileMenuOpen(false); }} icon={Target} label="Targeted Practice" active={state.step === 'TARGETED_PRACTICE'} expanded={isSidebarExpanded || isMobileMenuOpen} />
              <NavItem onClick={() => { setState(p => ({ ...p, returnStep: p.step, step: 'SESSIONS_HISTORY' })); setIsMobileMenuOpen(false); }} icon={History} label="My Sessions" active={state.step === 'SESSIONS_HISTORY'} expanded={isSidebarExpanded || isMobileMenuOpen} />
              <NavItem onClick={() => { setState(p => ({ ...p, returnStep: p.step, step: 'PERFORMANCE' })); setIsMobileMenuOpen(false); }} icon={Activity} label="Performance" active={state.step === 'PERFORMANCE'} expanded={isSidebarExpanded || isMobileMenuOpen} />
            </div>

            <div className="mt-auto relative">
              
              {isProfileMenuOpen && (
                  <div 
                    ref={profileMenuRef}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                    "absolute z-50 flex flex-col animate-fade-in shadow-2xl bg-bg-raised border border-border-medium rounded-2xl p-2",
                    isSidebarExpanded || isMobileMenuOpen ? "bottom-full left-3 w-[calc(100%-1.5rem)] mb-2 origin-bottom" : "bottom-0 left-full ml-2 w-64 origin-bottom-left"
                  )}>
                     <div className="px-3 py-2 border-b border-border-subtle mb-1">
                        <span className="text-sm font-semibold text-text-primary truncate block">{currentUser?.email || 'User'}</span>
                     </div>
                     <button onClick={() => { setIsProfileMenuOpen(false); setIsMobileMenuOpen(false); setState(p => ({ ...p, returnStep: p.step, step: 'SETTINGS' })); }} className="flex items-center gap-3 px-3 py-2 hover:bg-bg-raised/50 rounded-xl transition-colors text-text-secondary hover:text-text-primary text-sm font-medium w-full text-left">
                        <Settings className="w-4 h-4" />
                        Settings
                     </button>
                     <button onClick={() => { setIsProfileMenuOpen(false); setIsMobileMenuOpen(false); setState(p => ({ ...p, returnStep: p.step, step: 'HELP' })); }} className="flex items-center gap-3 px-3 py-2 hover:bg-bg-raised/50 rounded-xl transition-colors text-text-secondary hover:text-text-primary text-sm font-medium w-full text-left mb-1">
                        <HelpCircle className="w-4 h-4" />
                        Get help
                     </button>
                     <div className="border-t border-white/5 my-1" />
                     <button onClick={() => { setIsProfileMenuOpen(false); handleLogout(); }} className="flex items-center gap-3 px-3 py-2 hover:bg-danger/10 text-danger-text rounded-xl transition-colors text-sm font-medium w-full text-left mt-1">
                        <LogOut className="w-4 h-4" />
                        Log out
                     </button>
                  </div>
              )}

              <div className="px-3 pb-6 space-y-2">
                {isAdmin && (
                  <NavItem onClick={() => { navigate('/admin'); setIsMobileMenuOpen(false); }} icon={Database} label="System Admin" expanded={isSidebarExpanded || isMobileMenuOpen} />
                )}
                
                <div className="pt-4 border-t border-border-subtle flex flex-col gap-3 mt-2">
                  <button 
                    ref={profileButtonRef}
                    onClick={(e) => { e.stopPropagation(); setIsProfileMenuOpen(!isProfileMenuOpen); }}
                    className="flex items-center gap-3 w-full hover:bg-surface-container-high p-1 rounded-xl transition-colors cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-primary/20 overflow-hidden"
                  >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-primary font-bold text-xs uppercase">{currentUser?.email?.charAt(0) || 'U'}</span>
                  </div>
                  <div className={cn(
                    "flex flex-col whitespace-nowrap transition-opacity duration-100 min-w-0 flex-1",
                    isSidebarExpanded || isMobileMenuOpen ? "opacity-100" : "opacity-0 hidden w-0" 
                  )}>
                    <span className="text-sm font-semibold text-text-primary truncate">{currentUser?.email || 'User'}</span>
                    <span className="text-xs text-text-tertiary">Candidate</span>
                  </div>
                </button>
              </div>
              </div>
            </div>
          </nav>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {state.step === 'EXAM' ? (
          activeSession ? (
            <ExamSimulation
              onBack={goBack}
              onFinish={finishExam}
              onTerminate={() => {
                setActiveSession(null);
                setState(prev => ({
                  ...prev,
                  step: 'MODE_SELECT',
                  mode: null,
                  reviewSessionId: undefined,
                }));
                // Refresh dashboard data so the terminated row is gone.
                apiGet<typeof recentSessions>('/api/sessions?limit=12')
                  .then(setRecentSessions)
                  .catch(() => {});
              }}
              courseName={state.selectedCourse?.name || 'Session'}
              mode={state.mode!}
              sessionId={activeSession.sessionId}
              questions={activeSession.questions}
              practiceTimeLimit={state.practiceTimeLimit}
              prefilledAnswers={activeSession.prefilledAnswers}
            />
          ) : null
        ) : state.step === 'REVIEW' && state.reviewSessionId ? (
          <ReviewScreen
            sessionId={state.reviewSessionId}
            onBack={goBack}
            courseName={state.selectedCourse?.name || 'Session'}
          />
        ) : state.step === 'SESSIONS_HISTORY' ? (
          <MySessionsScreen
             onBack={goBack}
             onReview={(id) => {
               setState(prev => ({
                 ...prev,
                 step: 'REVIEW',
                 returnStep: 'SESSIONS_HISTORY',
                 reviewSessionId: id,
               }));
             }}
          />
        ) : state.step === 'PERFORMANCE' ? (
          <PerformanceScreen
             onBack={goBack}
             yearLevel={yearStringToNumber(state.year)}
             semester={semStringToNumber(state.semester)}
          />
        ) : state.step === 'SETTINGS' ? (
          <SettingsScreen 
             onBack={goBack}
          />
        ) : state.step === 'HELP' ? (
          <HelpScreen 
             onBack={goBack}
          />
        ) : (
          <>
            {/* Header */}
        <header className="h-20 flex items-center justify-between px-4 md:px-8 bg-surface-container-low/50 backdrop-blur-md sticky top-0 z-40 border-b border-outline-variant">
          <div className="flex items-center gap-3 md:gap-6">
            {state.step === 'MODE_SELECT' || state.step === 'TARGETED_PRACTICE' ? (
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
                   <span className="hidden md:inline-block text-[10px] text-text-tertiary font-semibold uppercase tracking-[0.18em] pl-1 mb-1">Year</span>
                   {/* Desktop Select */}
                   <select
                     value={state.year}
                     onChange={(e) => persistYearSemester({ year: e.target.value })}
                     className="hidden md:block appearance-none bg-bg-surface border border-border-subtle rounded-xl px-3 py-1.5 text-sm font-semibold text-text-primary cursor-pointer focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors pr-8 hover:border-border-medium"
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
                       "md:hidden flex items-center justify-between w-full bg-bg-surface border rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                       openSelect === 'year' ? "border-accent text-accent-text" : "border-border-subtle text-text-primary"
                     )}
                   >
                     {state.year}
                     <ChevronDown className={cn("w-3 h-3", openSelect === 'year' ? "text-primary" : "text-text-secondary")} />
                   </button>
                </div>
                <div className="flex flex-col relative w-[6rem] md:w-36">
                   <span className="hidden md:inline-block text-[10px] text-text-tertiary font-semibold uppercase tracking-[0.18em] pl-1 mb-1">Semester</span>
                   {/* Desktop Select */}
                   <select
                     value={state.semester}
                     onChange={(e) => persistYearSemester({ semester: e.target.value })}
                     className="hidden md:block appearance-none bg-bg-surface border border-border-subtle rounded-xl px-3 py-1.5 text-sm font-semibold text-text-primary cursor-pointer focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors pr-8 hover:border-border-medium"
                   >
                     <option value="Sem 1" className="bg-bg-page text-text-primary">Sem 1</option>
                     <option value="Sem 2" className="bg-bg-page text-text-primary">Sem 2</option>
                   </select>
                   <ChevronDown className="hidden md:block absolute right-1.5 md:right-2 bottom-1.5 md:bottom-2 w-3 h-3 md:w-4 md:h-4 text-text-secondary pointer-events-none" />

                   {/* Mobile Button */}
                   <button 
                     onClick={() => setOpenSelect('semester')}
                     className={cn(
                       "md:hidden flex items-center justify-between w-full bg-bg-surface border rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                       openSelect === 'semester' ? "border-accent text-accent-text" : "border-border-subtle text-text-primary"
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
          <div className="flex items-center gap-1 md:gap-2">
            <ThemeToggle />
            <NotificationsBell />
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-6 pb-8">
          <div className="max-w-5xl mx-auto">
              {state.step === 'MODE_SELECT' && (
                <div className="space-y-6">
                  <SectionHeader
                    size="lg"
                    eyebrow={`${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${userProfile?.preferredName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Engineer'}`}
                    title="What do you want to tackle today?"
                  />

                  {/* Resume banner: any in-progress session is resumable from any
                      device — we fetch /resume to rehydrate questions + answers
                      from the server, not localStorage. */}
                  {(() => {
                    const pending = recentSessions.find((s) => s.finished_at === null);
                    if (!pending) return null;
                    const onResume = async () => {
                      setResumingId(pending.id);
                      setResumeError(null);
                      try {
                        const data = await apiGet<{
                          session: {
                            id: string;
                            program_course_id: string;
                            mode: 'practice' | 'diagnostic' | 'midsem' | 'full_exam';
                            course_name: string | null;
                          };
                          picked_questions: ApiQuestion[];
                          answered: Array<{
                            position: number;
                            picked_option_id: string | null;
                            picked_text: string | null;
                          }>;
                        }>(`/api/sessions/${pending.id}/resume`);

                        const questions = data.picked_questions.map((q, i) => apiQuestionToFrontend(q, i));
                        if (questions.length === 0) {
                          // Legacy row from before we persisted question_ids; nothing
                          // to rehydrate. Surface the situation instead of dropping
                          // the user into a blank exam screen.
                          setResumeError(
                            "This session can't be resumed (missing question data). Discard it to start a fresh session."
                          );
                          return;
                        }
                        const prefilledAnswers: Record<number, string> = {};
                        for (const a of data.answered) {
                          const q = data.picked_questions[a.position];
                          if (!q) continue;
                          if (q.type === 'mcq' && a.picked_option_id) {
                            const opt = (q.options ?? []).find((o) => o.id === a.picked_option_id);
                            if (opt) prefilledAnswers[a.position] = opt.text;
                          } else if (a.picked_text != null) {
                            prefilledAnswers[a.position] = a.picked_text;
                          }
                        }

                        setActiveSession({
                          sessionId: pending.id,
                          questions,
                          prefilledAnswers,
                        });
                        setState((prev) => ({
                          ...prev,
                          step: 'EXAM',
                          mode: apiToMode(data.session.mode),
                          selectedCourse:
                            prev.selectedCourse?.id === data.session.program_course_id
                              ? prev.selectedCourse
                              : { id: data.session.program_course_id, name: data.session.course_name ?? 'Session' },
                        }));
                      } catch (e) {
                        setResumeError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setResumingId(null);
                      }
                    };

                    const onDiscard = async () => {
                      setResumingId(pending.id);
                      setResumeError(null);
                      try {
                        await apiDelete(`/api/sessions/${pending.id}`);
                        const rows = await apiGet<typeof recentSessions>('/api/sessions?limit=12');
                        setRecentSessions(rows);
                      } catch (e) {
                        setResumeError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setResumingId(null);
                      }
                    };

                    return (
                      <Card
                        variant="default"
                        padding="md"
                        className="border-accent/40 bg-accent-muted/40 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-accent text-slate-950 flex items-center justify-center shrink-0">
                            <PauseCircle className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">
                              Continue your {pending.course_name ?? 'in-progress'} exam {pending.paused_at ? '— paused' : '— in progress'}
                            </p>
                            <p className="text-[11px] text-text-secondary">
                              {pending.mode.replace('_', ' ').toUpperCase()} · {pending.total_questions} question{pending.total_questions === 1 ? '' : 's'}
                            </p>
                            {resumeError && (
                              <p className="text-[11px] text-[color:var(--accent-danger)] mt-1">{resumeError}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onDiscard}
                            disabled={resumingId === pending.id}
                            title="Discard this session"
                          >
                            Discard
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={onResume}
                            disabled={resumingId === pending.id}
                          >
                            {resumingId === pending.id ? 'Resuming…' : 'Resume'}
                          </Button>
                        </div>
                      </Card>
                    );
                  })()}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <ModeCard 
                      title="Practice by Topic" 
                      description="Target specific weaknesses. Choose concepts and set your own pace without time pressure."
                      tag="Flexible"
                      icon={Microscope}
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

                  {/* Recent Performance Section directly on dashboard.
                      Transient by design: only shows sessions from the last 24h. */}
                  {(() => {
                    const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
                    const cutoff = Date.now() - RECENT_WINDOW_MS;
                    const recent24 = recentSessions
                      .filter(s => s.finished_at !== null && new Date(s.started_at).getTime() >= cutoff)
                      .slice(0, 4);
                    return (
                  <section className="space-y-4">
                    <SectionHeader
                      eyebrow="Analytics"
                      title="Recent Performance"
                      action={
                        recentSessions.length > 0 ? (
                          <Button variant="ghost" size="sm" onClick={() => setState(prev => ({ ...prev, step: 'SESSIONS_HISTORY' }))}>
                            View all
                          </Button>
                        ) : undefined
                      }
                    />

                    {recent24.length === 0 ? (
                      <EmptyState
                        icon={Activity}
                        title={recentSessions.length === 0 ? 'No sessions yet' : 'Nothing in the last 24 hours'}
                        description={
                          recentSessions.length === 0
                            ? 'Take your first session and your recent performance will show up here.'
                            : 'Your full session history lives in My Sessions.'
                        }
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        {recent24.map(activity => {
                          const accuracyPct = (activity.accuracy ?? 0) * 100;
                          const accentVar =
                            accuracyPct >= 70
                              ? 'var(--accent)'
                              : accuracyPct >= 50
                              ? 'var(--warning-text)'
                              : 'var(--accent-danger)';
                          return (
                            <Card
                              key={activity.id}
                              variant="interactive"
                              padding="none"
                              onClick={() => {
                                setState(prev => ({
                                  ...prev,
                                  step: 'REVIEW',
                                  returnStep: 'MODE_SELECT',
                                  reviewSessionId: activity.id,
                                }));
                              }}
                              className="flex items-center gap-3 p-3 md:p-4 group"
                            >
                              {/* Accuracy ring — sole indicator of score, smaller on phone */}
                              <div className="w-11 h-11 md:w-14 md:h-14 rounded-full bg-bg-sunken flex items-center justify-center shrink-0 border border-border-subtle relative group-hover:scale-105 transition-transform">
                                <svg className="absolute inset-0 w-full h-full overflow-visible -rotate-90" viewBox="0 0 64 64">
                                  <circle cx="32" cy="32" r="28" fill="transparent" stroke="var(--border-subtle)" strokeWidth="4" />
                                  <circle cx="32" cy="32" r="28" fill="transparent" stroke={accentVar} strokeWidth="4" strokeDasharray={`${(accuracyPct / 100) * 175.9} 175.9`} strokeLinecap="round" />
                                </svg>
                                <span className="text-[11px] md:text-xs font-bold" style={{ color: accentVar }}>
                                  {Math.round(accuracyPct)}%
                                </span>
                              </div>
                              {/* Text — wraps fully, never truncated */}
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm md:text-base font-semibold text-text-primary break-words leading-tight">
                                  {activity.course_name ?? 'Unknown course'}
                                </h4>
                                <p className="text-xs md:text-sm text-text-secondary break-words leading-snug mt-0.5">
                                  {activity.topic_name ?? 'All topics'}
                                </p>
                                <div className="mt-1.5">
                                  <Pill tone="neutral">{activity.mode.replace('_', ' ').toUpperCase()}</Pill>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </section>
                    );
                  })()}
                </div>
              )}

              {state.step === 'TARGETED_PRACTICE' && (
                <div className="space-y-6">
                  <SectionHeader
                    size="lg"
                    eyebrow="Targeted Practice"
                    title="Diagnose & destroy weaknesses"
                    description="AI-generated problem sets designed to patch your specific knowledge gaps based on your session history."
                  />

                  <section className="space-y-6">
                    <h3 className="text-lg font-display italic text-text-primary flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-accent" />
                      Priority targets
                    </h3>

                    {weaknesses.length === 0 ? (
                      <EmptyState
                        icon={Sparkles}
                        title="Nothing to target yet"
                        description="Take a few practice sessions and your weakest topics will surface here."
                      />
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {weaknesses.map((weakness) => {
                          const accuracyPct = Math.round(weakness.accuracy * 100);
                          const priority = accuracyPct < 50 ? 'High' : accuracyPct < 70 ? 'Medium' : 'Low';
                          return (
                            <Card key={weakness.topic_id} variant="raised" padding="md" className="flex flex-col md:flex-row">
                              <div className="flex-1 mb-4 md:mb-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <Pill tone={priority === 'High' ? 'danger' : priority === 'Medium' ? 'warning' : 'success'}>
                                    {priority} priority
                                  </Pill>
                                </div>
                                <h4 className="text-base md:text-lg font-semibold text-text-primary mb-1">{weakness.topic_name ?? 'Unknown topic'}</h4>
                                <p className="text-xs text-text-secondary">Accuracy across {weakness.attempts} questions: <strong className="text-text-primary">{accuracyPct}%</strong></p>
                              </div>

                              <div className="flex items-center justify-between md:justify-end gap-6 md:min-w-[180px]">
                                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative">
                                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
                                    <circle cx="24" cy="24" r="21" fill="transparent" stroke="var(--border-subtle)" strokeWidth="4" />
                                    <circle cx="24" cy="24" r="21" fill="transparent" stroke={accuracyPct < 50 ? "var(--accent-danger)" : accuracyPct < 70 ? "var(--warning-text)" : "var(--accent)"} strokeWidth="4" strokeDasharray={`${(accuracyPct / 100) * 131.9} 131.9`} strokeLinecap="round" />
                                  </svg>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <Card variant="default" padding="lg" className="flex flex-col items-center text-center">
                     <div className="w-12 h-12 rounded-2xl bg-bg-raised flex items-center justify-center mb-5">
                       <Target className="w-6 h-6 text-text-tertiary" />
                     </div>
                     <h3 className="text-lg md:text-xl font-display italic text-text-primary mb-2">Diagnostic test</h3>
                     <p className="text-sm text-text-secondary max-w-md mx-auto mb-6">Need a fresh evaluation? Take a 20-question randomized test across your semester courses to find new weak spots.</p>
                     <Button variant="primary" size="lg" onClick={() => setState(p => ({ ...p, mode: 'DIAGNOSTIC', step: 'COURSE_SELECT' }))}>
                        Start diagnostic
                     </Button>
                  </Card>
                </div>
              )}

              {state.step === 'COURSE_SELECT' && (
                <div className="space-y-6">
                  <SectionHeader
                    eyebrow="Step 2"
                    title="Choose your course"
                    description={`Courses available for ${state.year}, ${state.semester}.`}
                  />

                  {coursesLoading ? (
                    <Spinner size="md" className="py-12" />
                  ) : availableCourses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                      {availableCourses.map(course => (
                        <Card
                          key={course.id}
                          variant="interactive"
                          padding="md"
                          onClick={() => handleCourseSelect(course)}
                          className="group relative overflow-hidden min-h-[9rem] md:min-h-[10rem] flex flex-col text-left"
                        >
                          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl rounded-full pointer-events-none" />
                          <h3 className="text-lg md:text-xl font-semibold text-text-primary mb-1.5 group-hover:text-accent-text transition-colors">
                            {course.name}
                          </h3>
                          {course.description && (
                            <p className="text-text-secondary text-xs leading-relaxed max-w-xs">
                              {course.description}
                            </p>
                          )}
                          <div className="mt-auto pt-4 flex items-center text-[11px] font-semibold text-accent-text opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-[0.18em] gap-1.5">
                            Select course <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Target}
                      title="No courses available"
                      description={`There are no courses linked to ${state.year}, ${state.semester} yet. An admin can add them in the Database tab.`}
                    />
                  )}
                </div>
              )}

              {state.step === 'TOPIC_SELECT' && state.selectedCourse && (
                <div className="space-y-6">
                  <SectionHeader
                    eyebrow={`Practice by Topic · ${state.selectedCourse.name}`}
                    title="Pick a topic and begin"
                  />

                  <Card variant="default" padding="md" className="flex flex-col md:flex-row gap-8">
                    <div className="space-y-3">
                      <span className="block text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.18em]">Difficulty</span>
                      <div className="flex flex-wrap gap-2">
                        {['Easy', 'Medium', 'Hard', 'All'].map(d => (
                          <button
                            key={d}
                            onClick={() => setState(s => ({ ...s, difficulty: d as any }))}
                            className={cn(
                              "px-5 py-2 rounded-full text-xs font-semibold transition-colors border",
                              state.difficulty === d
                                ? "bg-accent border-accent text-slate-950"
                                : "bg-bg-surface border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-medium"
                            )}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <span className="block text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.18em]">Questions</span>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 rounded-full border border-border-subtle px-1 py-1">
                          <button
                            type="button"
                            onClick={() => setQuestionCount(state.questionCount - 1)}
                            disabled={state.questionCount <= 1}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-raised disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary"
                            aria-label="Decrease question count"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={state.questionCount}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '');
                              if (v === '') {
                                setState(s => ({ ...s, questionCount: 1 }));
                                return;
                              }
                              setQuestionCount(Number(v));
                            }}
                            className="w-12 bg-transparent text-center text-sm font-semibold text-text-primary outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setQuestionCount(state.questionCount + 1)}
                            disabled={state.questionCount >= 50}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-raised disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary"
                            aria-label="Increase question count"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.18em]">Quick</span>
                        {[5, 10, 20].map(q => (
                          <button
                             key={q}
                             onClick={() => setQuestionCount(q)}
                             className={cn(
                               "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                               state.questionCount === q
                                 ? "bg-accent border-accent text-slate-950"
                                 : "bg-bg-surface border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-medium"
                             )}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Card>

                  {topicsLoading ? (
                    <Spinner size="md" className="py-12" />
                  ) : availableTopics.length === 0 ? (
                    <EmptyState
                      icon={Target}
                      title="No topics yet"
                      description="This course has no topics yet. An admin can add them in the Database → Topics tab."
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                      {availableTopics.map(topic => (
                        <TopicCard
                          key={topic.id}
                          topic={topic}
                          active={state.selectedTopic?.id === topic.id}
                          onClick={() => handleTopicSelect(topic)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {state.step === 'READY' && (
                <div
                  className="max-w-2xl mx-auto space-y-5"
                >
                  <div className="text-center space-y-2 mb-1">
                    <div className="w-14 h-14 bg-accent-muted rounded-full flex items-center justify-center mx-auto mb-3">
                      <Zap className="w-7 h-7 text-accent" />
                    </div>
                    <h2 className="text-2xl md:text-3xl italic font-display text-text-primary">
                      {state.mode === 'PRACTICE' ? 'Targeted practice ready' :
                       state.mode === 'MIDSEM' ? 'Midsem simulation ready' :
                       state.mode === 'DIAGNOSTIC' ? 'Diagnostic evaluation ready' :
                       'Full exam simulation ready'}
                    </h2>
                    <p className="text-text-secondary text-sm">
                      {state.mode === 'PRACTICE' ? 'Focus mode engaged. Time to solidify those concepts.' :
                       state.mode === 'DIAGNOSTIC' ? 'Let\'s find your knowledge gaps across the course spectrum.' :
                       'Deep breath. You are about to enter exam conditions.'}
                    </p>
                  </div>

                  <Card variant="default" padding="md" className="space-y-4">
                    <div className="flex items-center gap-4 pb-4 border-b border-border-subtle">
                      <div className="w-11 h-11 bg-bg-raised rounded-xl flex items-center justify-center shrink-0">
                        {state.mode === 'PRACTICE' ? <Target className="w-5 h-5 text-accent" /> : state.mode === 'DIAGNOSTIC' ? <Sparkles className="w-5 h-5 text-accent" /> : <Timer className="w-5 h-5 text-accent" />}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-text-primary">{state.selectedCourse?.name}</h3>
                        <p className="text-sm text-text-secondary">
                          {state.mode === 'PRACTICE' && state.selectedTopic 
                            ? `Topic: ${state.selectedTopic.name}` 
                            : state.mode === 'MIDSEM' 
                            ? 'First Half Syllabus (Weeks 1-6)' 
                            : state.mode === 'DIAGNOSTIC'
                            ? 'Full Syllabus Diagnostic'
                            : 'Comprehensive Coverage'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-bg-raised border border-border-subtle flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.18em]">Questions</span>
                        <span className="text-xl font-bold text-text-primary">
                          {state.mode === 'PRACTICE' ? state.questionCount :
                           state.mode === 'DIAGNOSTIC' ? 20 :
                           state.mode === 'MIDSEM' ? 30 : 60}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-bg-raised border border-border-subtle flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.18em]">Time Limit</span>
                        {state.mode === 'PRACTICE' ? (
                          <div className="flex items-center gap-2">
                             <input
                               type="text"
                               inputMode="numeric"
                               pattern="[0-9]*"
                               value={practiceTimeRaw}
                               onChange={(e) => {
                                 const v = e.target.value.replace(/\D/g, '');
                                 setPracticeTimeRaw(v);
                                 setPracticeTimeUserSet(true);
                                 if (v) setState(s => ({ ...s, practiceTimeLimit: Number(v) }));
                               }}
                               onBlur={() => {
                                 const n = Math.max(1, Math.min(300, Number(practiceTimeRaw) || 1));
                                 setPracticeTimeRaw(String(n));
                                 setState(s => ({ ...s, practiceTimeLimit: n }));
                               }}
                               className="bg-transparent border-b border-accent/50 text-xl font-bold text-text-primary w-16 outline-none focus:border-accent transition-colors text-center"
                             />
                             <span className="text-sm font-medium text-text-secondary">mins</span>
                          </div>
                        ) : (
                          <span className="text-xl font-bold text-text-primary">
                            {state.mode === 'MIDSEM' ? '60 mins' : state.mode === 'DIAGNOSTIC' ? '30 mins' : '150 mins'}
                          </span>
                        )}
                      </div>
                    </div>

                    {state.mode !== 'PRACTICE' && (
                      <div className="p-3.5 rounded-xl border bg-[color:var(--danger-bg)] border-[color:var(--danger-border)]">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--danger-text)] mb-1.5">
                          <AlertCircle className="w-4 h-4" /> Strict conditions
                        </h4>
                        <ul className="text-xs text-text-secondary space-y-0.5 list-disc pl-5">
                          <li>Timer cannot be paused once started.</li>
                          <li>Ensure stable connection before proceeding.</li>
                          <li>Results will impact your overall performance metrics.</li>
                        </ul>
                      </div>
                    )}
                  </Card>

                  {startError && (
                    <div className="rounded-2xl border p-5 flex gap-3 bg-[color:var(--warning-bg)] border-[color:var(--warning-border)]">
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[color:var(--warning-text)]" />
                      <div className="text-sm text-text-primary leading-relaxed">
                        {startError}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-center pt-1">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={startExam}
                      loading={startingExam}
                      className="w-full md:w-auto px-10"
                    >
                      {startingExam ? 'Starting…' : (
                        <>
                          Start solving
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
          </div>
        </main>

        {/* Footer removed from global layout, placed directly on READY step */}
      </>
    )}
  </div>
</div>
  );
}

interface ReviewSessionData {
  session: {
    id: string;
    mode: string;
    total_questions: number;
    score: number | null;
    duration_ms: number | null;
    accuracy: number | null;
    course_name: string | null;
    topic_name: string | null;
  };
  answers: Array<{
    id: string;
    question_id: string;
    position: number;
    picked_option_id: string | null;
    picked_text: string | null;
    is_correct: boolean | null;
    time_ms: number | null;
  }>;
  questions: Array<{
    id: string;
    type: 'mcq' | 'calc';
    answer_type: 'exact' | 'range' | null;
    content: { prompt: string; explanation?: string | null; correct_answer?: string | null; unit?: string | null };
    options: Array<{ id: string; text: string; is_correct: boolean }>;
    assets: Array<{ id: string; url: string }>;
  }>;
}

interface ReviewItem {
  id: string;
  position: number;
  prompt: string;
  type: 'mcq' | 'calc';
  options: Array<{ id: string; text: string; is_correct: boolean }>;
  assets: Array<{ id: string; url: string }>;
  correctAnswer: string | null;
  unit: string | null;
  explanation: string | null;
  pickedOptionId: string | null;
  pickedText: string | null;
  isCorrect: boolean | null;
  isUnanswered: boolean;
}

function ReviewScreen({ sessionId, onBack, courseName }: { sessionId: string; onBack: () => void; courseName: string }) {
  const [filter, setFilter] = useState<'All' | 'Correct' | 'Incorrect' | 'Unanswered'>('All');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [judeIdx, setJudeIdx] = useState<number | null>(null);
  const [data, setData] = useState<ReviewSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<ReviewSessionData>(`/api/sessions/${sessionId}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const items: ReviewItem[] = useMemo(() => {
    if (!data) return [];
    const qById = new Map<string, ReviewSessionData['questions'][number]>(
      data.questions.map((q) => [q.id, q])
    );
    return data.answers.map((a) => {
      const q = qById.get(a.question_id);
      const isUnanswered = a.picked_option_id == null && (a.picked_text == null || a.picked_text === '');
      return {
        id: q?.id ?? a.question_id,
        position: a.position,
        prompt: q?.content.prompt ?? '(question removed)',
        type: q?.type ?? 'mcq',
        options: q?.options ?? [],
        assets: q?.assets ?? [],
        correctAnswer: q?.content.correct_answer ?? null,
        unit: q?.content.unit ?? null,
        explanation: q?.content.explanation ?? null,
        pickedOptionId: a.picked_option_id,
        pickedText: a.picked_text,
        isCorrect: isUnanswered ? null : a.is_correct,
        isUnanswered,
      };
    });
  }, [data]);

  const stats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    items.forEach((it) => {
      if (it.isUnanswered) unanswered++;
      else if (it.isCorrect) correct++;
      else incorrect++;
    });
    const total = items.length;
    return {
      correct,
      incorrect,
      unanswered,
      total,
      score: correct,
      percent: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  }, [items]);

  const filteredQuestions = useMemo(() => {
    return items.filter((it) => {
      if (filter === 'All') return true;
      if (filter === 'Unanswered') return it.isUnanswered;
      if (filter === 'Correct') return it.isCorrect === true;
      if (filter === 'Incorrect') return it.isCorrect === false;
      return true;
    });
  }, [items, filter]);

  const isPassed = stats.percent >= 50;

  const formatDuration = (ms: number | null) => {
    if (!ms || ms <= 0) return '—';
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full text-text-secondary gap-4">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Loading session…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full px-4 gap-4 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-bold text-text-primary mb-2">Couldn't load session</h2>
          <p className="text-sm text-text-secondary">{error ?? 'Session not found.'}</p>
        </div>
        <button onClick={onBack} className="px-6 py-2.5 bg-bg-raised border border-border-subtle rounded-xl text-sm font-bold text-text-primary hover:bg-bg-surface">
          Back
        </button>
      </div>
    );
  }

  const headerCourseName = data.session.course_name ?? courseName;

  return (
    <div 
      className="flex flex-col h-full bg-bg-page text-text-primary font-sans overflow-hidden"
    >
      {/* Header HUD */}
      <header className="h-16 bg-bg-surface border-b border-border-subtle flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-bg-raised rounded-lg transition-colors group">
            <ChevronLeft className="w-5 h-5 text-text-secondary group-hover:text-text-primary" />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-accent-text uppercase tracking-widest leading-none">Session Review</span>
            <h1 className="text-sm font-black text-text-primary uppercase tracking-widest mt-1">{headerCourseName}</h1>
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
                <StatPill label="Time Taken" value={formatDuration(data.session.duration_ms)} color="text-accent" />
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
            {filteredQuestions.length === 0 ? (
              <div className="p-12 rounded-3xl bg-surface-container-low border border-dashed border-border-medium text-center text-sm text-text-secondary">
                Nothing matches that filter.
              </div>
            ) : (
              filteredQuestions.map((it) => {
              const isExpanded = expandedIdx === it.position;
              const studentAnswerText =
                it.type === 'mcq'
                  ? it.options.find((o) => o.id === it.pickedOptionId)?.text ?? null
                  : it.pickedText;

              return (
                <div
                  key={it.id}
                  className={cn(
                    "bg-bg-surface border border-border-subtle rounded-2xl overflow-hidden transition-colors",
                    isExpanded ? "ring-2 ring-accent/30 shadow-2xl" : "hover:border-border-medium"
                  )}
                >
                  {/* Collapsed Item */}
                  <div
                    onClick={() => setExpandedIdx(isExpanded ? null : it.position)}
                    className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 cursor-pointer select-none group"
                  >
                    <div className="flex items-start md:items-center gap-3 md:gap-4 flex-1 min-w-0">
                      <span className="text-xs font-black text-text-tertiary shrink-0 w-6 md:w-8 mt-0.5 md:mt-0">Q{it.position + 1}</span>
                      <p className="text-sm font-medium text-text-primary line-clamp-2 md:truncate">{it.prompt}</p>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 shrink-0 pl-9 md:pl-0 w-full md:w-auto mt-2 md:mt-0">
                      <div className="flex items-center gap-2 md:gap-4">
                        <div className={cn(
                          "px-2 md:px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                          it.isUnanswered ? "bg-bg-raised text-text-tertiary" : it.isCorrect ? "bg-success-bg text-success-text" : "bg-danger-bg text-danger-text"
                        )}>
                          {it.isUnanswered ? "Unanswered" : it.isCorrect ? "Correct" : "Incorrect"}
                        </div>

                        {!isExpanded && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setJudeIdx(it.position); }}
                            className={cn(
                              "flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-colors border",
                              it.isCorrect ? "text-text-tertiary border-border-subtle" : "text-accent border-accent/20 bg-accent/5 hover:bg-accent/10"
                            )}
                          >
                            Ask Jude {it.isCorrect && "✦"}
                          </button>
                        )}
                      </div>

                      <ChevronRight className={cn("w-4 h-4 text-text-tertiary transition-transform", isExpanded && "rotate-90")} />
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-border-subtle bg-bg-sunken/30">
                      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
                          <RichText className="text-lg text-text-primary leading-relaxed font-medium">{it.prompt}</RichText>

                          {it.assets.length > 0 && (
                            <div className="flex flex-col gap-3">
                              {it.assets.map((a) => (
                                <img
                                  key={a.id}
                                  src={a.url}
                                  alt="diagram"
                                  loading="lazy"
                                  className="rounded-xl border border-border-subtle max-h-80 mx-auto"
                                />
                              ))}
                            </div>
                          )}

                          {it.type === 'mcq' ? (
                            <div className="grid grid-cols-1 gap-3">
                              {it.options.map((opt, optIdx) => {
                                const isCorrectOpt = opt.is_correct;
                                const isStudentAns = it.pickedOptionId === opt.id;
                                const label = String.fromCharCode(65 + optIdx) + '.';

                                return (
                                  <div
                                    key={opt.id}
                                    className={cn(
                                      "flex items-center gap-4 p-5 rounded-2xl border transition-[transform,opacity,box-shadow]",
                                      isCorrectOpt
                                        ? "bg-success-bg border-success-border text-success-text shadow-[0_4px_12px_rgba(34,197,94,0.1)]"
                                        : isStudentAns
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
                                      <RichText inline className="font-medium">{opt.text}</RichText>
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
                                   {studentAnswerText ? <RichText inline>{studentAnswerText}</RichText> : "No response provided"}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <span className="text-[10px] font-black text-success-text uppercase tracking-widest">Model Answer</span>
                                <div className="p-4 bg-success-bg/10 border border-success-border rounded-xl font-mono text-sm text-success-text">
                                   {it.correctAnswer ? <RichText inline>{`${it.correctAnswer}${it.unit ? ` ${it.unit}` : ''}`}</RichText> : '—'}
                                </div>
                              </div>
                            </div>
                          )}

                          {it.explanation && (
                            <div className="bg-bg-sunken border border-border-subtle rounded-2xl p-6 space-y-4">
                              <span className="text-[10px] font-black text-accent-text uppercase tracking-widest flex items-center gap-2">
                                 <Sigma className="w-3.5 h-3.5" /> Worked Solution
                              </span>
                              <RichText className="text-sm text-text-secondary leading-relaxed opacity-90">
                                 {it.explanation}
                              </RichText>
                            </div>
                          )}

                          <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-4 pt-6 border-t border-border-subtle">
                             <div className="flex justify-between w-full md:w-auto gap-2">
                               <button
                                 disabled={it.position === 0}
                                 onClick={() => setExpandedIdx(it.position - 1 >= 0 ? it.position - 1 : null)}
                                 className="flex-1 md:flex-none p-3 bg-bg-raised border border-border-subtle rounded-xl text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-30 flex justify-center items-center"
                               >
                                 <ChevronLeft className="w-4 h-4" />
                               </button>
                               <button
                                 disabled={it.position === items.length - 1}
                                 onClick={() => setExpandedIdx(it.position + 1 < items.length ? it.position + 1 : null)}
                                 className="flex-1 md:flex-none p-3 bg-bg-raised border border-border-subtle rounded-xl text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-30 flex justify-center items-center"
                               >
                                 <ChevronRight className="w-4 h-4" />
                               </button>
                             </div>

                             <button
                                onClick={() => setJudeIdx(it.position)}
                                className="w-full md:w-auto px-6 md:px-10 py-3 md:py-4 bg-accent text-bg-page text-[10px] md:text-xs font-black uppercase tracking-widest rounded-xl md:rounded-2xl shadow-lg hover:-translate-y-0.5 transition-[transform,opacity,box-shadow] flex items-center justify-center gap-3"
                              >
                                Ask Jude {it.isCorrect && "✦"}
                              </button>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              );
              })
            )}
          </div>
        </div>
      </div>

      {judeIdx !== null && items[judeIdx] && (
        <JudePanel
          question={{
            id: items[judeIdx].id,
            type: items[judeIdx].type === 'mcq' ? 'MCQ' : 'INPUT',
            prompt: items[judeIdx].prompt,
            options: items[judeIdx].options.map((o) => o.text),
            marks: 1,
          }}
          answer={
            items[judeIdx].type === 'mcq'
              ? items[judeIdx].options.find((o) => o.id === items[judeIdx].pickedOptionId)?.text ?? ''
              : items[judeIdx].pickedText ?? ''
          }
          onClose={() => setJudeIdx(null)}
        />
      )}
    </div>
  );
}

function JudePanel({ question, answer, onClose }: { question: Question, answer: string, onClose: () => void }) {
  const { currentUser, userProfile } = useAuth();
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
        const stream = streamOpenRouter([{ role: 'user', content: prompt }]);

        let fullText = "";
        for await (const text of stream) {
          if (!isMounted) break;
          fullText += text;

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
      const systemPrompt = `You are Jude, the AI tutor. Help the student (${userProfile?.preferredName || currentUser?.displayName || 'Student'}) with this specific question only. Be concise.`;
      const chatMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `I'm asking about this question: ${question.prompt}` },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role === 'jude' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
        { role: 'user', content: userMsg },
      ];

      const stream = streamOpenRouter(chatMessages);
      let fullText = "";
      for await (const text of stream) {
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
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-bg-page/40 backdrop-blur-sm z-[100]"
      />
      
      {/* Panel */}
      <aside
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
               <div className="text-sm text-text-primary leading-relaxed font-medium">
                  <RichText>{streamedText}</RichText>
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
                      {m.role === 'user' ? m.content : <RichText>{m.content}</RichText>}
                   </div>
                </div>
              ))}
              {isStreaming && (
                <div className="flex flex-col items-start">
                   <div className="max-w-[90%] p-4 bg-bg-raised border border-border-subtle text-text-primary rounded-2xl rounded-tl-none text-sm leading-relaxed">
                      <RichText>{streamedText}</RichText>
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
                onBlur={() => window.scrollTo(0, 0)}
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
      </aside>
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
    
    // Disable all transitions temporarily so the theme snaps instantly
    const css = document.createElement('style');
    css.appendChild(document.createTextNode('* { transition: none !important; }'));
    document.head.appendChild(css);

    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);

    // Force reflow and restore transitions
    window.getComputedStyle(css).opacity;
    setTimeout(() => document.head.removeChild(css), 50);
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

function ExamSimulation({
  onBack,
  onFinish,
  onTerminate,
  courseName,
  mode,
  sessionId,
  questions,
  practiceTimeLimit,
  prefilledAnswers,
}: {
  onBack: () => void;
  onFinish: (sessionId: string) => void;
  onTerminate: (sessionId: string) => void;
  courseName: string;
  mode: StudyMode;
  sessionId: string;
  questions: Question[];
  practiceTimeLimit: number;
  prefilledAnswers?: Record<number, string>;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>(() => prefilledAnswers ?? {});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [showTimer, setShowTimer] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [sessionActionBusy, setSessionActionBusy] = useState<'pause' | 'end' | null>(null);
  // In-flight answer submissions: handleFinish must wait for these before
  // posting /finish, otherwise the server may finalise the session while a
  // late /answer is still in flight (which then 400s with SESSION_FINISHED and
  // the answer is silently dropped — the "review shows nothing" bug).
  const pendingAnswersRef = useRef<Set<Promise<unknown>>>(new Set());

  const totalQuestions = questions.length;

  // Persistent Timer Logic. The questions themselves no longer live here —
  // server-side `question_ids` + GET /resume make cross-device resume work
  // from any browser/device.
  const storageKey = `engine_session_${courseName}_${mode}`;
  const [session, setSession] = useState<TimerSession>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);

    // 1h for midsem, 2.5h for full exam, practiceTimeLimit (mins) for practice, 30m for diagnostic
    const duration = mode === 'MIDSEM' ? 3600000 : mode === 'FULL_EXAM' ? 9000000 : mode === 'DIAGNOSTIC' ? 1800000 : practiceTimeLimit * 60000;
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
  }, [session, storageKey]);

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

  const currentQuestion = questions[currentIdx];

  // Reconcile with server on mount: resume any paused session and inherit the
  // authoritative started_at / total_paused_ms (so a different browser or a
  // cleared cache still restores the correct timer offset).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await apiPost<{ started_at: string; total_paused_ms: number }>(
          `/api/sessions/${sessionId}/resume`,
          {}
        );
        if (cancelled) return;
        const serverStart = new Date(row.started_at).getTime();
        const serverPaused = row.total_paused_ms ?? 0;
        setSession((prev) => {
          const merged: TimerSession = {
            ...prev,
            totalPausedMs: Math.max(prev.totalPausedMs ?? 0, serverPaused),
            pausedAt: null,
          };
          // Cross-device: localStorage was empty, so prev.startedAt got
          // initialised to "now". If the server started much earlier, trust it.
          if (serverStart < prev.startedAt - 30000) {
            merged.startedAt = serverStart;
          }
          return merged;
        });
      } catch (e) {
        // Never block exam play on a resume hiccup.
        console.error('resume session failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleFinish = async () => {
    localStorage.removeItem(storageKey);
    // Drain any pending /answer requests first — otherwise the server may
    // accept /finish before the last answer reaches the DB, which then 400s
    // with SESSION_FINISHED and leaves the review screen empty.
    if (pendingAnswersRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingAnswersRef.current));
    }
    try {
      await apiPost(`/api/sessions/${sessionId}/finish`, {});
    } catch (e) {
      console.error('finish session failed', e);
    }
    onFinish(sessionId);
  };

  // Pause: mark the session paused server-side (so the timer offset is
  // restored on resume), but KEEP the localStorage timer blob — same-browser
  // resume rehydrates instantly. The session row stays open (finished_at NULL),
  // and the home screen will surface a Resume banner for it.
  const handlePauseAndExit = async () => {
    setSessionActionBusy('pause');
    try {
      await apiPost(`/api/sessions/${sessionId}/pause`, {});
    } catch (e) {
      console.error('pause session failed', e);
    } finally {
      setSessionActionBusy(null);
      setSessionMenuOpen(false);
      onBack();
    }
  };

  // Terminate: hard-delete the session so it never happened. Server cascades
  // session_answers; metrics are untouched. We do NOT call /finish (no score,
  // no review row). The "Submit Exam" navigator button is still the way to
  // finalise a session for review.
  const handleTerminate = async () => {
    setSessionActionBusy('end');
    localStorage.removeItem(storageKey);
    try {
      await apiDelete(`/api/sessions/${sessionId}`);
    } catch (e) {
      console.error('terminate session failed', e);
    } finally {
      setSessionActionBusy(null);
      setEndConfirmOpen(false);
      onTerminate(sessionId);
    }
  };

  // Auto-submit handle
  useEffect(() => {
    if (questions.length > 0 && timeLeftMs <= 0) {
      handleFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeftMs, questions.length]);

  const handleAnswer = (answer: string) => {
    setAnswers(prev => ({ ...prev, [currentIdx]: answer }));
    if (!currentQuestion) return;
    const timeMs = Date.now() - questionStartTime;
    const payload: Record<string, unknown> = {
      question_id: currentQuestion.id,
      position: currentIdx,
      time_ms: timeMs,
    };
    if (currentQuestion.type === 'MCQ') {
      const optIdx = (currentQuestion.options ?? []).indexOf(answer);
      const optId = currentQuestion.optionIds?.[optIdx];
      if (optId) payload.picked_option_id = optId;
      else payload.picked_text = answer;
    } else {
      payload.picked_text = answer;
    }
    const p = apiPost(`/api/sessions/${sessionId}/answer`, payload).catch((e) =>
      console.error('answer submit failed', e)
    );
    pendingAnswersRef.current.add(p);
    p.finally(() => pendingAnswersRef.current.delete(p));
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
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setQuestionStartTime(Date.now());
    } else {
      handleFinish();
    }
  };

  const prevQuestion = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
      setQuestionStartTime(Date.now());
    }
  };

  const navigatorJSX = (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black text-accent-text uppercase tracking-widest">Question Navigator</h3>
          <button 
            onClick={() => setIsMobileNavOpen(false)} 
            className="lg:hidden p-1 hover:bg-bg-raised rounded-lg transition-[transform,opacity,box-shadow]"
          >
            <X className="w-4 h-4 text-text-tertiary hover:text-text-primary" />
          </button>
        </div>
        <div className="h-1 w-12 bg-accent rounded-full" />
      </header>

      <div className="bg-surface-container-high border border-outline-variant/10 rounded-2xl p-3 flex flex-col gap-2">
        <div className="flex justify-between items-center text-[10px] text-text-secondary font-bold">
           <span>Progress</span>
           <span>{Object.keys(answers).length} / {totalQuestions}</span>
        </div>
        <div className="flex gap-3 text-[9px] uppercase font-black tracking-widest">
           <span className="flex items-center gap-1 text-success-text">
              <Check className="w-2.5 h-2.5"/> {Object.keys(answers).length} done
           </span>
           <span className="flex items-center gap-1 text-text-tertiary">
              <Circle className="w-2.5 h-2.5"/> {totalQuestions - Object.keys(answers).length} left
           </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-surface-container-low p-1 rounded-xl">
        <button className="flex-1 py-1.5 bg-bg-surface text-text-primary rounded-lg shadow-sm border border-outline-variant/10 transition-[transform,opacity,box-shadow]">All</button>
        <button className="flex-1 py-1.5 text-text-secondary hover:text-text-primary transition-colors">Flagged</button>
        <button className="flex-1 py-1.5 text-text-secondary hover:text-text-primary transition-colors">Unanswered <span className="opacity-50 ml-1">{totalQuestions - Object.keys(answers).length}</span></button>
      </div>

      <div className="grid grid-cols-5 gap-1.5 lg:gap-2">
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

  // Guard: a resumed session with empty `question_ids` would otherwise crash
  // on `currentQuestion.prompt` below. Surface a clean exit instead.
  if (totalQuestions === 0 || !currentQuestion) {
    return (
      <div className="flex flex-col h-full flex-1 bg-bg-page text-text-primary font-sans items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-4">
          <AlertTriangle className="w-12 h-12 text-[color:var(--accent-danger)] mx-auto" />
          <h2 className="text-2xl font-bold text-text-primary">This session can't be resumed</h2>
          <p className="text-sm text-text-secondary">
            We couldn't find the questions for this session. It was likely created in an older version of the app. Discard it and start a fresh session.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="ghost" onClick={onBack}>Back</Button>
            <Button variant="primary" onClick={handleTerminate} disabled={sessionActionBusy === 'end'}>
              {sessionActionBusy === 'end' ? 'Discarding…' : 'Discard session'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full flex-1 bg-bg-page text-text-primary font-sans overflow-hidden"
    >
        {isMobileNavOpen && (
          <div
            className="fixed inset-0 z-[160] lg:hidden animate-in fade-in duration-200"
          >
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileNavOpen(false)}
            />
            {/* Drawer */}
            <div
              className="absolute inset-y-0 right-0 w-80 bg-bg-surface border-l border-border-subtle shadow-2xl p-6 overflow-y-auto overscroll-contain flex flex-col animate-in slide-in-from-right duration-200"
            >
              {navigatorJSX}
            </div>
          </div>
        )}

        {session.pausedAt && (
          <div 
            className="fixed inset-0 z-[200] bg-bg-page flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-200"
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
          </div>
        )}

      {/* HUD Header */}
      <header className="relative h-12 bg-bg-surface border-b border-border-subtle flex items-center justify-between px-4 md:px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setSessionMenuOpen((v) => !v)}
              className="p-2 -ml-2 hover:bg-bg-raised/50 rounded-lg group shrink-0"
              title="Session menu"
              aria-haspopup="menu"
              aria-expanded={sessionMenuOpen}
            >
              <MoreVertical className="w-5 h-5 text-text-secondary group-hover:text-text-primary transition-colors" />
            </button>
            {sessionMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setSessionMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-2 z-50 w-64 bg-bg-surface border border-border-subtle rounded-2xl shadow-xl p-2 animate-fade-in"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handlePauseAndExit}
                    disabled={sessionActionBusy !== null}
                    className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-bg-raised text-left disabled:opacity-50"
                  >
                    {sessionActionBusy === 'pause' ? (
                      <Loader2 className="w-5 h-5 text-text-secondary animate-spin shrink-0 mt-0.5" />
                    ) : (
                      <PauseCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-text-primary">Pause & continue later</div>
                      <div className="text-[11px] text-text-secondary leading-snug">
                        Save your timer and answers — resume from the home screen.
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSessionMenuOpen(false);
                      setEndConfirmOpen(true);
                    }}
                    className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-bg-raised text-left"
                  >
                    <StopCircle className="w-5 h-5 text-[color:var(--accent-danger)] shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-text-primary">Terminate session</div>
                      <div className="text-[11px] text-text-secondary leading-snug">
                        Discard this attempt entirely. Won't affect your metrics — behaves as if you never started.
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
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
            "h-8 md:h-10 flex items-center gap-3 md:gap-6 px-3 md:px-6 border rounded-2xl backdrop-blur-md transition-[transform,opacity,box-shadow] duration-150 cursor-pointer select-none",
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
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="max-w-7xl mx-auto w-full px-3 md:px-6 py-2 md:py-4 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="grid grid-cols-12 gap-4 md:gap-5 flex-1 min-h-0 overflow-hidden">
            {/* Left/Middle: Question Core */}
            <div className="col-span-12 lg:col-span-9 flex flex-col min-h-0 h-full overflow-hidden">

               {/* Question Arena */}
               <div className="bg-bg-surface p-4 md:p-6 rounded-3xl border border-border-subtle shadow-2xl relative overflow-hidden group flex flex-col flex-1 min-h-0">
                  <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-50 pointer-events-none" />
                  
                  {flagged.has(currentIdx) && (
                    <div 
                      className="absolute top-0 left-0 right-0 bg-amber-500/10 border-b border-amber-500/20 py-1.5 px-4 md:px-6 flex items-center gap-2 z-20 backdrop-blur-sm"
                    >
                      <Flag className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Flagged for Verification</span>
                    </div>
                  )}

                  {isUrgent && (
                    <div 
                      className="absolute top-3 right-3 bg-danger-bg/80 border border-danger-border py-0.5 px-2.5 flex items-center gap-1.5 z-30 rounded-full backdrop-blur-md animate-pulse shadow-lg pointer-events-none"
                    >
                      <Timer className="w-2.5 h-2.5 text-danger-text" />
                      <span className="text-[8px] font-black text-danger-text uppercase tracking-widest">Time Critical</span>
                    </div>
                  )}

                  <div className={cn("relative z-10 flex flex-col flex-1 overflow-y-auto no-scrollbar", flagged.has(currentIdx) ? "mt-5" : "mt-0")}>
                    <div className="flex items-center justify-between border-b border-border-subtle pb-2 shrink-0 mt-3 md:mt-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-text-primary">Q{currentIdx + 1}</span>
                        <span className="text-[9px] font-black text-text-tertiary uppercase tracking-widest">/ {questions.length}</span>
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

                    <div className="py-4 space-y-4">
                      <RichText className="text-sm md:text-base text-text-primary leading-relaxed font-medium tracking-tight">
                        {currentQuestion.prompt}
                      </RichText>

                      {currentQuestion.assets && currentQuestion.assets.length > 0 && (
                        <div className="flex flex-col gap-3">
                          {currentQuestion.assets.map((a) => (
                            <img
                              key={a.id}
                              src={a.url}
                              alt="diagram"
                              loading="lazy"
                              className="rounded-xl border border-border-subtle max-h-80 mx-auto"
                            />
                          ))}
                        </div>
                      )}

                      {currentQuestion.type === 'MCQ' ? (
                        <div className="grid grid-cols-1 gap-2.5">
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
                        <div className="space-y-3">
                          <label className="block text-[9px] font-black text-accent-text uppercase tracking-widest">Input Response</label>
                          <input 
                            type="text"
                            value={answers[currentIdx] || ''}
                            onChange={(e) => handleAnswer(e.target.value)}
                            onBlur={() => window.scrollTo(0, 0)}
                            placeholder="Type your final result here..."
                            className="w-full bg-bg-sunken border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-[transform,opacity,box-shadow] font-mono"
                          />
                          <p className="text-[9px] text-text-tertiary italic">Numerical answers must match specified precision (±0.01).</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-3 shrink-0 pt-4 pb-1 border-t border-border-subtle relative z-10 bg-bg-surface">
                    <button 
                     onClick={prevQuestion}
                     disabled={currentIdx === 0}
                     className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-bg-surface border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-all disabled:opacity-50 disabled:cursor-not-allowed group active:scale-95 shadow-sm"
                   >
                       <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                       <span className="text-[11px] font-black uppercase tracking-widest">Previous</span>
                    </button>
                    
                   <button 
                     onClick={nextQuestion}
                     className="flex-[1.5] sm:flex-none flex items-center justify-center gap-2.5 px-6 py-3 bg-accent hover:bg-accent-hover text-bg-page text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-[0_8px_20px_var(--accent-muted)] hover:shadow-[0_12px_24px_var(--accent-muted)] transition-all hover:scale-[1.02] active:scale-95"
                   >
                     {currentIdx === questions.length - 1 ? 'Commit Verdict' : 'Next'}
                     <ArrowRight className="w-5 h-5" />
                   </button>
                  </div>
               </div>
            </div>

            {/* Right Coast: Navigation HUD (Desktop) */}
            <aside className="hidden lg:flex lg:col-span-3 flex-col h-full min-h-0">
               <div className="bg-bg-surface border border-border-subtle rounded-3xl p-4 md:p-5 shadow-xl flex-1 overflow-y-auto no-scrollbar">
                  {navigatorJSX}
               </div>
            </aside>
          </div>
        </div>
      </div>

      {endConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 animate-fade-in"
          onClick={() => {
            if (sessionActionBusy !== 'end') setEndConfirmOpen(false);
          }}
        >
          <div
            className="w-full max-w-md bg-bg-surface border border-border-subtle rounded-2xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[color:var(--danger-bg)] text-[color:var(--accent-danger)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-text-primary mb-1">Terminate this session?</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  This discards the attempt and every answer in it. Your accuracy, time, and trend stay
                  unchanged — like you never started. If you want a score instead, hit
                  <span className="font-semibold text-text-primary"> Submit Exam</span> from the question navigator.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEndConfirmOpen(false)}
                disabled={sessionActionBusy === 'end'}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleTerminate}
                disabled={sessionActionBusy === 'end'}
                className="inline-flex items-center gap-1.5 bg-[color:var(--accent-danger)] text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {sessionActionBusy === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
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

function QuizOption({ id, label, text, selected, onSelect }: { id: string, label: string, text: string, selected: boolean, onSelect: () => void, key?: string | number }) {
  return (
    <button 
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 p-3.5 rounded-2xl border transition-[transform,opacity,box-shadow] duration-100 text-left group relative overflow-hidden",
        selected 
          ? "bg-accent-muted border-accent/30 shadow-[inset_0_0_20px_var(--accent-muted)]" 
          : "bg-bg-raised/30 border-border-subtle hover:bg-bg-raised/50 hover:border-border-medium"
      )}
    >
      <div className={cn(
        "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-[transform,opacity,box-shadow]",
        selected ? "bg-accent border-accent" : "border-border-medium group-hover:border-accent/50"
      )}>
        {selected && <Check className="w-2.5 h-2.5 text-bg-page font-black" />}
      </div>
      <div className="flex gap-2.5 text-[13px] relative z-10">
        <span className={cn("font-black tracking-widest uppercase shrink-0 transition-colors", selected ? "text-accent-text" : "text-text-tertiary")}>{label}</span>
        <RichText inline className={cn("font-medium transition-colors", selected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary")}>{text}</RichText>
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
