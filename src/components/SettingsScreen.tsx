import React, { useState } from 'react';
import { ChevronLeft, User, Bell, Shield, Paintbrush, LogOut, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'account' | 'preferences' | 'notifications'>('account');

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

          <nav className="flex flex-col gap-1">
            <button 
              onClick={() => setActiveTab('account')}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl transition-colors font-medium text-sm text-left",
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
                "flex items-center justify-between p-3 rounded-xl transition-colors font-medium text-sm text-left",
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
                "flex items-center justify-between p-3 rounded-xl transition-colors font-medium text-sm text-left",
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
                      <span className="text-primary font-bold text-lg uppercase">{currentUser?.email?.charAt(0) || 'U'}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">{currentUser?.displayName || 'Student'}</p>
                      <p className="text-sm text-text-secondary">{currentUser?.email}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-surface-container rounded-2xl border border-outline-variant/10 space-y-4">
                  <h3 className="font-semibold text-text-primary text-sm uppercase tracking-wider">Profile Info</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-text-tertiary uppercase tracking-widest mb-1.5">Registered Year</label>
                      <div className="bg-bg-sunken px-3 py-2 rounded-lg border border-border-subtle text-text-primary font-medium">
                        {userProfile?.year ? (userProfile.year.startsWith("Year") ? userProfile.year : `Year ${userProfile.year}`) : 'Year 3'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-tertiary uppercase tracking-widest mb-1.5">Current Semester</label>
                      <div className="bg-bg-sunken px-3 py-2 rounded-lg border border-border-subtle text-text-primary font-medium">
                        {userProfile?.semester ? (userProfile.semester.startsWith("Sem") ? userProfile.semester : `Sem ${userProfile.semester}`) : 'Sem 1'}
                      </div>
                    </div>
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
                <div className="p-4 bg-surface-container rounded-2xl border border-outline-variant/10 flex items-center justify-between cursor-pointer hover:bg-surface-container-highest transition-colors">
                  <div>
                    <h3 className="font-semibold text-text-primary">Dark Mode</h3>
                    <p className="text-sm text-text-secondary">Toggle between light and dark theme.</p>
                  </div>
                  <div className="w-12 h-6 bg-primary rounded-full relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
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
