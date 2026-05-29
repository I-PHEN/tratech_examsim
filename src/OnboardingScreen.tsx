import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from './lib/firebase';
import { Target, Zap, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';
import { cn } from './lib/utils';

// Helper to map Firebase errors to human-readable text
function getAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This site is not authorised for sign-in. The admin needs to add this domain in Firebase → Authentication → Settings → Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this project. Enable it in Firebase → Authentication → Sign-in method.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

export function OnboardingScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{text: string, type: 'success' | 'info'} | null>(null);

  const createUserDocument = async (user: any) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userRef);
      if (!docSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("Error creating user doc", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await createUserDocument(result.user);
        // Real-email gate: Firebase only validates email FORMAT, not ownership.
        // Send a verification link; ProtectedApp blocks the user from the app
        // until they click it and reload.
        try {
          await sendEmailVerification(result.user);
        } catch (e) {
          console.error('Failed to send verification email', e);
        }
      }
    } catch (err: any) {
      setError(getAuthErrorMessage(err.code || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await createUserDocument(result.user);
    } catch (err: any) {
      console.error('[Google sign-in failed]', err?.code, err);
      setError(getAuthErrorMessage(err.code || ''));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setResetLoading(true);
    setError(null);
    setMsg(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg({ text: 'Password reset email sent. Check your inbox.', type: 'success' });
    } catch (err: any) {
      setError(getAuthErrorMessage(err.code || ''));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-surface flex flex-col lg:flex-row font-sans">
      {/* Left section: Branding & Info */}
      <div className="w-full lg:w-1/2 p-6 md:p-12 lg:p-20 flex flex-col justify-center lg:justify-between bg-surface-dim border-b lg:border-b-0 lg:border-r border-border-subtle relative overflow-hidden min-h-[30vh] lg:min-h-screen shrink-0">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-primary/5 blur-[100px] rounded-full translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[40rem] h-[40rem] bg-tertiary/5 blur-[100px] rounded-full -translate-x-1/3 translate-y-1/3 pointer-events-none" />
        
        <div className="relative z-10 hidden lg:flex items-center gap-3 h-8 shrink-0 mb-12">
          <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center shrink-0">
            <span className="text-accent font-black">G</span>
          </div>
          <div className="flex flex-col whitespace-nowrap">
            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">The Engine</span>
            <span className="text-[10px] text-text-tertiary uppercase tracking-widest leading-none">Stoic Performance</span>
          </div>
        </div>

        <div className="relative z-10 space-y-4 lg:space-y-6 max-w-lg mt-8 lg:mt-0 mb-8 lg:mb-0">
          <div className="flex lg:hidden items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center shrink-0">
              <span className="text-accent font-black">G</span>
            </div>
            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">The Engine</span>
          </div>
          
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display italic font-bold text-text-primary leading-[1.1]">
            Master your exams. <br className="hidden md:block"/>
            Command your results.
          </h1>
          <p className="text-sm md:text-base text-text-secondary leading-relaxed">
            The Engine is an advanced targeted practice platform. Run full mock exams, focus on weakest topics, and leverage real-time analytics to perfect your strategy before the real midsem.
          </p>
          <div className="hidden md:flex gap-4 pt-4">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <Zap className="w-5 h-5" /> Smart Analytics
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-tertiary">
              <Target className="w-5 h-5" /> Targeted Paths
            </div>
          </div>
        </div>

        <div className="relative z-10 hidden lg:block text-xs text-text-tertiary font-bold tracking-widest uppercase">
          © 2026 Stoic Performance
        </div>
      </div>

      {/* Right section: Login Form */}
      <div className="w-full lg:flex-1 p-6 md:p-12 lg:p-20 flex flex-col justify-center items-center bg-bg-surface py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-text-primary uppercase tracking-tight">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-sm text-text-secondary">
              {isLogin ? 'Enter your details to access your dashboard.' : 'Sign up to start your practice sessions.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border-medium rounded-xl hover:bg-bg-raised transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg-surface text-sm font-bold text-text-primary uppercase tracking-wide disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-subtle" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-bg-surface px-4 text-text-tertiary uppercase tracking-widest font-bold">Or</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-danger-muted border border-danger/20 text-danger text-xs font-bold text-center">
                {error}
              </div>
            )}
            {msg && (
              <div className={cn("p-3 rounded-lg text-xs font-bold text-center border", msg.type === 'success' ? 'bg-success/10 border-success/30 text-success-text' : 'bg-primary/10 border-primary/30 text-primary')}>
                {msg.text}
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">Email Address</label>
              <input
                type="email"
                required
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-low border border-border-subtle rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text-primary text-sm transition-colors"
                placeholder="you@university.edu"
              />
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">Password</label>
                {isLogin && (
                  <button 
                    type="button" 
                    onClick={handlePasswordReset} 
                    disabled={resetLoading}
                    className="text-[10px] font-bold text-primary hover:text-primary-focus uppercase tracking-widest"
                  >
                    {resetLoading ? 'Sending...' : 'Forgot?'}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-4 pr-12 py-3 bg-surface-container-low border border-border-subtle rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text-primary text-sm transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 mt-4 bg-primary text-slate-950 font-bold rounded-xl hover:shadow-[0_0_20px_theme(colors.primary)] transition-all uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setError(null); setMsg(null); }}
              className="text-xs text-text-secondary hover:text-primary transition-colors font-bold uppercase tracking-wide inline-flex items-center gap-2"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
