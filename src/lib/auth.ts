import { api, clearAuthToken, setAuthToken } from './api';
import type { User } from '../types/models';

const USER_KEY = 'salaam_user';

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function storeUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthState() {
  clearAuthToken();
  localStorage.removeItem(USER_KEY);
}

export async function login(email: string, password: string) {
  const result = await api.login(email, password);
  setAuthToken(result.token);
  storeUser(result.user);
  return result.user;
}

export async function logout() {
  try {
    await api.logout();
  } finally {
    clearAuthState();
  }
}
