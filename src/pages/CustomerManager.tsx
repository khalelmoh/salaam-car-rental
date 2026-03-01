import { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit, Phone, MapPin, CreditCard, Download, X, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { Customer } from '../types/models';
import { downloadStyledReportPdf } from '../utils/reportPdfTemplate';
import './CustomerManager.css';

const emptyForm = {
  fullName: '',
  phone: '',
  email: '',
  nationalId: '',
  driverLicenseNumber: '',
  damiin: '',
  address: '',
};

const CustomerManager = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8);
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
      damiin: customer.damiin || '',
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

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleDownloadReport = () => {
    const rows = filteredCustomers.slice(0, 150).map((customer, index) => ([
      index + 1,
      customer.id,
      customer.fullName,
      customer.phone,
      customer.damiin || '',
      customer.email,
      customer.nationalId,
      customer.driverLicenseNumber,
      customer.address,
    ]));

    downloadStyledReportPdf({
      title: 'Customer Report',
      summaryLine: `Total Customers: ${customers.length}    Showing: ${filteredCustomers.length}`,
      filters: [
        { label: 'Search', value: searchTerm.trim() || 'All Customers' },
        { label: 'Rows Exported', value: rows.length },
      ],
      summaryCards: [
        { label: 'Total Customers', value: customers.length },
        { label: 'Filtered', value: filteredCustomers.length },
        { label: 'Current Page', value: `${currentPage}/${totalPages}` },
        { label: 'Rows Per Page', value: rowsPerPage },
      ],
      headers: ['#', 'ID', 'Name', 'Phone', 'Damiinka', 'Number-ka Damiinka', 'National ID', 'License', 'Address'],
      rows,
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 60 },
        2: { cellWidth: 120 },
        3: { cellWidth: 78 },
        4: { cellWidth: 110 },
        5: { cellWidth: 130 },
        6: { cellWidth: 90 },
        7: { cellWidth: 90 },
        8: { cellWidth: 120 },
      },
      footerText: 'Salaam Car Rental - Internal Report',
      fileName: `customer-report-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" onClick={() => navigate('/customers/reports')}>
            <FileText size={18} /> Customer Reports
          </Button>
          <Button variant="secondary" onClick={handleDownloadReport}>
            <Download size={18} /> Download Report
          </Button>
          <Button variant={showForm ? 'danger' : 'primary'} onClick={() => { resetForm(); setShowForm(!showForm); }}>
            {showForm ? <X size={18} /> : <Plus size={18} />} {showForm ? 'Cancel' : 'Add Customer'}
          </Button>
        </div>
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
                <label>National ID</label>
                <input name="nationalId" required className="form-input" value={formData.nationalId} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Driver License</label>
                <input name="driverLicenseNumber" required className="form-input" value={formData.driverLicenseNumber} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Damiin</label>
                <input name="damiin" required className="form-input" value={formData.damiin} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Number-ka Damiinka</label>
                <input name="email" type="text" required className="form-input" value={formData.email} onChange={handleInputChange} />
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

      <div className="customer-table-summary">
        <span>Total Customers: {customers.length}</span>
        <span>Showing: {filteredCustomers.length}</span>
      </div>

      <div className="table-container customer-table-container">
        <div className="customer-pagination-meta">
          <label htmlFor="customer-rows-per-page">Rows</label>
          <select
            id="customer-rows-per-page"
            value={rowsPerPage}
            onChange={(e) => setRowsPerPage(Number(e.target.value))}
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
              <th>#</th>
              <th>ID</th>
              <th>Name</th>
              <th>Contact Info</th>
              <th>Documents</th>
              <th>Address</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 && (
              <tr>
                <td colSpan={7} className="customer-empty-state">
                  No customers found for your current search.
                </td>
              </tr>
            )}
            {paginatedCustomers.map((customer, index) => (
              <tr key={customer.id}>
                <td className="customer-index">{startIndex + index + 1}</td>
                <td className="font-medium text-sm text-muted">{customer.id}</td>
                <td>
                  <div className="customer-name-cell">
                    <span className="customer-avatar">{customer.fullName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                    <span className="font-medium">{customer.fullName}</span>
                  </div>
                </td>
                <td>
                  <div className="contact-info">
                    <div className="info-row"><Phone size={14} /> <a href={`tel:${customer.phone}`}>{customer.phone}</a></div>
                    <div className="info-row"><Phone size={14} /> <span>Number-ka Damiinka: {customer.email}</span></div>
                  </div>
                </td>
                <td>
                  <div className="contact-info">
                    <div className="doc-pill" title="National ID"><CreditCard size={14} /> ID: {customer.nationalId}</div>
                    <div className="doc-pill muted" title="Driver License">Lic: {customer.driverLicenseNumber}</div>
                    <div className="doc-pill muted" title="Damiin">Damiin: {customer.damiin}</div>
                  </div>
                </td>
                <td>
                  <div className="info-row address-cell" title={customer.address}><MapPin size={14} /> {customer.address}</div>
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="action-btn"
                      onClick={() => navigate(`/customers/reports?customerId=${encodeURIComponent(customer.id)}`)}
                      title="View Report"
                    >
                      <FileText size={16} />
                    </button>
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
        <div className="customer-pagination">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="customer-page-indicator">Page {currentPage}/{totalPages}</span>
          <label htmlFor="customer-page-jump" className="customer-page-jump-label">Go to</label>
          <select
            id="customer-page-jump"
            className="customer-page-jump-select"
            value={currentPage}
            onChange={(e) => setCurrentPage(Number(e.target.value))}
          >
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => (
              <option key={page} value={page}>{page}</option>
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

export default CustomerManager;
