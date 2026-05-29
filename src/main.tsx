import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import App from './App.tsx';
import { AdminDashboardScreen } from './Admin.tsx';
import { AuthProvider, useAuth } from './lib/AuthContext.tsx';
import { OnboardingScreen } from './OnboardingScreen.tsx';
import { VerifyEmailScreen } from './VerifyEmailScreen.tsx';
import { ProfileSetupScreen } from './ProfileSetupScreen.tsx';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './index.css';

function AdminRoute() {
  const { currentUser, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) return null;

  // Email-verification gate also applies here so an unverified admin can't
  // bypass /admin. Bounce to / and let ProtectedApp render the verify screen.
  if (currentUser && !currentUser.emailVerified) {
    return <Navigate to="/" replace />;
  }

  // Access is enforced server-side by `requireAdmin` (email allowlist) on every
  // /api route. The old UI passcode was decorative, so it's gone.
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <AdminDashboardScreen onBack={() => navigate('/')} />;
}

function ProtectedApp() {
  const { currentUser, userProfile, isLoading } = useAuth();

  if (isLoading || (currentUser && userProfile === null)) {
    return (
      <div className="fixed inset-0 bg-bg-surface flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <OnboardingScreen />;
  }

  // Real-email gate. Google sign-in stamps email_verified=true automatically,
  // so this only blocks password-signups that haven't clicked the verify link.
  if (!currentUser.emailVerified) {
    return <VerifyEmailScreen />;
  }

  if (userProfile && (!userProfile.department || !userProfile.year || !userProfile.semester)) {
    return <ProfileSetupScreen />;
  }

  return <App />;
}

function Router() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ProtectedApp />} />
          <Route path="/admin" element={<AdminRoute />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
