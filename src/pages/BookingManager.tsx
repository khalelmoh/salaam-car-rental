import { useState, useEffect } from 'react';
import { Check, X, Plus, DollarSign, Play, Archive } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { cars } from '../data/cars';
import { addActivity, dispatchDataUpdate } from '../utils/activity';
import './BookingManager.css';

// Customer type definition
interface Customer {
    id: string;
    fullName: string;
}

const getStoredCustomers = (): Customer[] => {
    const saved = localStorage.getItem('salaam_customers');
    if (saved) {
        return JSON.parse(saved).map((c: any) => ({ id: c.id, fullName: c.fullName }));
    }
    // Fallback if empty (for dev)
    return [
        { id: 'CUST-1001', fullName: 'Ahmed Ali' },
        { id: 'CUST-1002', fullName: 'Sarah Smith' }
    ];
};

interface Booking {
    id: string;
    carId: string;
    customerId: string;
    startDate: string;
    endDate: string;
    totalAmount: number;
    status: 'reserved' | 'active' | 'completed' | 'cancelled';
    paymentStatus: 'pending' | 'paid';
}

const initialBookings: Booking[] = [
    { id: 'BK-1001', carId: '1', customerId: 'CUST-1001', startDate: '2023-11-15', endDate: '2023-11-18', totalAmount: 135, status: 'reserved', paymentStatus: 'pending' },
    { id: 'BK-1002', carId: '2', customerId: 'CUST-1002', startDate: '2023-11-20', endDate: '2023-11-25', totalAmount: 425, status: 'active', paymentStatus: 'paid' },
    { id: 'BK-1003', carId: '3', customerId: 'CUST-1003', startDate: '2023-11-10', endDate: '2023-11-12', totalAmount: 150, status: 'completed', paymentStatus: 'paid' },
];

const BookingManager = () => {
    const [bookings, setBookings] = useState<Booking[]>(() => {
        const saved = localStorage.getItem('salaam_bookings');
        return saved ? JSON.parse(saved) : initialBookings;
    });

    const [availableCustomers, setAvailableCustomers] = useState<Customer[]>(getStoredCustomers());

    // Persist bookings
    useEffect(() => {
        localStorage.setItem('salaam_bookings', JSON.stringify(bookings));
        // notify other parts of the app about bookings change
        dispatchDataUpdate('bookings', bookings);
    }, [bookings]);

    // Listen for customer updates
    useEffect(() => {
        const handleStorageChange = () => {
            setAvailableCustomers(getStoredCustomers());
        };
        // Listen to both 'storage' event (cross-tab) and custom event (same-tab)
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('customer-update', handleStorageChange); // We can dispatch this if needed, or just rely on re-renders if we elevate state. 
        // For simple same-tab checking let's just re-read every time the form opens or component mounts.
        // Actually, the storage event only fires for other tabs. For same-tab, we need a custom event or shared state.
        // Let's stick to the simple 'storage' for now and maybe add a refresh/poll if needed, or dispatch a window event.

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('customer-update', handleStorageChange);
        };
    }, []);

    const [showForm, setShowForm] = useState(false);

    // Form State
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [selectedCarId, setSelectedCarId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [calculatedTotal, setCalculatedTotal] = useState(0);

    // Price Calculation Effect
    useEffect(() => {
        if (selectedCarId && startDate && endDate) {
            const vehicle = cars.find(c => c.id === selectedCarId);
            if (vehicle) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1; // Minimum 1 day
                setCalculatedTotal((diffDays * vehicle.pricePerDay));
            }
        }
    }, [selectedCarId, startDate, endDate]);

    const handleCreateBooking = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCarId || !selectedCustomerId) return;

        const newBooking: Booking = {
            id: `BK-${Math.floor(1000 + Math.random() * 9000)}`,
            customerId: selectedCustomerId,
            carId: selectedCarId,
            startDate,
            endDate,
            totalAmount: calculatedTotal,
            status: 'reserved',
            paymentStatus: 'pending'
        };

        setBookings([newBooking, ...bookings]);
        setShowForm(false);
        resetForm();
        addActivity(`New reservation ${newBooking.id} for ${getCarName(newBooking.carId)} by ${getCustomerName(newBooking.customerId)}`, 'booking');
    };

    const resetForm = () => {
        setSelectedCustomerId('');
        setSelectedCarId('');
        setStartDate('');
        setEndDate('');
        setCalculatedTotal(0);
    };

    const updateStatus = (id: string, newStatus: Booking['status']) => {
        setBookings(bookings.map(b => b.id === id ? { ...b, status: newStatus } : b));
        addActivity(`Booking ${id} status changed to ${newStatus}`, 'booking');
    };

    const updatePayment = (id: string, newPayment: Booking['paymentStatus']) => {
        setBookings(bookings.map(b => b.id === id ? { ...b, paymentStatus: newPayment } : b));
        addActivity(`Payment for ${id} marked ${newPayment}`, 'payment');
    };

    const getCustomerName = (id: string) => availableCustomers.find(c => c.id === id)?.fullName || id;
    const getCarName = (id: string) => cars.find(c => c.id === id)?.name || id;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <span className="badge badge-success">Active</span>;
            case 'reserved': return <span className="badge badge-primary">Reserved</span>;
            case 'cancelled': return <span className="badge badge-danger">Cancelled</span>;
            case 'completed': return <span className="badge badge-neutral">Completed</span>;
            default: return <span className="badge">{status}</span>;
        }
    };

    const getPaymentBadge = (status: string) => {
        return status === 'paid'
            ? <span className="badge badge-success-outline">Paid</span>
            : <span className="badge badge-warning-outline">Pending</span>;
    };

    return (
        <DashboardLayout title="Booking Management">
            <div className="fleet-controls">
                <h2 className="section-title">Reservations</h2>
                <Button onClick={() => {
                    // Refresh customers when opening form
                    setAvailableCustomers(getStoredCustomers());
                    setShowForm(!showForm);
                }}>
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
                                    onChange={e => setSelectedCustomerId(e.target.value)}
                                >
                                    <option value="">Select Customer</option>
                                    {availableCustomers.map(c => (
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
                                    onChange={e => setSelectedCarId(e.target.value)}
                                >
                                    <option value="">Select Vehicle</option>
                                    {cars.map(car => (
                                        <option key={car.id} value={car.id}>
                                            {car.name} (${car.pricePerDay}/day)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Start Date</label>
                                <input
                                    required
                                    type="date"
                                    className="form-input"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>End Date</label>
                                <input
                                    required
                                    type="date"
                                    className="form-input"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                />
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
                        {bookings.map(booking => (
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
                                        {/* Payment Action */}
                                        {booking.paymentStatus === 'pending' && booking.status !== 'cancelled' && (
                                            <button className="action-btn success" onClick={() => updatePayment(booking.id, 'paid')} title="Mark Paid">
                                                <DollarSign size={18} />
                                            </button>
                                        )}

                                        {/* Workflow Actions */}
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
