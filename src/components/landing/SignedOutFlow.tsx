import { useState } from 'react';
import { OnboardingScreen } from '../../OnboardingScreen';
import { LandingScreen } from './LandingScreen';

type View = 'landing' | 'auth';
type AuthMode = 'login' | 'signup';

/**
 * Signed-out shell: shows the marketing landing first, then the auth screen when
 * the visitor chooses to sign in or start. All real auth lives in OnboardingScreen.
 */
export function SignedOutFlow() {
  const [view, setView] = useState<View>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

  if (view === 'auth') {
    return <OnboardingScreen initialMode={authMode} onBack={() => setView('landing')} />;
  }
  return (
    <LandingScreen
      onStart={() => {
        setAuthMode('signup');
        setView('auth');
      }}
      onSignIn={() => {
        setAuthMode('login');
        setView('auth');
      }}
    />
  );
}
