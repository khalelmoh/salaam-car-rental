import { useEffect, useMemo, useState } from 'react';
import { Check, X, Plus, DollarSign, Play, Archive, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { Booking, Customer, ManagedCar } from '../types/models';
import './BookingManager.css';

const BookingManager = () => {
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cars, setCars] = useState<ManagedCar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCarId, setSelectedCarId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [bookingData, customerData, carData] = await Promise.all([
          api.listBookings(),
          api.listCustomers(),
          api.listCars(),
        ]);
        setBookings(bookingData);
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

  const calculatedTotal = useMemo(() => {
    if (!selectedCarId || !startDate || !endDate) return 0;
    const car = cars.find((c) => c.id === selectedCarId);
    if (!car) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return days * car.pricePerDay;
  }, [selectedCarId, startDate, endDate, cars]);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCarId || !selectedCustomerId || !startDate || !endDate) {
      setError('Please complete all required booking fields.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date must be after start date.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      const booking = await api.createBooking({
        customerId: selectedCustomerId,
        carId: selectedCarId,
        startDate,
        endDate,
      });
      setBookings([booking, ...bookings]);
      setSuccess('Booking created.');
      setShowForm(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking.');
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setSelectedCarId('');
    setStartDate('');
    setEndDate('');
  };

  const updateStatus = async (id: string, newStatus: Booking['status']) => {
    try {
      const updated = await api.updateBooking(id, { status: newStatus });
      setBookings(bookings.map((b) => (b.id === id ? updated : b)));
      setSuccess(`Booking ${id} updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking status.');
    }
  };

  const updatePayment = async (id: string, newPayment: Booking['paymentStatus']) => {
    try {
      const updated = await api.updateBooking(id, { paymentStatus: newPayment });
      setBookings(bookings.map((b) => (b.id === id ? updated : b)));
      setSuccess(`Payment updated for ${id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this booking?')) return;
    try {
      await api.deleteBooking(id);
      setBookings(bookings.filter((b) => b.id !== id));
      setSuccess('Booking deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete booking.');
    }
  };

  const getCustomerName = (id: string) => customers.find((c) => c.id === id)?.fullName || id;
  const getCarName = (id: string) => cars.find((c) => c.id === id)?.name || id;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="badge badge-success">Active</span>;
      case 'reserved': return <span className="badge badge-primary">Reserved</span>;
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

  return (
    <DashboardLayout title="Booking Management">
      {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading bookings...</div>}
      {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}
      {success && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#15803d' }}>{success}</div>}
      <div className="fleet-controls">
        <h2 className="section-title">Reservations</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={18} /> {showForm ? 'Cancel' : 'New Booking'}
        </Button>
      </div>

      {showForm && (
        <div className="booking-form-card">
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
                    <option key={car.id} value={car.id}>
                      {car.name} (${car.pricePerDay}/day)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <input required type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input required type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="form-footer">
              <div className="total-display">
                <span className="label">Total:</span>
                <span className="amount">${calculatedTotal.toFixed(2)}</span>
              </div>
              <Button type="submit">Confirm Reservation</Button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Vehicle</th>
              <th>Dates</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td className="font-medium">{booking.id}</td>
                <td>{getCustomerName(booking.customerId)}</td>
                <td>{getCarName(booking.carId)}</td>
                <td>
                  <div className="date-range">
                    <span>{booking.startDate}</span>
                    <span className="text-muted"> to </span>
                    <span>{booking.endDate}</span>
                  </div>
                </td>
                <td>${booking.totalAmount}</td>
                <td>{getPaymentBadge(booking.paymentStatus)}</td>
                <td>{getStatusBadge(booking.status)}</td>
                <td>
                  <div className="table-actions">
                    {booking.paymentStatus === 'pending' && booking.status !== 'cancelled' && (
                      <button className="action-btn success" onClick={() => updatePayment(booking.id, 'paid')} title="Mark Paid">
                        <DollarSign size={18} />
                      </button>
                    )}
                    {booking.status === 'reserved' && (
                      <>
                        <button className="action-btn primary" onClick={() => updateStatus(booking.id, 'active')} title="Start Rental">
                          <Play size={18} />
                        </button>
                        <button className="action-btn danger" onClick={() => updateStatus(booking.id, 'cancelled')} title="Cancel">
                          <X size={18} />
                        </button>
                      </>
                    )}
                    {booking.status === 'active' && (
                      <button className="action-btn" onClick={() => updateStatus(booking.id, 'completed')} title="Complete & Return">
                        <Check size={18} />
                      </button>
                    )}
                    {booking.status === 'completed' && (
                      <button className="action-btn disabled" disabled title="Archived">
                        <Archive size={18} />
                      </button>
                    )}
                    <button className="action-btn danger" onClick={() => handleDelete(booking.id)} title="Delete Booking">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
};

export default BookingManager;
