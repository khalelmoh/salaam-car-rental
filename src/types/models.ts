export type CarStatus = 'Available' | 'Rented' | 'Maintenance';
export type BookingStatus = 'reserved' | 'active' | 'overdue' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid';
export type TransactionType = 'Income' | 'Expense' | 'Commission';
export type DiscountType = 'fixed' | 'percent';

export interface User {
  id: string;
  username?: string;
  email: string;
  role: string;
  name: string;
  title?: string;
}

export interface ManagedCar {
  id: string;
  name: string;
  category: string;
  ownerPhone?: string;
  image: string;
  pricePerDay: number;
  transmission: string;
  seats: number;
  fuelType: string;
  mpg: string;
  status: CarStatus;
  licensePlate: string;
  createdAt?: string;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  nationalId: string;
  driverLicenseNumber: string;
  damiin: string;
  address: string;
}

export interface Booking {
  id: string;
  carId: string;
  customerId: string;
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount?: number;
  subtotalAmount?: number;
  totalAmount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount: number;
  category: string;
  bookingId?: string;
  systemGenerated?: boolean;
  createdAt?: string;
}

export interface AppSettings {
  companyName: string;
  contactEmail: string;
  currency: string;
  taxRate: number;
  bookingLeadHours: number;
  bookingNotificationsEnabled?: boolean;
  bookingReminderMinutes?: number;
  autoMarkOverdue?: boolean;
}

export interface DashboardPayload {
  totalFleet: number;
  activeRentals: number;
  totalRevenue: number;
  utilization: number;
  utilizationOccupied?: number;
  utilizationTotal?: number;
  activities: Array<{
    id: string;
    message: string;
    timestamp: number;
    type?: string;
  }>;
  revenueData: Array<{ name: string; revenue: number }>;
  fleetStatusData: Array<{ name: string; value: number; color: string }>;
}

export interface NotificationItem {
  id: string;
  message: string;
  timestamp: number;
  type?: string;
}

export type CarReportPeriod = 'all' | 'range' | 'monthly' | 'yearly';

export interface CarReportRow {
  bookingId: string;
  customerName: string;
  startDate: string;
  endDate: string;
  rentalDays: number;
  amountPaid: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}

export interface CarReportResponse {
  car: {
    id: string;
    name: string;
    status: CarStatus;
    licensePlate: string;
    category: string;
  };
  filters: {
    period: CarReportPeriod;
    from: string;
    to: string;
    month: number | null;
    year: number | null;
  };
  summary: {
    totalRentals: number;
    totalDaysRented: number;
    totalRevenue: number;
    averageRevenuePerRental: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  rows: CarReportRow[];
}

export interface ReportGeneratedBy {
  id: string;
  name: string;
  role: string;
}

export interface ReportMetadata<TFilters> {
  generatedAt: string;
  generatedBy: ReportGeneratedBy;
  filters: TFilters;
  timezone: string;
  rowCount: number;
  pageRowCount: number;
}

export interface FinanceReportFilters {
  from: string | null;
  to: string | null;
  includeDetails: boolean;
  page: number;
  pageSize: number;
}

export interface FinanceReportSummary {
  income: number;
  expenses: number;
  netProfit: number;
  pendingAmount: number;
}

export interface FinanceReportRow {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount: number;
  category: string;
  bookingId?: string;
  systemGenerated?: boolean;
  createdAt?: string;
}

export interface FinanceReportResponse {
  reportVersion: string;
  generatedAt: string;
  timezone: string;
  generatedBy: ReportGeneratedBy;
  filters: FinanceReportFilters;
  metadata: ReportMetadata<FinanceReportFilters>;
  summary: FinanceReportSummary;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  rows: FinanceReportRow[];
}

export interface CustomerReportResponse {
  reportVersion: string;
  generatedAt: string;
  timezone: string;
  generatedBy: ReportGeneratedBy;
  filters: {
    customerId?: string | null;
    from: string | null;
    to: string | null;
    page: number;
    pageSize: number;
  };
  metadata: ReportMetadata<{
    customerId?: string | null;
    from: string | null;
    to: string | null;
    page: number;
    pageSize: number;
  }>;
  summary: {
    totalCustomers: number;
    totalBookings: number;
    totalPaid: number;
    totalPending: number;
  };
  customer?: {
    id: string;
    fullName: string;
    phone: string;
    damiinkaNumber: string;
    damiinkaName: string;
  } | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  rows: Array<Record<string, string | number | boolean | null | undefined>>;
}

export interface FleetReportResponse {
  reportVersion: string;
  generatedAt: string;
  timezone: string;
  generatedBy: ReportGeneratedBy;
  filters: {
    carId?: string | null;
    from: string | null;
    to: string | null;
    page: number;
    pageSize: number;
  };
  metadata: ReportMetadata<{
    carId?: string | null;
    from: string | null;
    to: string | null;
    page: number;
    pageSize: number;
  }>;
  summary: {
    totalCars: number;
    totalBookings: number;
    totalPaidRevenue: number;
    totalPendingRevenue: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  rows: Array<{
    carId: string;
    carName: string;
    status: string;
    licensePlate: string;
    totalBookings: number;
    activeBookings: number;
    paidRevenue: number;
    pendingRevenue: number;
  }>;
}

export interface ReportPreset {
  id: string;
  name: string;
  scope: 'finance' | 'customers' | 'fleet';
  filters: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReportJobResponse {
  id: string;
  reportType: 'finance' | 'customers' | 'fleet';
  format: 'json' | 'pdf' | 'xlsx';
  status: 'pending' | 'running' | 'completed' | 'failed';
  filters: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdBy: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}
