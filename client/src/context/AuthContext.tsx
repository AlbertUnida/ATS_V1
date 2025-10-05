import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AUTH_EVENT, clearAuth, getAuth, setAuth, type StoredAuth } from '../lib/session';
import { login as loginRequest, type LoginResponse } from '../api';

type AuthContextValue = {
  user: StoredAuth['user'] | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<StoredAuth | null>(() => getAuth());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sync = () => setAuthState(getAuth());
    if (typeof window !== 'undefined') {
      window.addEventListener(AUTH_EVENT, sync);
      window.addEventListener('storage', sync);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(AUTH_EVENT, sync);
        window.removeEventListener('storage', sync);
      }
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await loginRequest({ email, password });
      const value: StoredAuth = { token: data.token, user: data.user };
      setAuth(value);
      setAuthState(value);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearAuth();
    setAuthState(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      loading,
      login,
      logout,
    }),
    [auth, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
