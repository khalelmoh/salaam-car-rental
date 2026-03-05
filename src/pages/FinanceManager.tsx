import { useState, useMemo, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Plus, Trash2, Download, X, Save, Edit } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import StatsCard from '../components/StatsCard';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { Booking, Transaction, TransactionType } from '../types/models';
import { notifyDataChanged } from '../utils/realtime';
import { useToast } from '../hooks/useToast';
import { downloadStyledReportPdf } from '../utils/reportPdfTemplate';
import { formatDateDMY } from '../utils/date';
import './FinanceManager.css';

const normalizeType = (value: string): TransactionType =>
  String(value).toLowerCase() === 'expense'
    ? 'Expense'
    : String(value).toLowerCase() === 'commission'
      ? 'Commission'
      : 'Income';

const normalizeTransactions = (items: Transaction[]): Transaction[] =>
  items.map((item) => ({
    ...item,
    type: normalizeType(item.type),
    amount: Number(item.amount || 0),
  }));

const FinanceManager = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8);

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
        setTransactions(normalizeTransactions(trxData));
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
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const income = transactions
      .filter((t) => {
        if (normalizeType(t.type) !== 'Income') return false;
        if (!t.bookingId) return true;
        return bookingById.get(t.bookingId)?.paymentStatus === 'paid';
      })
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const expenses = transactions
      .filter((t) => ['Expense', 'Commission'].includes(normalizeType(t.type)))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const pendingAmount = bookings
      .filter((b) => b.paymentStatus === 'pending' && b.status !== 'cancelled')
      .reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    return { income, expenses, netProfit: income - expenses, pendingAmount };
  }, [transactions, bookings]);

  const totalPages = Math.max(1, Math.ceil(transactions.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedTransactions = transactions.slice(startIndex, startIndex + rowsPerPage);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
        setTransactions((prev) =>
          normalizeTransactions(prev.map((t) => (t.id === editingId ? updated : t)))
        );
        showToast('Transaction updated.', 'success');
        notifyDataChanged();
      } else {
        const created = await api.createTransaction({
          date: newDate,
          description: newDesc,
          type: newType,
          amount,
          category: newCategory,
        });
        setTransactions((prev) => normalizeTransactions([created, ...prev]));
        setCurrentPage(1);
        showToast('Transaction added.', 'success');
        notifyDataChanged();
      }
      setShowForm(false);
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save transaction.';
      setError(message);
      showToast(message, 'error');
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

  const handleDelete = async (trx: Transaction) => {
    const isBookingLinked = Boolean(trx.bookingId);
    const message = isBookingLinked
      ? 'This transaction is linked to a booking. Delete the booking and its transaction?'
      : 'Delete this transaction?';
    if (!window.confirm(message)) return;
    try {
      if (isBookingLinked && trx.bookingId) {
        await api.deleteBooking(trx.bookingId);
        setBookings((prev) => prev.filter((b) => b.id !== trx.bookingId));
        setTransactions((prev) => prev.filter((t) => t.bookingId !== trx.bookingId));
        showToast('Booking and linked transaction deleted.', 'success');
      } else {
        await api.deleteTransaction(trx.id);
        setTransactions((prev) => prev.filter((t) => t.id !== trx.id));
        showToast('Transaction deleted.', 'success');
      }
      notifyDataChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete transaction.';
      setError(message);
      showToast(message, 'error');
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

  const handleDownloadReport = () => {
    const rows = transactions.map((trx) => ([
        trx.id,
        formatDateDMY(trx.date),
        trx.description,
        trx.category,
        trx.type,
        `${['Expense', 'Commission'].includes(trx.type) ? '-' : '+'}$${Number(trx.amount || 0).toFixed(2)}`,
      ]));

    downloadStyledReportPdf({
      title: 'Finance Report',
      summaryLine: `Income: $${financials.income.toFixed(2)}   Expenses: $${financials.expenses.toFixed(2)}   Net: $${financials.netProfit.toFixed(2)}   Pending: $${financials.pendingAmount.toFixed(2)}`,
      filters: [
        { label: 'Date Range', value: 'All Time' },
        { label: 'Rows Exported', value: transactions.length },
      ],
      summaryCards: [
        { label: 'Income', value: `$${financials.income.toFixed(2)}` },
        { label: 'Expenses', value: `$${financials.expenses.toFixed(2)}` },
        { label: 'Net Profit', value: `$${financials.netProfit.toFixed(2)}` },
        { label: 'Pending', value: `$${financials.pendingAmount.toFixed(2)}` },
      ],
      headers: ['Transaction ID', 'Date', 'Description', 'Category', 'Type', 'Amount'],
      rows,
      fileName: `finance-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      footerText: 'Salaam Car Rental - Internal Report',
    });
  };

  return (
    <DashboardLayout title="Financial Overview">
      {isLoading && <div className="section-card no-print" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading finance data...</div>}
      {error && <div className="section-card no-print" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}
      <div className="finance-actions no-print reveal-up">
        <Button variant={showForm ? 'danger' : 'primary'} onClick={() => { if (!showForm) resetForm(); setShowForm(!showForm); }}>
          {showForm ? <><X size={18} /> Cancel</> : <><Plus size={18} /> Add Transaction</>}
        </Button>
        <Button onClick={handleDownloadReport} variant="secondary">
          <Download size={18} /> Download Report
        </Button>
      </div>

      {showForm && (
        <div className="transaction-form-card no-print reveal-up delay-1">
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
                  <option value="Commission">Commission</option>
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

      <div className="stats-grid print-break-avoid reveal-up delay-1">
        <StatsCard title="Total Income" value={`$${financials.income.toLocaleString()}`} icon={<TrendingUp size={24} />} color="#ad1a24" trend={{ value: 8, isPositive: true }} />
        <StatsCard title="Total Expenses" value={`$${financials.expenses.toLocaleString()}`} icon={<TrendingDown size={24} />} color="#ef4444" trend={{ value: 3, isPositive: false }} />
        <StatsCard title="Net Profit" value={`$${financials.netProfit.toLocaleString()}`} icon={<DollarSign size={24} />} color="#3b82f6" trend={{ value: 12, isPositive: true }} />
        <StatsCard title="Pending Payments" value={`$${financials.pendingAmount.toLocaleString()}`} icon={<CreditCard size={24} />} color="#f59e0b" />
      </div>

      <div className="section-card print-break-avoid reveal-up delay-2">
        <div className="card-header">
          <h3>Transaction History</h3>
          <div className="finance-pagination-meta no-print">
            <label htmlFor="finance-rows-per-page">Rows</label>
            <select
              id="finance-rows-per-page"
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
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted">No transactions to show for the selected page.</td>
                </tr>
              ) : (
                paginatedTransactions.map((trx) => (
                  <tr key={trx.id}>
                    <td className="font-medium text-sm text-muted">{trx.id}</td>
                    <td>{formatDateDMY(trx.date)}</td>
                    <td>
                      {trx.description}
                      {trx.bookingId ? <div className="text-muted text-sm">Linked booking: {trx.bookingId}</div> : null}
                    </td>
                    <td><span className="badge">{trx.category}</span></td>
                    <td>
                      <span className={`badge ${trx.type === 'Expense' ? 'badge-danger' : trx.type === 'Commission' ? 'badge-commission' : 'badge-success'}`}>
                        {trx.type}
                      </span>
                    </td>
                    <td className={`font-bold ${['Expense', 'Commission'].includes(trx.type) ? 'text-red' : 'text-green'}`}>
                      {['Expense', 'Commission'].includes(trx.type) ? '-' : '+'}${trx.amount}
                    </td>
                    <td className="no-print">
                      <button
                        className="action-btn primary"
                        onClick={() => handleEdit(trx)}
                        title="Edit Transaction"
                        aria-label={`Edit transaction ${trx.id}`}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="action-btn danger"
                        onClick={() => handleDelete(trx)}
                        title={trx.bookingId ? 'Delete Booking + Transaction' : 'Delete Transaction'}
                        aria-label={`Delete transaction ${trx.id}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="finance-pagination no-print">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="finance-page-indicator">Page {currentPage}/{totalPages}</span>
          <label htmlFor="finance-page-jump" className="finance-page-jump-label">Go to</label>
          <select
            id="finance-page-jump"
            className="finance-page-jump-select"
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

export default FinanceManager;
