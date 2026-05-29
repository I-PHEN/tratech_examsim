import { useState } from 'react';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { auth } from './lib/firebase';
import { useAuth } from './lib/AuthContext';
import { Mail, Loader2, RefreshCw, LogOut, ArrowRight } from 'lucide-react';
import { cn } from './lib/utils';

export function VerifyEmailScreen() {
  const { currentUser } = useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const handleResend = async () => {
    if (!auth.currentUser) return;
    setResending(true);
    setMsg(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setMsg({ text: 'Verification email re-sent. Check your inbox (and spam).', type: 'success' });
    } catch (e: any) {
      const code = e?.code as string | undefined;
      setMsg({
        text:
          code === 'auth/too-many-requests'
            ? 'Too many attempts. Wait a moment, then try again.'
            : 'Could not send verification email. Try again in a moment.',
        type: 'error',
      });
    } finally {
      setResending(false);
    }
  };

  const handleContinue = async () => {
    if (!auth.currentUser) return;
    setChecking(true);
    setMsg(null);
    try {
      await auth.currentUser.reload();
      // Force a fresh ID token so the backend sees email_verified: true.
      await auth.currentUser.getIdToken(true);
      if (auth.currentUser.emailVerified) {
        // Hard reload so AuthContext re-runs from scratch and routes to the app.
        window.location.reload();
      } else {
        setMsg({
          text: "We don't see a verified email yet. Click the link in your inbox, then try again.",
          type: 'info',
        });
      }
    } catch (e) {
      setMsg({ text: 'Could not refresh your account. Try again.', type: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen bg-bg-surface flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Mail className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary uppercase tracking-tight">
            Verify your email
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            We sent a verification link to{' '}
            <span className="font-bold text-text-primary">{currentUser?.email}</span>.
            Open it to activate your account, then click below.
          </p>
        </div>

        {msg && (
          <div
            className={cn(
              'p-3 rounded-lg text-xs font-bold text-center border',
              msg.type === 'success' && 'bg-success/10 border-success/30 text-success-text',
              msg.type === 'info' && 'bg-primary/10 border-primary/30 text-primary',
              msg.type === 'error' && 'bg-danger-muted border-danger/20 text-danger'
            )}
          >
            {msg.text}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleContinue}
            disabled={checking || resending}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-slate-950 font-bold rounded-xl hover:shadow-[0_0_20px_theme(colors.primary)] transition-all uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            I've verified — continue
          </button>

          <button
            onClick={handleResend}
            disabled={resending || checking}
            className="w-full flex items-center justify-center gap-2 py-3 border border-border-medium rounded-xl hover:bg-bg-raised transition-colors text-sm font-bold text-text-primary uppercase tracking-wide disabled:opacity-50"
          >
            {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Resend email
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-text-tertiary hover:text-text-primary font-bold uppercase tracking-widest"
          >
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>

        <p className="text-[11px] text-text-tertiary text-center leading-relaxed">
          Used the wrong email? Sign out and create a new account.
        </p>
      </div>
    </div>
  );
}
