import type {
  AppSettings,
  Booking,
  Customer,
  DashboardPayload,
  ManagedCar,
  Transaction,
  User,
} from '../types/models';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'salaam_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data as T;
}

export const api = {
  async login(email: string, password: string) {
    return request<{ token: string; user: User; expiresAt: number }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return request<{ user: User }>('/auth/me');
  },

  logout() {
    return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  },

  getDashboard() {
    return request<DashboardPayload>('/dashboard');
  },

  listCars() {
    return request<ManagedCar[]>('/cars');
  },
  createCar(payload: Omit<ManagedCar, 'id'>) {
    return request<ManagedCar>('/cars', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateCar(id: string, payload: Partial<ManagedCar>) {
    return request<ManagedCar>(`/cars/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteCar(id: string) {
    return request<{ success: boolean }>(`/cars/${id}`, { method: 'DELETE' });
  },

  listCustomers() {
    return request<Customer[]>('/customers');
  },
  createCustomer(payload: Omit<Customer, 'id'>) {
    return request<Customer>('/customers', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateCustomer(id: string, payload: Partial<Customer>) {
    return request<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteCustomer(id: string) {
    return request<{ success: boolean }>(`/customers/${id}`, { method: 'DELETE' });
  },

  listBookings() {
    return request<Booking[]>('/bookings');
  },
  createBooking(payload: Pick<Booking, 'carId' | 'customerId' | 'startDate' | 'endDate'>) {
    return request<Booking>('/bookings', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateBooking(id: string, payload: Partial<Booking>) {
    return request<Booking>(`/bookings/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteBooking(id: string) {
    return request<{ success: boolean }>(`/bookings/${id}`, { method: 'DELETE' });
  },

  listTransactions() {
    return request<Transaction[]>('/transactions');
  },
  createTransaction(payload: Omit<Transaction, 'id'>) {
    return request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateTransaction(id: string, payload: Partial<Transaction>) {
    return request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteTransaction(id: string) {
    return request<{ success: boolean }>(`/transactions/${id}`, { method: 'DELETE' });
  },

  getSettings() {
    return request<AppSettings>('/settings');
  },
  updateSettings(payload: AppSettings) {
    return request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(payload) });
  },
};
