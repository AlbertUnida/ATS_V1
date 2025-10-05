const STORAGE_KEY = 'talentflow.auth';
export const AUTH_EVENT = 'talentflow:auth-changed';

export type StoredAuth = {
  token: string;
  user: {
    user_id: string;
    email: string;
    nombre: string;
    rol: string;
    company_id: string | null;
    is_super_admin: boolean;
  };
};

let currentAuth: StoredAuth | null = loadFromStorage();

function loadFromStorage(): StoredAuth | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

function persist(value: StoredAuth | null) {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function getAuth(): StoredAuth | null {
  return currentAuth;
}

export function setAuth(value: StoredAuth) {
  currentAuth = value;
  persist(value);
}

export function clearAuth() {
  currentAuth = null;
  persist(null);
}
