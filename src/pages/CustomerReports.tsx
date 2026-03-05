import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { Booking, Customer, ManagedCar } from '../types/models';
import { downloadStyledReportPdf } from '../utils/reportPdfTemplate';
import { formatDateDMY } from '../utils/date';
import './CustomerManager.css';
import './CustomerReports.css';

const CustomerReports = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cars, setCars] = useState<ManagedCar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportCustomerId, setReportCustomerId] = useState(searchParams.get('customerId') || '');

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [customerData, bookingData, carData] = await Promise.all([
          api.listCustomers(),
          api.listBookings(),
          api.listCars(),
        ]);
        setCustomers(customerData);
        setBookings(bookingData);
        setCars(carData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customer reports.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!customers.length) {
      if (reportCustomerId !== '') {
        setReportCustomerId('');
      }
      return;
    }

    const paramCustomerId = searchParams.get('customerId') || '';
    const exists = customers.some((customer) => customer.id === paramCustomerId);
    const nextId = exists ? paramCustomerId : customers[0].id;

    if (reportCustomerId !== nextId) {
      setReportCustomerId(nextId);
    }
    if (paramCustomerId !== nextId) {
      setSearchParams({ customerId: nextId }, { replace: true });
    }
  }, [customers, reportCustomerId, searchParams, setSearchParams]);

  const selectedReportCustomer = customers.find((customer) => customer.id === reportCustomerId) || null;

  const selectedCustomerBookings = useMemo(
    () => bookings
      .filter((booking) => booking.customerId === reportCustomerId)
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')),
    [bookings, reportCustomerId]
  );

  const customerReportSummary = useMemo(() => {
    const totalBookings = selectedCustomerBookings.length;
    const activeBookings = selectedCustomerBookings.filter((booking) => booking.status === 'active').length;
    const overdueBookings = selectedCustomerBookings.filter((booking) => booking.status === 'overdue').length;
    const completedBookings = selectedCustomerBookings.filter((booking) => booking.status === 'completed').length;
    const cancelledBookings = selectedCustomerBookings.filter((booking) => booking.status === 'cancelled').length;
    const totalSpent = selectedCustomerBookings
      .filter((booking) => booking.paymentStatus === 'paid')
      .reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0);
    const pendingAmount = selectedCustomerBookings
      .filter((booking) => booking.paymentStatus === 'pending')
      .reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0);
    return {
      totalBookings,
      activeBookings,
      overdueBookings,
      completedBookings,
      cancelledBookings,
      totalSpent,
      pendingAmount,
    };
  }, [selectedCustomerBookings]);

  const getCarName = (carId: string) => cars.find((car) => car.id === carId)?.name || carId;
  const getBookingDateRange = (booking: Booking) => `${formatDateDMY(booking.startDate)}${booking.endDate ? ` -> ${formatDateDMY(booking.endDate)}` : ''}`;

  const handleDownloadSingleCustomerReport = () => {
    if (!selectedReportCustomer) return;
    const rows = selectedCustomerBookings.map((booking) => ([
        booking.id,
        getCarName(booking.carId),
        getBookingDateRange(booking),
        `${booking.startTime || '--'} -> ${booking.endTime || '--'}`,
        booking.status,
        booking.paymentStatus,
        `$${Number(booking.totalAmount || 0).toFixed(2)}`,
      ]));

    downloadStyledReportPdf({
      title: `Customer Report - ${selectedReportCustomer.fullName}`,
      summaryLine: `Bookings: ${customerReportSummary.totalBookings}   Paid: $${customerReportSummary.totalSpent.toFixed(2)}   Pending: $${customerReportSummary.pendingAmount.toFixed(2)}`,
      filters: [
        { label: 'Customer ID', value: selectedReportCustomer.id },
        { label: 'Number-ka Damiinka', value: selectedReportCustomer.email || '--' },
      ],
      summaryCards: [
        { label: 'Total Bookings', value: customerReportSummary.totalBookings },
        { label: 'Active', value: customerReportSummary.activeBookings },
        { label: 'Completed', value: customerReportSummary.completedBookings },
        { label: 'Pending Amount', value: `$${customerReportSummary.pendingAmount.toFixed(2)}` },
      ],
      headers: ['Booking ID', 'Vehicle', 'Date Range', 'Time', 'Status', 'Payment', 'Amount'],
      rows,
      fileName: `customer-${selectedReportCustomer.fullName.replace(/\s+/g, '-').toLowerCase()}-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      footerText: 'Salaam Car Rental - Internal Report',
    });
  };

  return (
    <DashboardLayout title="Customer Reports">
      {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading customer reports...</div>}
      {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}

      {!isLoading && !error && (
        <div className="section-card customer-report-card">
          <div className="reports-topbar">
            <Button variant="outline" onClick={() => navigate('/customers')}>
              <ArrowLeft size={16} /> Back to Customers
            </Button>
          </div>

          <div className="customer-report-header">
            <h3>Customer Reports</h3>
            <div className="customer-report-actions">
              <select
                value={reportCustomerId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSearchParams({ customerId: nextId }, { replace: true });
                }}
                className="customer-report-select"
              >
                {customers.length === 0 && <option value="">No customers</option>}
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.fullName} ({customer.id})
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={handleDownloadSingleCustomerReport} disabled={!selectedReportCustomer}>
                <Download size={16} /> Download Selected Report
              </Button>
            </div>
          </div>

          {selectedReportCustomer ? (
            <>
              <div className="customer-report-meta">
                <span>{selectedReportCustomer.fullName}</span>
                <span>Number-ka Damiinka: {selectedReportCustomer.email}</span>
                <span>{selectedReportCustomer.phone}</span>
              </div>

              <div className="customer-report-stats">
                <div className="report-stat"><small>Total Bookings</small><strong>{customerReportSummary.totalBookings}</strong></div>
                <div className="report-stat"><small>Active</small><strong>{customerReportSummary.activeBookings}</strong></div>
                <div className="report-stat"><small>Overdue</small><strong>{customerReportSummary.overdueBookings}</strong></div>
                <div className="report-stat"><small>Completed</small><strong>{customerReportSummary.completedBookings}</strong></div>
                <div className="report-stat"><small>Cancelled</small><strong>{customerReportSummary.cancelledBookings}</strong></div>
                <div className="report-stat"><small>Total Paid</small><strong>${customerReportSummary.totalSpent.toFixed(2)}</strong></div>
                <div className="report-stat"><small>Pending</small><strong>${customerReportSummary.pendingAmount.toFixed(2)}</strong></div>
              </div>

              <div className="table-container customer-report-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Booking ID</th>
                      <th>Vehicle</th>
                      <th>Date Range</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCustomerBookings.length === 0 && (
                      <tr>
                        <td colSpan={7} className="customer-empty-state">
                          No bookings found for this customer.
                        </td>
                      </tr>
                    )}
                    {selectedCustomerBookings.map((booking) => (
                      <tr key={booking.id}>
                        <td className="font-medium text-sm text-muted">{booking.id}</td>
                        <td>{getCarName(booking.carId)}</td>
                        <td>{getBookingDateRange(booking)}</td>
                        <td>{booking.startTime || '--'} {'->'} {booking.endTime || '--'}</td>
                        <td className="text-capitalize">{booking.status}</td>
                        <td className="text-capitalize">{booking.paymentStatus}</td>
                        <td>${Number(booking.totalAmount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="customer-empty-state">Select a customer to view their report.</div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
};

export default CustomerReports;
