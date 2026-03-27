import type {
  AppSettings,
  Booking,
  CarReportPeriod,
  CarReportResponse,
  Customer,
  DashboardPayload,
  FinanceCloseOverview,
  DiscountType,
  CustomerReportResponse,
  FleetReportResponse,
  ReportPreset,
  ReportJobResponse,
  ManagedCar,
  FinanceReportResponse,
  NotificationItem,
  OfficeFinanceSummary,
  OwnerPayoutSummary,
  Transaction,
  User,
} from '../types/models';

const RAW_API_BASE =
  String(import.meta.env.VITE_API_BASE_URL || '').trim() ||
  (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api');
const API_BASE = RAW_API_BASE.replace(/\/+$/, '').endsWith('/api')
  ? RAW_API_BASE.replace(/\/+$/, '')
  : `${RAW_API_BASE.replace(/\/+$/, '')}/api`;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    const hint = import.meta.env.DEV
      ? `Start the backend server with "npm run server". If it is already running, make sure CORS_ORIGIN allows ${window.location.origin} (or keep ALLOW_LOCALHOST_CORS=true).`
      : 'Make sure `/api` is deployed or set VITE_API_BASE_URL to your backend URL.';
    throw new Error(
      `Cannot reach API at ${API_BASE}. ${hint}`
    );
  }
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Request failed: ${response.status}`);
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
  forgotPassword(email: string) {
    return request<{ success: boolean; message: string; resetUrl?: string; resetToken?: string; expiresAt?: string }>(
      '/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      }
    );
  },
  resetPassword(token: string, newPassword: string) {
    return request<{ success: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  me() {
    return request<{ user: User }>('/auth/me');
  },

  logout() {
    return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  },
  updateProfile(payload: {
    username?: string;
    email?: string;
    name?: string;
    title?: string;
    currentPassword?: string;
    newPassword?: string;
  }) {
    return request<{ user: User }>('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) });
  },
  listUsers() {
    return request<User[]>('/users');
  },
  createUser(payload: {
    username: string;
    email: string;
    password: string;
    role: string;
    name: string;
    title?: string;
  }) {
    return request<User>('/users', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateUser(id: string, payload: Partial<User> & { password?: string }) {
    return request<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteUser(id: string) {
    return request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' });
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
  getCarReport(
    carId: string,
    params?: {
      period?: CarReportPeriod;
      from?: string;
      to?: string;
      month?: number;
      year?: number;
      page?: number;
      pageSize?: number;
      all?: boolean;
    }
  ) {
    const query = new URLSearchParams();
    if (params?.period) query.set('period', params.period);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.month) query.set('month', String(params.month));
    if (params?.year) query.set('year', String(params.year));
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.all) query.set('all', 'true');
    const qs = query.toString();
    return request<CarReportResponse>(`/cars/${carId}/report${qs ? `?${qs}` : ''}`);
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
  createBooking(payload: {
    carId: string;
    customerId: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    discountType?: DiscountType;
    discountValue?: number;
    isOutsider?: boolean;
    referralFeeAmount?: number;
  }) {
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
  listOwnerPayoutSummaries() {
    return request<OwnerPayoutSummary[]>('/owners/payout-summaries');
  },
  getOfficeFinanceSummary() {
    return request<OfficeFinanceSummary>('/finance/office-summary');
  },
  getFinanceReport(params?: {
    from?: string;
    to?: string;
    includeDetails?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.includeDetails === false) query.set('includeDetails', 'false');
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<FinanceReportResponse>(`/reports/finance${qs ? `?${qs}` : ''}`);
  },
  getFinanceCloses() {
    return request<FinanceCloseOverview>('/finance/closes');
  },
  closeDailyFinance(date: string) {
    return request<{ id: string; closeDate: string; closingBalance: number }>(
      '/finance/close/daily',
      {
        method: 'POST',
        body: JSON.stringify({ date }),
      }
    );
  },
  closeMonthlyFinance(year: number, month: number) {
    return request<{ id: string; year: number; month: number; closingBalance: number }>(
      '/finance/close/monthly',
      {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      }
    );
  },
  getCustomerReport(params?: {
    customerId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.customerId) query.set('customerId', params.customerId);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<CustomerReportResponse>(`/reports/customers${qs ? `?${qs}` : ''}`);
  },
  getFleetReport(params?: {
    carId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.carId) query.set('carId', params.carId);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<FleetReportResponse>(`/reports/fleet${qs ? `?${qs}` : ''}`);
  },
  listReportPresets(scope?: 'finance' | 'customers' | 'fleet') {
    const qs = scope ? `?scope=${scope}` : '';
    return request<ReportPreset[]>(`/reports/presets${qs}`);
  },
  createReportPreset(payload: { name: string; scope: 'finance' | 'customers' | 'fleet'; filters?: Record<string, unknown> }) {
    return request<ReportPreset>('/reports/presets', { method: 'POST', body: JSON.stringify(payload) });
  },
  deleteReportPreset(id: string) {
    return request<{ success: boolean }>(`/reports/presets/${id}`, { method: 'DELETE' });
  },
  createReportJob(payload: { reportType: 'finance' | 'customers' | 'fleet'; format?: 'json' | 'pdf' | 'xlsx'; filters?: Record<string, unknown> }) {
    return request<{ id: string; status: string; reportType: string; format: string; createdAt: string }>('/reports/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getReportJob(id: string) {
    return request<ReportJobResponse>(`/reports/jobs/${id}`);
  },

  getSettings() {
    return request<AppSettings>('/settings');
  },
  updateSettings(payload: AppSettings) {
    return request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(payload) });
  },
  async listNotifications(limit = 50) {
    try {
      return await request<NotificationItem[]>(`/notifications?limit=${limit}`);
    } catch (error) {
      if (!(error instanceof Error) || !/Route not found/i.test(error.message)) {
        throw error;
      }
      const dashboard = await request<DashboardPayload>('/dashboard');
      return (dashboard.activities || [])
        .filter((act) => act.type === 'booking' || /^(Reminder:|Overdue:|Alert:)/.test(String(act.message || '')))
        .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
        .slice(0, Math.max(1, Math.min(200, Number(limit || 50))));
    }
  },
  async clearNotifications() {
    try {
      return await request<{ success: boolean; deleted: number }>('/notifications', { method: 'DELETE' });
    } catch (error) {
      if (error instanceof Error && /Route not found/i.test(error.message)) {
        return { success: true, deleted: 0 };
      }
      throw error;
    }
  },
};
