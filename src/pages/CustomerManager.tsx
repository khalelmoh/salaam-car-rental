import { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit, Phone, Mail, MapPin, CreditCard } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import './CustomerManager.css';

export interface Customer {
    id: string;
    fullName: string;
    phone: string;
    email: string;
    nationalId: string;
    driverLicenseNumber: string;
    address: string;
}

const initialCustomers: Customer[] = [
    {
        id: 'CUST-1001',
        fullName: 'Ahmed Ali',
        phone: '+971 50 123 4567',
        email: 'ahmed@example.com',
        nationalId: '784-1234-1234567-1',
        driverLicenseNumber: 'DXB-98765',
        address: 'Downtown Dubai, Boulevard Plaza'
    },
    {
        id: 'CUST-1002',
        fullName: 'Sarah Smith',
        phone: '+971 55 987 6543',
        email: 'sarah@example.com',
        nationalId: '784-5678-7654321-2',
        driverLicenseNumber: 'DXB-54321',
        address: 'Dubai Marina, Marina Gate'
    }
];

const CustomerManager = () => {
    // LocalStorage Persistence
    const [customers, setCustomers] = useState<Customer[]>(() => {
        const saved = localStorage.getItem('salaam_customers');
        return saved ? JSON.parse(saved) : initialCustomers;
    });

    useEffect(() => {
        localStorage.setItem('salaam_customers', JSON.stringify(customers));
        // Dispatch event for other components (like BookingManager) to update
        window.dispatchEvent(new Event('storage'));
    }, [customers]);

    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState<Omit<Customer, 'id'>>({
        fullName: '',
        phone: '',
        email: '',
        nationalId: '',
        driverLicenseNumber: '',
        address: ''
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingId) {
            // Update Existing
            setCustomers(customers.map(c =>
                c.id === editingId ? { ...formData, id: editingId } : c
            ));
        } else {
            // Create New
            const newCustomer: Customer = {
                id: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
                ...formData
            };
            setCustomers([newCustomer, ...customers]);
        }

        resetForm();
    };

    const handleEdit = (customer: Customer) => {
        setFormData({
            fullName: customer.fullName,
            phone: customer.phone,
            email: customer.email,
            nationalId: customer.nationalId,
            driverLicenseNumber: customer.driverLicenseNumber,
            address: customer.address
        });
        setEditingId(customer.id);
        setShowForm(true);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this customer?')) {
            setCustomers(customers.filter(c => c.id !== id));
        }
    };

    const resetForm = () => {
        setFormData({
            fullName: '', phone: '', email: '', nationalId: '', driverLicenseNumber: '', address: ''
        });
        setEditingId(null);
        setShowForm(false);
    };

    const filteredCustomers = customers.filter(c =>
        c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <DashboardLayout title="Customer Management">
            <div className="fleet-controls">
                <div className="control-group">
                    <div className="search-wrapper">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search customers..."
                            className="table-search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <Button onClick={() => { resetForm(); setShowForm(!showForm); }}>
                    <Plus size={18} /> {showForm ? 'Cancel' : 'Add Customer'}
                </Button>
            </div>

            {showForm && (
                <div className="booking-form-card">
                    <h3>{editingId ? 'Edit Customer' : 'Add New Customer'}</h3>
                    <form onSubmit={handleSubmit} className="booking-form">
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Full Name</label>
                                <input name="fullName" required className="form-input" value={formData.fullName} onChange={handleInputChange} />
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input name="phone" required className="form-input" value={formData.phone} onChange={handleInputChange} />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input name="email" type="email" required className="form-input" value={formData.email} onChange={handleInputChange} />
                            </div>
                            <div className="form-group">
                                <label>National ID</label>
                                <input name="nationalId" required className="form-input" value={formData.nationalId} onChange={handleInputChange} />
                            </div>
                            <div className="form-group">
                                <label>Driver License</label>
                                <input name="driverLicenseNumber" required className="form-input" value={formData.driverLicenseNumber} onChange={handleInputChange} />
                            </div>
                            <div className="form-group">
                                <label>Address</label>
                                <input name="address" required className="form-input" value={formData.address} onChange={handleInputChange} />
                            </div>
                        </div>
                        <div className="form-footer">
                            <Button type="submit">{editingId ? 'Update Customer' : 'Save Customer'}</Button>
                        </div>
                    </form>
                </div>
            )}

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Contact Info</th>
                            <th>Documents</th>
                            <th>Address</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCustomers.map(customer => (
                            <tr key={customer.id}>
                                <td className="font-medium text-sm text-muted">{customer.id}</td>
                                <td className="font-medium">{customer.fullName}</td>
                                <td>
                                    <div className="contact-info">
                                        <div className="info-row"><Phone size={14} /> {customer.phone}</div>
                                        <div className="info-row"><Mail size={14} /> {customer.email}</div>
                                    </div>
                                </td>
                                <td>
                                    <div className="contact-info">
                                        <div className="info-row" title="National ID"><CreditCard size={14} /> {customer.nationalId}</div>
                                        <div className="info-row text-muted" title="License">Lic: {customer.driverLicenseNumber}</div>
                                    </div>
                                </td>
                                <td>
                                    <div className="info-row"><MapPin size={14} /> {customer.address}</div>
                                </td>
                                <td>
                                    <div className="table-actions">
                                        <button className="action-btn primary" onClick={() => handleEdit(customer)}>
                                            <Edit size={16} />
                                        </button>
                                        <button className="action-btn danger" onClick={() => handleDelete(customer.id)}>
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

export default CustomerManager;
