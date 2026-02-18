import { useState, useMemo, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Plus, Trash2, Printer, X, Save, Edit } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import StatsCard from '../components/StatsCard';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { Booking, Transaction, TransactionType } from '../types/models';
import './FinanceManager.css';

const FinanceManager = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newDate, setNewDate] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<TransactionType>('Income');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [trxData, bookingData] = await Promise.all([api.listTransactions(), api.listBookings()]);
        setTransactions(trxData);
        setBookings(bookingData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load finance data.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const financials = useMemo(() => {
    const income = transactions.filter((t) => t.type === 'Income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions.filter((t) => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0);
    const pendingAmount = bookings
      .filter((b) => b.paymentStatus === 'pending' && b.status !== 'cancelled')
      .reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    return { income, expenses, netProfit: income - expenses, pendingAmount };
  }, [transactions, bookings]);

  const handleAddOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const amount = Number(newAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (!newDate || !newDesc.trim() || !newCategory.trim()) {
      setError('Please complete all transaction fields.');
      return;
    }

    try {
      if (editingId) {
        const updated = await api.updateTransaction(editingId, {
          date: newDate,
          description: newDesc,
          type: newType,
          amount,
          category: newCategory,
        });
        setTransactions(transactions.map((t) => (t.id === editingId ? updated : t)));
        setSuccess('Transaction updated.');
      } else {
        const created = await api.createTransaction({
          date: newDate,
          description: newDesc,
          type: newType,
          amount,
          category: newCategory,
        });
        setTransactions([created, ...transactions]);
        setSuccess('Transaction added.');
      }
      setShowForm(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    }
  };

  const handleEdit = (trx: Transaction) => {
    setEditingId(trx.id);
    setNewDate(trx.date);
    setNewDesc(trx.description);
    setNewType(trx.type);
    setNewAmount(String(trx.amount));
    setNewCategory(trx.category);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.deleteTransaction(id);
      setTransactions(transactions.filter((t) => t.id !== id));
      setSuccess('Transaction deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setNewDate('');
    setNewDesc('');
    setNewType('Income');
    setNewAmount('');
    setNewCategory('');
  };

  const handlePrint = () => window.print();

  return (
    <DashboardLayout title="Financial Overview">
      {isLoading && <div className="section-card no-print" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading finance data...</div>}
      {error && <div className="section-card no-print" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}
      {success && <div className="section-card no-print" style={{ marginBottom: '1rem', padding: '1rem', color: '#15803d' }}>{success}</div>}
      <div className="finance-actions no-print">
        <Button onClick={() => { if (!showForm) resetForm(); setShowForm(!showForm); }}>
          {showForm ? <><X size={18} /> Cancel</> : <><Plus size={18} /> Add Transaction</>}
        </Button>
        <Button onClick={handlePrint} variant="secondary">
          <Printer size={18} /> Print Report
        </Button>
      </div>

      {showForm && (
        <div className="transaction-form-card no-print">
          <h3>{editingId ? 'Edit Transaction' : 'Add New Transaction'}</h3>
          <form onSubmit={handleAddOrUpdate} className="transaction-form">
            <div className="form-grid">
              <div className="form-group">
                <label>Date</label>
                <input type="date" required className="form-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select className="form-input" value={newType} onChange={(e) => setNewType(e.target.value as TransactionType)}>
                  <option value="Income">Income</option>
                  <option value="Expense">Expense</option>
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input type="text" required className="form-input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Amount ($)</label>
                <input type="number" required min="0.01" step="0.01" className="form-input" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input type="text" required className="form-input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              </div>
            </div>
            <div className="form-footer">
              <Button type="submit"><Save size={18} /> {editingId ? 'Update Transaction' : 'Save Transaction'}</Button>
            </div>
          </form>
        </div>
      )}

      <div className="stats-grid print-break-avoid">
        <StatsCard title="Total Income" value={`$${financials.income.toLocaleString()}`} icon={<TrendingUp size={24} />} color="#10b981" trend={{ value: 8, isPositive: true }} />
        <StatsCard title="Total Expenses" value={`$${financials.expenses.toLocaleString()}`} icon={<TrendingDown size={24} />} color="#ef4444" trend={{ value: 3, isPositive: false }} />
        <StatsCard title="Net Profit" value={`$${financials.netProfit.toLocaleString()}`} icon={<DollarSign size={24} />} color="#3b82f6" trend={{ value: 12, isPositive: true }} />
        <StatsCard title="Pending Payments" value={`$${financials.pendingAmount.toLocaleString()}`} icon={<CreditCard size={24} />} color="#f59e0b" />
      </div>

      <div className="section-card print-break-avoid">
        <div className="card-header">
          <h3>Transaction History</h3>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th>Amount</th>
                <th className="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((trx) => (
                <tr key={trx.id}>
                  <td className="font-medium text-sm text-muted">{trx.id}</td>
                  <td>{trx.date}</td>
                  <td>{trx.description}</td>
                  <td><span className="badge">{trx.category}</span></td>
                  <td><span className={`badge ${trx.type === 'Income' ? 'badge-success' : 'badge-danger'}`}>{trx.type}</span></td>
                  <td className={`font-bold ${trx.type === 'Income' ? 'text-green' : 'text-red'}`}>{trx.type === 'Income' ? '+' : '-'}${trx.amount}</td>
                  <td className="no-print">
                    <button className="action-btn primary" onClick={() => handleEdit(trx)} title="Edit Transaction">
                      <Edit size={16} />
                    </button>
                    <button className="action-btn danger" onClick={() => handleDelete(trx.id)} title="Delete Transaction">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default FinanceManager;
