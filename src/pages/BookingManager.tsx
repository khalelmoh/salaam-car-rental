import { useEffect, useMemo, useState } from 'react';
import { Check, X, Plus, DollarSign, Play, Archive, Trash2, Download } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { Booking, Customer, DiscountType, ManagedCar } from '../types/models';
import { downloadStyledReportPdf } from '../utils/reportPdfTemplate';
import { notifyDataChanged } from '../utils/realtime';
import { useToast } from '../hooks/useToast';
import { formatDateDMY } from '../utils/date';
import './BookingManager.css';

const BookingManager = () => {
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cars, setCars] = useState<ManagedCar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCarId, setSelectedCarId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('17:00');
  const [discountType, setDiscountType] = useState<DiscountType>('fixed');
  const [discountValue, setDiscountValue] = useState('');
  const [referralCommissionValue, setReferralCommissionValue] = useState('');

  const normalizeBookingTimes = (items: Booking[]) =>
    items.map((item) => ({
      ...item,
      startTime: item.startTime || '',
      endTime: item.endTime || '',
    }));

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [bookingData, customerData, carData] = await Promise.all([
          api.listBookings(),
          api.listCustomers(),
          api.listCars(),
        ]);
        setBookings(normalizeBookingTimes(bookingData));
        setCustomers(customerData);
        setCars(carData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load booking data.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const carIdFromUrl = searchParams.get('carId');
    if (carIdFromUrl) {
      setSelectedCarId(carIdFromUrl);
      setShowForm(true);
    }
  }, [searchParams]);

  const bookingTotals = useMemo(() => {
    if (!selectedCarId || !startDate || !endDate || !startTime || !endTime) {
      return { subtotal: 0, discountAmount: 0, total: 0 };
    }
    const car = cars.find((c) => c.id === selectedCarId);
    if (!car) {
      return { subtotal: 0, discountAmount: 0, total: 0 };
    }
    const start = new Date(`${startDate}T${startTime}:00`);
    const end = new Date(`${endDate}T${endTime}:00`);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const subtotal = days * car.pricePerDay;
    const discountInput = Number(discountValue || 0);
    let discountAmount = 0;
    if (!Number.isNaN(discountInput) && discountInput > 0) {
      discountAmount = discountType === 'percent'
        ? subtotal * (discountInput / 100)
        : discountInput;
    }
    discountAmount = Math.max(0, Math.min(subtotal, discountAmount));
    const total = Math.max(0, subtotal - discountAmount);
    return {
      subtotal,
      discountAmount,
      total,
    };
  }, [selectedCarId, startDate, startTime, endDate, endTime, cars, discountType, discountValue]);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCarId || !selectedCustomerId || !startDate || !startTime || !endDate || !endTime) {
      setError('Please complete all required booking fields.');
      return;
    }
    const startDateTime = new Date(`${startDate}T${startTime}:00`);
    const endDateTime = new Date(`${endDate}T${endTime}:00`);
    if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime()) || endDateTime <= startDateTime) {
      setError('End date/time must be after start date/time.');
      return;
    }
    const parsedDiscountValue = Number(discountValue || 0);
    if (Number.isNaN(parsedDiscountValue) || parsedDiscountValue < 0) {
      setError('Discount must be zero or greater.');
      return;
    }
    if (discountType === 'percent' && parsedDiscountValue > 100) {
      setError('Percentage discount cannot exceed 100.');
      return;
    }
    const parsedReferralCommission = Number(referralCommissionValue || 0);
    if (Number.isNaN(parsedReferralCommission) || parsedReferralCommission < 0) {
      setError('Referral commission must be zero or greater.');
      return;
    }
    const selectedCar = cars.find((c) => c.id === selectedCarId);
    if (selectedCar && selectedCar.status !== 'Available') {
      setError(`Selected vehicle is ${selectedCar.status.toLowerCase()} and cannot be booked.`);
      return;
    }
    setError('');
    try {
      const booking = await api.createBooking({
        customerId: selectedCustomerId,
        carId: selectedCarId,
        startDate,
        startTime,
        endDate,
        endTime,
        discountType,
        discountValue: parsedDiscountValue,
        isOutsider: parsedReferralCommission > 0,
        referralFeeAmount: parsedReferralCommission,
      });
      const bookingWithTimes: Booking = {
        ...booking,
        startTime: booking.startTime || startTime,
        endTime: booking.endTime || endTime,
      };
      setBookings((prev) => [bookingWithTimes, ...prev]);
      showToast('Booking created.', 'success');
      notifyDataChanged();
      setShowForm(false);
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create booking.';
      setError(message);
      showToast(message, 'error');
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setSelectedCarId('');
    setStartDate('');
    setStartTime('09:00');
    setEndDate('');
    setEndTime('17:00');
    setDiscountType('fixed');
    setDiscountValue('');
    setReferralCommissionValue('');
  };

  const updateStatus = async (id: string, newStatus: Booking['status']) => {
    try {
      const updated = await api.updateBooking(id, { status: newStatus });
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...updated,
                startTime: updated.startTime || b.startTime || '',
                endTime: updated.endTime || b.endTime || '',
              }
            : b
        )
      );
      showToast(`Booking ${id} updated.`, 'success');
      notifyDataChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update booking status.';
      setError(message);
      showToast(message, 'error');
    }
  };

  const updatePayment = async (id: string, newPayment: Booking['paymentStatus']) => {
    try {
      const updated = await api.updateBooking(id, { paymentStatus: newPayment });
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...updated,
                startTime: updated.startTime || b.startTime || '',
                endTime: updated.endTime || b.endTime || '',
              }
            : b
        )
      );
      showToast(`Payment updated for ${id}.`, 'success');
      notifyDataChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update payment.';
      setError(message);
      showToast(message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this booking?')) return;
    try {
      await api.deleteBooking(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
      showToast('Booking deleted.', 'success');
      notifyDataChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete booking.';
      setError(message);
      showToast(message, 'error');
    }
  };

  const getCustomerName = (id: string) => customers.find((c) => c.id === id)?.fullName || id;
  const getCarName = (id: string) => cars.find((c) => c.id === id)?.name || id;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="badge badge-success">Active</span>;
      case 'reserved': return <span className="badge badge-primary">Reserved</span>;
      case 'overdue': return <span className="badge badge-danger">Overdue</span>;
      case 'cancelled': return <span className="badge badge-danger">Cancelled</span>;
      case 'completed': return <span className="badge badge-neutral">Completed</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const getPaymentBadge = (status: string) => (
    status === 'paid'
      ? <span className="badge badge-success-outline">Paid</span>
      : <span className="badge badge-warning-outline">Pending</span>
  );

  const handleDownloadReport = () => {
    const reservedCount = bookings.filter((b) => b.status === 'reserved').length;
    const activeCount = bookings.filter((b) => b.status === 'active').length;
    const overdueCount = bookings.filter((b) => b.status === 'overdue').length;
    const completedCount = bookings.filter((b) => b.status === 'completed').length;
    const cancelledCount = bookings.filter((b) => b.status === 'cancelled').length;
    const totalAmount = bookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);

    const rows = bookings.slice(0, 300).map((b) => ([
      b.id,
      getCustomerName(b.customerId),
      getCarName(b.carId),
      formatDateDMY(b.startDate),
      b.startTime || '--',
      formatDateDMY(b.endDate),
      b.endTime || '--',
      `$${Number(b.totalAmount).toFixed(2)}`,
      b.status,
      b.paymentStatus,
    ]));

    downloadStyledReportPdf({
      title: 'Booking Report',
      summaryLine: `Reserved: ${reservedCount}   Active: ${activeCount}   Overdue: ${overdueCount}   Completed: ${completedCount}   Cancelled: ${cancelledCount}`,
      filters: [
        { label: 'Date Range', value: 'All Time' },
        { label: 'Rows Exported', value: rows.length },
      ],
      summaryCards: [
        { label: 'Total Bookings', value: bookings.length },
        { label: 'Reserved', value: reservedCount },
        { label: 'Active', value: activeCount },
        { label: 'Total Value', value: `$${totalAmount.toLocaleString()}` },
      ],
      headers: ['ID', 'Customer', 'Vehicle', 'Start Date', 'Start Time', 'End Date', 'End Time', 'Amount', 'Status', 'Payment'],
      rows,
      columnStyles: {
        0: { cellWidth: 66 },
        1: { cellWidth: 96 },
        2: { cellWidth: 96 },
        3: { cellWidth: 64 },
        4: { cellWidth: 54 },
        5: { cellWidth: 64 },
        6: { cellWidth: 54 },
        7: { cellWidth: 64 },
        8: { cellWidth: 58 },
        9: { cellWidth: 58 },
      },
      footerText: 'Salaam Car Rental - Internal Report',
      fileName: `booking-report-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  const totalPages = Math.max(1, Math.ceil(bookings.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedBookings = bookings.slice(startIndex, startIndex + rowsPerPage);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <DashboardLayout title="Booking Management">
      {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading bookings...</div>}
      {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}
      <div className="fleet-controls reveal-up">
        <h2 className="section-title">Reservations</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={handleDownloadReport}>
            <Download size={18} /> Download Report
          </Button>
          <Button variant={showForm ? 'danger' : 'primary'} onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={18} /> : <Plus size={18} />} {showForm ? 'Cancel' : 'New Booking'}
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="booking-form-card reveal-up delay-1">
          <h3>Create New Reservation</h3>
          <form onSubmit={handleCreateBooking} className="booking-form">
            <div className="form-grid">
              <div className="form-group">
                <label>Customer</label>
                <select
                  required
                  className="form-input"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="">Select Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Vehicle</label>
                <select
                  required
                  className="form-input"
                  value={selectedCarId}
                  onChange={(e) => setSelectedCarId(e.target.value)}
                >
                  <option value="">Select Vehicle</option>
                  {cars.map((car) => (
                    <option key={car.id} value={car.id} disabled={car.status !== 'Available'}>
                      {car.name} (${car.pricePerDay}/day) {car.status !== 'Available' ? `- ${car.status}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <input required type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Start Time</label>
                <input required type="time" className="form-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input required type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>End Time</label>
                <input required type="time" className="form-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Discount Type</label>
                <select className="form-input" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
                  <option value="fixed">Fixed ($)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Discount Value</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 25'}
                />
              </div>
              <div className="form-group">
                <label>Referral Commission</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={referralCommissionValue}
                  onChange={(e) => setReferralCommissionValue(e.target.value)}
                  placeholder="e.g. 15"
                />
              </div>
            </div>

            <div className="form-footer">
              <div className="totals-summary">
                <div className="total-display">
                  <span className="label">Subtotal:</span>
                  <span className="amount-small">${bookingTotals.subtotal.toFixed(2)}</span>
                </div>
                <div className="total-display">
                  <span className="label">Discount:</span>
                  <span className="amount-small">-${bookingTotals.discountAmount.toFixed(2)}</span>
                </div>
                <div className="total-display">
                  <span className="label">Total:</span>
                  <span className="amount">${bookingTotals.total.toFixed(2)}</span>
                </div>
              </div>
              <Button type="submit">Confirm Reservation</Button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container reveal-up delay-2">
        <div className="booking-pagination-meta no-print">
          <label htmlFor="booking-rows-per-page">Rows</label>
          <select
            id="booking-rows-per-page"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={5}>5</option>
            <option value={8}>8</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
          </select>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Vehicle</th>
              <th>Dates</th>
              <th>Time</th>
              <th>Amount</th>
              <th>Discount</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedBookings.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-muted">No bookings found. Try adjusting filters or create a new booking.</td>
              </tr>
            ) : (
              paginatedBookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="font-medium">{booking.id}</td>
                  <td>{getCustomerName(booking.customerId)}</td>
                  <td>{getCarName(booking.carId)}</td>
                  <td>
                    <div className="date-range">
                      <span>{formatDateDMY(booking.startDate)}</span>
                      <span className="text-muted"> to </span>
                      <span>{formatDateDMY(booking.endDate)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="date-range">
                      <span>{booking.startTime || '--'}</span>
                      <span className="text-muted"> to </span>
                      <span>{booking.endTime || '--'}</span>
                    </div>
                  </td>
                  <td>${booking.totalAmount}</td>
                  <td>
                    {Number(booking.discountAmount || 0) > 0
                      ? `-${Number(booking.discountAmount || 0).toFixed(2)}`
                      : '-'}
                  </td>
                  <td>{getPaymentBadge(booking.paymentStatus)}</td>
                  <td>{getStatusBadge(booking.status)}</td>
                  <td>
                    <div className="table-actions">
                      {booking.paymentStatus === 'pending' && booking.status !== 'cancelled' && (
                        <button className="action-btn success" onClick={() => updatePayment(booking.id, 'paid')} title="Mark Paid" aria-label={`Mark booking ${booking.id} as paid`}>
                          <DollarSign size={18} />
                        </button>
                      )}
                      {booking.status === 'reserved' && (
                        <>
                          <button className="action-btn primary" onClick={() => updateStatus(booking.id, 'active')} title="Start Rental" aria-label={`Start booking ${booking.id}`}>
                            <Play size={18} />
                          </button>
                          <button className="action-btn danger" onClick={() => updateStatus(booking.id, 'cancelled')} title="Cancel" aria-label={`Cancel booking ${booking.id}`}>
                            <X size={18} />
                          </button>
                        </>
                      )}
                      {(booking.status === 'active' || booking.status === 'overdue') && (
                        <button className="action-btn" onClick={() => updateStatus(booking.id, 'completed')} title="Complete & Return" aria-label={`Complete booking ${booking.id}`}>
                          <Check size={18} />
                        </button>
                      )}
                      {booking.status === 'completed' && (
                        <button className="action-btn disabled" disabled title="Archived" aria-label={`Booking ${booking.id} archived`}>
                          <Archive size={18} />
                        </button>
                      )}
                      <button className="action-btn danger" onClick={() => handleDelete(booking.id)} title="Delete Booking" aria-label={`Delete booking ${booking.id}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="booking-pagination no-print">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="booking-page-indicator">Page {currentPage}/{totalPages}</span>
          <label htmlFor="booking-page-jump" className="booking-page-jump-label">Go to</label>
          <select
            id="booking-page-jump"
            className="booking-page-jump-select"
            value={currentPage}
            onChange={(e) => setCurrentPage(Number(e.target.value))}
          >
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => (
              <option key={page} value={page}>
                {page}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BookingManager;
