import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import * as legacyController from '../controllers/apiController.js';
import * as authController from '../controllers/authController.js';
import * as bookingController from '../controllers/bookingController.js';
import * as transactionController from '../controllers/transactionController.js';
import * as financeCloseController from '../controllers/financeCloseController.js';
import * as systemController from '../controllers/systemController.js';
import * as docsController from '../controllers/docsController.js';
import * as reportController from '../controllers/reportController.js';

const router = Router();

router.get('/health', authController.health);
router.get('/api/health', authController.health);
router.post('/api/auth/login', authController.login);
router.post('/api/auth/forgot-password', authController.forgotPassword);
router.post('/api/auth/reset-password', authController.resetPassword);
router.get('/api/openapi.json', docsController.openApiJson);
router.get('/api/docs', docsController.docsUi);

router.use('/api', requireAuth);

router.get('/api/auth/me', authController.me);
router.post('/api/auth/logout', authController.logout);
router.put('/api/auth/profile', authController.updateProfile);

router.get('/api/users', requireRole('admin', 'manager'), legacyController.listUsers);
router.post('/api/users', requireRole('admin'), legacyController.createUser);
router.put('/api/users/:id', requireRole('admin'), legacyController.updateUser);
router.delete('/api/users/:id', requireRole('admin'), legacyController.deleteUser);

router.get('/api/dashboard', systemController.dashboard);

router.get('/api/cars', legacyController.listCars);
router.post('/api/cars', requireRole('admin', 'manager'), legacyController.createCar);
router.put('/api/cars/:id', requireRole('admin', 'manager'), legacyController.updateCar);
router.delete('/api/cars/:id', requireRole('admin', 'manager', 'staff'), legacyController.deleteCar);
router.get('/api/cars/:id/report', requireRole('admin', 'manager'), systemController.carReport);

router.get('/api/customers', legacyController.listCustomers);
router.post('/api/customers', requireRole('admin', 'manager', 'staff'), legacyController.createCustomer);
router.put('/api/customers/:id', requireRole('admin', 'manager', 'staff'), legacyController.updateCustomer);
router.delete('/api/customers/:id', requireRole('admin', 'manager'), legacyController.deleteCustomer);

router.get('/api/bookings', bookingController.listBookings);
router.post('/api/bookings', requireRole('admin', 'manager', 'staff'), bookingController.createBooking);
router.put('/api/bookings/:id', requireRole('admin', 'manager', 'staff'), bookingController.updateBooking);
router.delete('/api/bookings/:id', requireRole('admin', 'manager'), bookingController.deleteBooking);

router.get('/api/transactions', transactionController.listTransactions);
router.post('/api/transactions', requireRole('admin', 'manager'), transactionController.createTransaction);
router.put('/api/transactions/:id', requireRole('admin', 'manager'), transactionController.updateTransaction);
router.delete('/api/transactions/:id', requireRole('admin', 'manager'), transactionController.deleteTransaction);
router.get('/api/finance/close', requireRole('admin', 'manager'), financeCloseController.listCloseOverview);
router.get('/api/finance/closes', requireRole('admin', 'manager'), financeCloseController.listCloseOverview);
router.post('/api/finance/close/daily', requireRole('admin', 'manager'), financeCloseController.closeDaily);
router.post('/api/finance/close/monthly', requireRole('admin', 'manager'), financeCloseController.closeMonthly);

router.get('/api/settings', requireRole('admin', 'manager'), systemController.getSettings);
router.put('/api/settings', requireRole('admin'), systemController.updateSettings);

router.get('/api/notifications', systemController.listNotifications);
router.delete('/api/notifications', requireRole('admin', 'manager'), systemController.deleteNotifications);
router.get('/api/reports/finance', requireRole('admin', 'manager'), reportController.financeReport);
router.get('/api/reports/customers', requireRole('admin', 'manager', 'staff'), reportController.customerReport);
router.get('/api/reports/fleet', requireRole('admin', 'manager', 'staff'), reportController.fleetReport);
router.get('/api/reports/presets', requireRole('admin', 'manager', 'staff'), reportController.listReportPresets);
router.post('/api/reports/presets', requireRole('admin', 'manager', 'staff'), reportController.createReportPreset);
router.delete('/api/reports/presets/:id', requireRole('admin', 'manager', 'staff'), reportController.deleteReportPreset);
router.post('/api/reports/jobs', requireRole('admin', 'manager'), reportController.createReportJob);
router.get('/api/reports/jobs/:id', requireRole('admin', 'manager', 'staff'), reportController.getReportJob);

export { router };
