import { z } from 'zod';

const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

const idField = z.string().min(1);
const isoDate = z.string().regex(dateOnlyRegex);
const isoDateTime = z.string().datetime({ offset: true });

export const generatedBySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  role: z.string().min(1),
}).strict();

export const commonQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(500).optional().default(50),
}).strict();

export const financeReportQuerySchema = commonQuerySchema.extend({
  includeDetails: z.union([z.string(), z.boolean()]).optional().transform((v) => {
    if (v === undefined) return true;
    if (typeof v === 'boolean') return v;
    return v !== 'false';
  }),
}).strict();

export const customerReportQuerySchema = commonQuerySchema.extend({
  customerId: z.string().min(1).optional(),
}).strict();

export const fleetReportQuerySchema = commonQuerySchema.extend({
  carId: z.string().min(1).optional(),
}).strict();

const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(500),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(1),
}).strict();

const financeReportFiltersSchema = z.object({
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  includeDetails: z.boolean(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(500),
}).strict();

const customerReportFiltersSchema = z.object({
  customerId: z.string().nullable().optional(),
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(500),
}).strict();

const fleetReportFiltersSchema = z.object({
  carId: z.string().nullable().optional(),
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(500),
}).strict();

const reportMetadataSchema = (filtersSchema) => z.object({
  generatedAt: isoDateTime,
  generatedBy: generatedBySchema,
  filters: filtersSchema,
  timezone: z.string().min(1),
  rowCount: z.number().int().min(0),
  pageRowCount: z.number().int().min(0),
}).strict();

const financeRowSchema = z.object({
  id: idField,
  date: isoDate,
  description: z.string(),
  type: z.enum(['Income', 'Expense', 'Commission']),
  amount: z.number(),
  category: z.string(),
  bookingId: z.string().optional(),
  systemGenerated: z.boolean(),
  createdAt: isoDateTime,
}).strict();

export const financeReportResponseSchema = z.object({
  reportVersion: z.string().min(1),
  generatedAt: isoDateTime,
  timezone: z.string().min(1),
  generatedBy: generatedBySchema,
  filters: financeReportFiltersSchema,
  metadata: reportMetadataSchema(financeReportFiltersSchema),
  summary: z.object({
    income: z.number(),
    expenses: z.number(),
    netProfit: z.number(),
    pendingAmount: z.number(),
  }).strict(),
  pagination: paginationSchema,
  rows: z.array(financeRowSchema),
}).strict();

const customerBookingRowSchema = z.object({
  bookingId: idField,
  startDate: isoDate,
  endDate: isoDate,
  status: z.enum(['reserved', 'active', 'overdue', 'completed', 'cancelled']),
  paymentStatus: z.enum(['pending', 'paid']),
  amount: z.number(),
  carName: z.string(),
}).strict();

const customerAggregateRowSchema = z.object({
  id: idField,
  fullName: z.string(),
  phone: z.string(),
  damiinkaNumber: z.string(),
  damiinkaName: z.string(),
  totalBookings: z.number().int().min(0),
  totalPaid: z.number(),
  totalPending: z.number(),
}).strict();

export const customerReportResponseSchema = z.object({
  reportVersion: z.string().min(1),
  generatedAt: isoDateTime,
  timezone: z.string().min(1),
  generatedBy: generatedBySchema,
  filters: customerReportFiltersSchema,
  metadata: reportMetadataSchema(customerReportFiltersSchema),
  summary: z.object({
    totalCustomers: z.number().int().min(0),
    totalBookings: z.number().int().min(0),
    totalPaid: z.number(),
    totalPending: z.number(),
  }).strict(),
  customer: z.object({
    id: idField,
    fullName: z.string(),
    phone: z.string(),
    damiinkaNumber: z.string(),
    damiinkaName: z.string(),
  }).strict().nullable().optional(),
  pagination: paginationSchema,
  rows: z.array(z.union([customerBookingRowSchema, customerAggregateRowSchema])),
}).strict();

const fleetRowSchema = z.object({
  carId: idField,
  carName: z.string(),
  status: z.string(),
  licensePlate: z.string(),
  totalBookings: z.number().int().min(0),
  activeBookings: z.number().int().min(0),
  paidRevenue: z.number(),
  pendingRevenue: z.number(),
}).strict();

export const fleetReportResponseSchema = z.object({
  reportVersion: z.string().min(1),
  generatedAt: isoDateTime,
  timezone: z.string().min(1),
  generatedBy: generatedBySchema,
  filters: fleetReportFiltersSchema,
  metadata: reportMetadataSchema(fleetReportFiltersSchema),
  summary: z.object({
    totalCars: z.number().int().min(0),
    totalBookings: z.number().int().min(0),
    totalPaidRevenue: z.number(),
    totalPendingRevenue: z.number(),
  }).strict(),
  pagination: paginationSchema,
  rows: z.array(fleetRowSchema),
}).strict();
