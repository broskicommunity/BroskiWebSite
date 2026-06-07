import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface RequireAdminProps {
  children: React.ReactNode;
}

const RequireAdmin: React.FC<RequireAdminProps> = ({ children }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-76px)] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-container border-t-transparent"></div>
          <p className="font-body-sm text-on-surface-variant">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!loading) {
    if (!user || !profile) {
      return <Navigate to="/signin" replace />;
    }

    if (profile.role !== 'admin') {
      return (
        <div className="flex min-h-[calc(100vh-76px)] items-center justify-center px-4">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] border-[4px] border-black bg-surface-container p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border-4 border-black bg-error-container shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]">
                <span className="material-symbols-outlined text-3xl text-on-error-container">gavel</span>
              </div>
              <h1 className="font-headline-lg text-[32px] uppercase leading-none text-error drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                ACCESSO NEGATO
              </h1>
              <p className="font-body-sm font-bold text-on-surface-variant">
                Solo gli amministratori possono accedere a questa area.
              </p>
              <a
                href="/admin/setup"
                className="w-full rounded-2xl border-[4px] border-black bg-surface-bright px-6 py-4 text-center font-headline-md text-[18px] text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                RICHIEDI ACCESSO ADMIN
              </a>
            </div>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

export default RequireAdmin;
