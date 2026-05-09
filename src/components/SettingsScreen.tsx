import React, { useState, useEffect } from 'react';
import { ChevronLeft, User, Bell, Paintbrush, LogOut, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

const THEME_COLORS = [
  { id: 'blue', value: '#5B6CF9', name: 'Blue' },
  { id: 'green', value: '#10B981', name: 'Green' },
  { id: 'purple', value: '#8B5CF6', name: 'Purple' },
  { id: 'rose', value: '#F43F5E', name: 'Rose' },
];

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { currentUser, userProfile, updateProfileLocal } = useAuth();
  const [activeTab, setActiveTab] = useState<'account' | 'preferences' | 'notifications'>('account');
  
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
            <h1 className="text-2xl font-bold text-text-primary italic font-['Times_New_Roman']">Settings</h1>
          </div>

          <nav className="flex flex-row md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide shrink-0 items-center md:items-stretch w-[calc(100vw-2rem)] md:w-auto -mx-4 px-4 md:mx-0 md:px-0">
            <button 
              onClick={() => setActiveTab('account')}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl transition-colors font-medium text-sm text-left whitespace-nowrap shrink-0",
                activeTab === 'account' ? "bg-surface-container-highest text-text-primary" : "text-text-secondary hover:bg-surface-container hover:text-text-primary"
              )}
            >
              <div className="flex items-center gap-3">
                <User className="w-4 h-4" /> Account
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('preferences')}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl transition-colors font-medium text-sm text-left whitespace-nowrap shrink-0",
                activeTab === 'preferences' ? "bg-surface-container-highest text-text-primary" : "text-text-secondary hover:bg-surface-container hover:text-text-primary"
              )}
            >
              <div className="flex items-center gap-3">
                <Paintbrush className="w-4 h-4" /> Preferences
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('notifications')}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl transition-colors font-medium text-sm text-left whitespace-nowrap shrink-0",
                activeTab === 'notifications' ? "bg-surface-container-highest text-text-primary" : "text-text-secondary hover:bg-surface-container hover:text-text-primary"
              )}
            >
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4" /> Notifications
              </div>
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
                    <div className="flex gap-3">
                      <input 
                        type="text" 
                        value={preferredName}
                        onChange={(e) => setPreferredName(e.target.value)}
                        placeholder="e.g. Alex"
                        className="flex-1 bg-bg-sunken px-4 py-2 rounded-xl border border-border-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-text-primary placeholder:text-text-tertiary"
                      />
                      <button 
                        onClick={handleSaveName}
                        disabled={isSavingName || preferredName === (userProfile?.preferredName || '')}
                        className="px-4 py-2 bg-primary text-white rounded-xl font-medium disabled:opacity-50 hover:bg-primary-container transition-colors whitespace-nowrap"
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
                {[
                  { title: "Weekly progress report", desc: "Get a summary of your study performance." },
                  { title: "Study reminders", desc: "Notifications when you haven't studied in a while." },
                  { title: "New content available", desc: "Updates on newly added courses and materials." }
                ].map((n, i) => (
                  <div key={i} className="p-4 bg-surface-container rounded-2xl border border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-surface-container-highest transition-colors">
                    <div>
                      <h3 className="font-semibold text-text-primary text-sm">{n.title}</h3>
                      <p className="text-xs text-text-secondary">{n.desc}</p>
                    </div>
                    <div className="w-10 h-5 bg-primary/20 rounded-full relative shrink-0">
                      <div className="absolute right-1 top-0.5 w-4 h-4 bg-primary rounded-full"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
