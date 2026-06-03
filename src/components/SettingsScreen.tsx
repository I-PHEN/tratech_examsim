import React, { useState, useEffect } from 'react';
import { ChevronLeft, User, Bell, Paintbrush, LogOut, Check, GraduationCap, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { apiPatch } from '../lib/apiClient';

const THEME_COLORS = [
  { id: 'blue', value: '#5B6CF9', name: 'Blue' },
  { id: 'green', value: '#10B981', name: 'Green' },
  { id: 'purple', value: '#8B5CF6', name: 'Purple' },
  { id: 'rose', value: '#F43F5E', name: 'Rose' },
  { id: 'orange', value: '#F97316', name: 'Orange' },
  { id: 'yellow', value: '#EAB308', name: 'Yellow' },
];

export function SettingsScreen({
  onBack,
  initialTab = 'account',
}: {
  onBack: () => void;
  initialTab?: 'account' | 'academics' | 'preferences' | 'notifications';
}) {
  const { currentUser, userProfile, updateProfileLocal } = useAuth();
  const [activeTab, setActiveTab] = useState<'account' | 'academics' | 'preferences' | 'notifications'>(initialTab);
  
  const [preferredName, setPreferredName] = useState(userProfile?.preferredName || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (userProfile?.preferredName) {
      setPreferredName(userProfile.preferredName);
    }
  }, [userProfile]);

  const handleSaveName = async () => {
    if (!currentUser) return;
    setIsSavingName(true);
    setSaveMessage('');
    try {
      updateProfileLocal({ preferredName }); // Optimistic update
      await updateDoc(doc(db, 'users', currentUser.uid), {
        preferredName
      });
      setSaveMessage('Saved successfully');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (e) {
      console.error(e);
      setSaveMessage('Failed to save');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSelectAccent = async (colorId: string) => {
    if (!currentUser) return;
    try {
      updateProfileLocal({ themeAccent: colorId }); // Optimistic update
      await updateDoc(doc(db, 'users', currentUser.uid), {
        themeAccent: colorId
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Year/Semester moved here from the header. Stored in the same "Year 3" /
  // "Sem 1" form the App normalises on read; the profile stream propagates the
  // change back so the dashboard re-filters courses without a reload.
  const YEARS = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
  const SEMS = ['Sem 1', 'Sem 2'];
  const currentYear = userProfile?.year
    ? userProfile.year.startsWith('Year') ? userProfile.year : `Year ${userProfile.year}`
    : 'Year 3';
  const currentSem = userProfile?.semester
    ? userProfile.semester.startsWith('Sem') ? userProfile.semester : `Sem ${userProfile.semester}`
    : 'Sem 1';

  const handleAcademic = async (field: 'year' | 'semester', value: string) => {
    if (!currentUser) return;
    updateProfileLocal({ [field]: value }); // Optimistic update
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { [field]: value });
    } catch (e) {
      console.error(e);
    }
  };

  // Notification preferences persist on the profile (default on). Nothing
  // delivers them yet, but the choices are saved so they survive reloads.
  const NOTIF_OPTIONS = [
    { key: 'weeklyReport', title: 'Weekly progress report', desc: 'A summary of your study performance.' },
    { key: 'studyReminders', title: 'Study reminders', desc: "A nudge when you haven't studied in a while." },
    { key: 'newContent', title: 'New content available', desc: 'When new courses or questions are added.' },
  ] as const;
  const notifs = (userProfile?.notifications ?? {}) as Record<string, boolean>;
  // Optimistic values live in their own state so the Firestore onSnapshot
  // (which replaces the whole profile) can't stomp a just-toggled switch and
  // make it flip back. An override clears once the server value agrees.
  const [notifOverrides, setNotifOverrides] = useState<Record<string, boolean>>({});
  const notifOn = (key: string) =>
    key in notifOverrides ? notifOverrides[key] : notifs[key] !== false; // default on
  useEffect(() => {
    setNotifOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(prev)) {
        if ((notifs[k] !== false) === prev[k]) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [userProfile]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleToggleNotif = async (key: string) => {
    if (!currentUser) return;
    const next = !notifOn(key);
    setNotifOverrides((p) => ({ ...p, [key]: next })); // optimistic, snapshot-proof
    try {
      // Goes through the backend (Admin SDK) — client-side Firestore rules
      // don't allow writing the `notifications` field directly.
      await apiPatch('/api/profile/notifications', { key, value: next });
    } catch (e) {
      console.error(e);
      setNotifOverrides((p) => ({ ...p, [key]: !next })); // revert on failure
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center py-6 md:py-12 px-4 h-full overflow-y-auto">
      <div className="w-full max-w-4xl animate-fade-in pb-12 flex flex-col md:flex-row gap-8">
        
        {/* Sidebar */}
        <div className="w-full md:w-64 shrink-0 flex flex-col space-y-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-container-highest transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-text-primary italic font-display">Settings</h1>
          </div>

          <nav className="grid grid-cols-2 md:flex md:flex-col gap-2 shrink-0 w-full md:w-64">
            <button 
              onClick={() => setActiveTab('account')}
              className={cn(
                "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 p-2 md:p-3 rounded-xl transition-colors font-medium text-[10px] md:text-sm text-center md:text-left",
                activeTab === 'account' ? "bg-surface-container-highest text-text-primary" : "text-text-secondary hover:bg-surface-container hover:text-text-primary"
              )}
            >
              <User className="w-5 h-5 md:w-4 md:h-4" />
              <span className="truncate">Account</span>
            </button>
            <button
              onClick={() => setActiveTab('academics')}
              className={cn(
                "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 p-2 md:p-3 rounded-xl transition-colors font-medium text-[10px] md:text-sm text-center md:text-left",
                activeTab === 'academics' ? "bg-surface-container-highest text-text-primary" : "text-text-secondary hover:bg-surface-container hover:text-text-primary"
              )}
            >
              <GraduationCap className="w-5 h-5 md:w-4 md:h-4" />
              <span className="truncate">Academics</span>
            </button>
            <button
              onClick={() => setActiveTab('preferences')}
              className={cn(
                "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 p-2 md:p-3 rounded-xl transition-colors font-medium text-[10px] md:text-sm text-center md:text-left",
                activeTab === 'preferences' ? "bg-surface-container-highest text-text-primary" : "text-text-secondary hover:bg-surface-container hover:text-text-primary"
              )}
            >
              <Paintbrush className="w-5 h-5 md:w-4 md:h-4" />
              <span className="truncate">Preferences</span>
            </button>
            <button 
              onClick={() => setActiveTab('notifications')}
              className={cn(
                "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 p-2 md:p-3 rounded-xl transition-colors font-medium text-[10px] md:text-sm text-center md:text-left",
                activeTab === 'notifications' ? "bg-surface-container-highest text-text-primary" : "text-text-secondary hover:bg-surface-container hover:text-text-primary"
              )}
            >
              <Bell className="w-5 h-5 md:w-4 md:h-4" />
              <span className="truncate">Notifications</span>
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 bg-surface-container-high border border-outline-variant/20 rounded-3xl p-6 md:p-8">
          {activeTab === 'account' && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-text-primary mb-1">Account details</h2>
                <p className="text-sm text-text-secondary">Manage your personal information and security.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-surface-container rounded-2xl border border-outline-variant/10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-primary font-bold text-lg uppercase">{preferredName?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">{preferredName || currentUser?.displayName || 'Student'}</p>
                      <p className="text-sm text-text-secondary">{currentUser?.email}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-surface-container rounded-2xl border border-outline-variant/10 space-y-4">
                  <h3 className="font-semibold text-text-primary text-sm uppercase tracking-wider">Profile Info</h3>
                  
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-text-tertiary uppercase tracking-widest">Preferred Name</label>
                    <p className="text-xs text-text-secondary">What should we (and the AI) call you?</p>
                    <div className="flex flex-col md:flex-row gap-3 w-full">
                      <input 
                        type="text" 
                        value={preferredName}
                        onChange={(e) => setPreferredName(e.target.value)}
                        placeholder="e.g. Alex"
                        className="flex-1 min-w-0 w-full bg-bg-sunken px-4 py-2 rounded-xl border border-border-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-text-primary placeholder:text-text-tertiary"
                      />
                      <button 
                        onClick={handleSaveName}
                        disabled={isSavingName || preferredName === (userProfile?.preferredName || '')}
                        className="px-4 py-2 bg-primary text-white rounded-xl font-medium disabled:opacity-50 hover:bg-primary-container transition-colors whitespace-nowrap w-full md:w-auto"
                      >
                        {isSavingName ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {saveMessage && (
                      <p className={cn("text-xs", saveMessage.includes('Failed') ? "text-danger-text" : "text-success-text")}>
                        {saveMessage}
                      </p>
                    )}
                  </div>
                </div>

                <button 
                  onClick={async () => {
                    await signOut(auth);
                  }}
                  className="w-full flex items-center justify-between p-4 bg-danger/10 hover:bg-danger/20 text-danger-text rounded-2xl transition-colors font-semibold"
                >
                  <div className="flex items-center gap-3">
                    <LogOut className="w-5 h-5" /> Sign out of all devices
                  </div>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'academics' && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-text-primary mb-1">Academics</h2>
                <p className="text-sm text-text-secondary">Sets which year and semester your courses are drawn from.</p>
              </div>

              <div className="p-4 bg-surface-container rounded-2xl border border-outline-variant/10 space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-text-tertiary uppercase tracking-widest">Year</label>
                  <div className="relative">
                    <select
                      value={currentYear}
                      onChange={(e) => handleAcademic('year', e.target.value)}
                      className="appearance-none w-full bg-bg-sunken border border-border-medium rounded-xl px-4 py-2.5 pr-10 text-sm font-semibold text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y} className="bg-bg-page text-text-primary">{y}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-text-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-text-tertiary uppercase tracking-widest">Semester</label>
                  <div className="relative">
                    <select
                      value={currentSem}
                      onChange={(e) => handleAcademic('semester', e.target.value)}
                      className="appearance-none w-full bg-bg-sunken border border-border-medium rounded-xl px-4 py-2.5 pr-10 text-sm font-semibold text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    >
                      {SEMS.map((s) => (
                        <option key={s} value={s} className="bg-bg-page text-text-primary">{s}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-text-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-text-tertiary uppercase tracking-widest">Department</label>
                  <div className="px-4 py-2.5 bg-bg-sunken/60 border border-border-subtle rounded-xl text-sm text-text-secondary">
                    {userProfile?.department || 'Chemical Engineering'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-text-primary mb-1">Preferences</h2>
                <p className="text-sm text-text-secondary">Customize your experience.</p>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-surface-container rounded-2xl border border-outline-variant/10 space-y-4">
                  <div>
                    <h3 className="font-semibold text-text-primary">Theme Accent Color</h3>
                    <p className="text-sm text-text-secondary mb-4">Choose your preferred primary color.</p>
                    <div className="flex flex-wrap gap-4">
                      {THEME_COLORS.map(color => {
                        const isSelected = (userProfile?.themeAccent || 'blue') === color.id;
                        return (
                          <button
                            key={color.id}
                            onClick={() => handleSelectAccent(color.id)}
                            className="flex flex-col items-center gap-2 group"
                          >
                            <div 
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center transition-transform",
                                isSelected ? "ring-2 ring-offset-2 ring-offset-surface-container ring-primary" : "hover:scale-110"
                              )}
                              style={{ backgroundColor: color.value }}
                            >
                              {isSelected && <Check className="w-5 h-5 text-white" />}
                            </div>
                            <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">
                              {color.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-text-primary mb-1">Notifications</h2>
                <p className="text-sm text-text-secondary">Control what updates you receive.</p>
              </div>

              <div className="space-y-2">
                {NOTIF_OPTIONS.map((n) => {
                  const on = notifOn(n.key);
                  return (
                    <button
                      key={n.key}
                      type="button"
                      onClick={() => handleToggleNotif(n.key)}
                      role="switch"
                      aria-checked={on}
                      className="w-full p-4 bg-surface-container rounded-2xl border border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-container-highest transition-colors text-left"
                    >
                      <div>
                        <h3 className="font-semibold text-text-primary text-sm">{n.title}</h3>
                        <p className="text-xs text-text-secondary">{n.desc}</p>
                      </div>
                      <div className={cn(
                        "w-10 h-5 rounded-full relative shrink-0 transition-colors duration-200",
                        on ? "bg-primary" : "bg-border-medium"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-out",
                          on ? "translate-x-5" : "translate-x-0"
                        )} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
