import { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit, Phone, Mail, MapPin, CreditCard } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { Customer } from '../types/models';
import './CustomerManager.css';

const emptyForm = {
  fullName: '',
  phone: '',
  email: '',
  nationalId: '',
  driverLicenseNumber: '',
  address: '',
};

const CustomerManager = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Customer, 'id'>>(emptyForm);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await api.listCustomers();
        setCustomers(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customers.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      if (editingId) {
        const updated = await api.updateCustomer(editingId, formData);
        setCustomers(customers.map((c) => (c.id === editingId ? updated : c)));
        setSuccess('Customer updated.');
      } else {
        const created = await api.createCustomer(formData);
        setCustomers([created, ...customers]);
        setSuccess('Customer added.');
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer.');
    }
  };

  const handleEdit = (customer: Customer) => {
    setFormData({
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      nationalId: customer.nationalId,
      driverLicenseNumber: customer.driverLicenseNumber,
      address: customer.address,
    });
    setEditingId(customer.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    setError('');
    try {
      await api.deleteCustomer(id);
      setCustomers(customers.filter((c) => c.id !== id));
      setSuccess('Customer deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer.');
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout title="Customer Management">
      {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading customers...</div>}
      {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}
      {success && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#15803d' }}>{success}</div>}
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
            {filteredCustomers.map((customer) => (
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
