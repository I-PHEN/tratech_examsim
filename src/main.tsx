import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import App from './App.tsx';
import { AdminLoginScreen, AdminDashboardScreen } from './Admin.tsx';
import { AuthProvider, useAuth } from './lib/AuthContext.tsx';
import { OnboardingScreen } from './OnboardingScreen.tsx';
import './index.css';

function AdminRoute() {
  const { currentUser, isAdmin, isLoading } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  if (isLoading) return null;

  if (isAuthenticated && isAdmin) {
    return <AdminDashboardScreen onBack={() => navigate('/')} />;
  }
  
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <AdminLoginScreen onSuccess={() => setIsAuthenticated(true)} onBack={() => navigate('/')} />;
}

function ProtectedApp() {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-bg-surface flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <OnboardingScreen />;
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
