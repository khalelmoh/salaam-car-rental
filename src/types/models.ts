export type CarStatus = 'Available' | 'Rented' | 'Maintenance';
export type BookingStatus = 'reserved' | 'active' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid';
export type TransactionType = 'Income' | 'Expense';

export interface User {
  id: string;
  email: string;
  role: string;
  name: string;
}

export interface ManagedCar {
  id: string;
  name: string;
  category: string;
  image: string;
  pricePerDay: number;
  transmission: string;
  seats: number;
  fuelType: string;
  mpg: string;
  status: CarStatus;
  licensePlate: string;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  nationalId: string;
  driverLicenseNumber: string;
  address: string;
}

export interface Booking {
  id: string;
  carId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount: number;
  category: string;
}

export interface AppSettings {
  companyName: string;
  contactEmail: string;
  currency: string;
  taxRate: number;
  bookingLeadHours: number;
}

export interface DashboardPayload {
  totalFleet: number;
  activeRentals: number;
  totalRevenue: number;
  utilization: number;
  activities: Array<{
    id: string;
    message: string;
    timestamp: number;
    type?: string;
  }>;
  revenueData: Array<{ name: string; revenue: number }>;
  fleetStatusData: Array<{ name: string; value: number; color: string }>;
}
