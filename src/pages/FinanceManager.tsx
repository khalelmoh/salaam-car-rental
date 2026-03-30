import { useState, useMemo, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Plus, Trash2, Download, X, Save, Edit, CalendarDays, CalendarRange, Search } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { Booking, FinanceCloseOverview, ManagedCar, OfficeFinanceSummary, OwnerPayoutSummary, Transaction, TransactionType } from '../types/models';
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

const normalizeIsoDate = (value: string | null | undefined): string => String(value || '').slice(0, 10);
const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);
const toFileToken = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'owner';

type OwnerFinanceSnapshot = OwnerPayoutSummary & {
  gross: number;
  commissions: number;
  referralFees: number;
  maintenance: number;
  deductions: number;
  net: number;
};

const FinanceManager = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cars, setCars] = useState<ManagedCar[]>([]);
  const [ownerPayouts, setOwnerPayouts] = useState<OwnerPayoutSummary[]>([]);
  const [officeSummary, setOfficeSummary] = useState<OfficeFinanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8);
  const [closeOverview, setCloseOverview] = useState<FinanceCloseOverview | null>(null);
  const [closeDate, setCloseDate] = useState(new Date().toISOString().slice(0, 10));
  const [closeMonth, setCloseMonth] = useState(new Date().getMonth() + 1);
  const [closeYear, setCloseYear] = useState(new Date().getFullYear());
  const [isClosingDaily, setIsClosingDaily] = useState(false);
  const [isClosingMonthly, setIsClosingMonthly] = useState(false);
  const [isPeriodClosingOpen, setIsPeriodClosingOpen] = useState(false);
  const [closeTab, setCloseTab] = useState<'daily' | 'monthly'>('daily');
  const [searchQuery, setSearchQuery] = useState('');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  const [newDate, setNewDate] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<TransactionType>('Income');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newCarId, setNewCarId] = useState('');
  const [newOwnerPaid, setNewOwnerPaid] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [trxData, bookingData, carData, closesData, payoutData, officeSummaryData] = await Promise.all([
          api.listTransactions(),
          api.listBookings(),
          api.listCars(),
          api.getFinanceCloses(),
          api.listOwnerPayoutSummaries(),
          api.getOfficeFinanceSummary(),
        ]);
        setTransactions(normalizeTransactions(trxData));
        setBookings(bookingData);
        setCars(carData);
        setCloseOverview(closesData);
        setOwnerPayouts(payoutData);
        setOfficeSummary(officeSummaryData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load finance data.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const officeFinancials = officeSummary || {
    officeIncome: 0,
    officeExpenses: 0,
    netProfit: 0,
    pendingOfficeAmount: 0,
  };
  const isNetProfitPositive = officeFinancials.netProfit >= 0;
  const ownerFinanceActivity = useMemo<OwnerFinanceSnapshot[]>(
    () =>
      ownerPayouts
        .map((row) => {
          const gross = Number(row.grossTotal || 0);
          const commissions = Number(row.totalCommissions || 0);
          const referralFees = Number(row.totalReferralFees || 0);
          const maintenance = Number(row.totalMaintenanceDeductions || 0);
          return {
            ...row,
            gross,
            commissions,
            referralFees,
            maintenance,
            deductions: commissions + referralFees + maintenance,
            net: Number(row.netOwnerPayout || 0),
          };
        })
        .sort((a, b) => String(a.ownerName || '').localeCompare(String(b.ownerName || ''))),
    [ownerPayouts]
  );

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter((trx) => {
      const haystack = [
        trx.id,
        trx.description,
        trx.category,
        trx.type,
        trx.bookingId || '',
        trx.date,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [transactions, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + rowsPerPage);

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
    if (newType === 'Expense' && newOwnerPaid && !newCarId) {
      setError('Select a vehicle for owner-paid maintenance expenses.');
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
          carId: newType === 'Expense' ? newCarId : undefined,
          ownerPaid: newType === 'Expense' ? newOwnerPaid : undefined,
        });
        setTransactions((prev) =>
          normalizeTransactions(prev.map((t) => (t.id === editingId ? updated : t)))
        );
        showToast('Transaction updated.', 'success');
        notifyDataChanged();
        await refreshOwnerPayouts();
        await refreshOfficeSummary();
      } else {
        const created = await api.createTransaction({
          date: newDate,
          description: newDesc,
          type: newType,
          amount,
          category: newCategory,
          carId: newType === 'Expense' ? newCarId : undefined,
          ownerPaid: newType === 'Expense' ? newOwnerPaid : undefined,
        });
        setTransactions((prev) => normalizeTransactions([created, ...prev]));
        setCurrentPage(1);
        showToast('Transaction added.', 'success');
        notifyDataChanged();
        await refreshOwnerPayouts();
        await refreshOfficeSummary();
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
    setNewCarId(trx.carId || '');
    setNewOwnerPaid(Boolean(trx.ownerPaid));
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
        await refreshOwnerPayouts();
        await refreshOfficeSummary();
      } else {
        await api.deleteTransaction(trx.id);
        setTransactions((prev) => prev.filter((t) => t.id !== trx.id));
        showToast('Transaction deleted.', 'success');
        await refreshOwnerPayouts();
        await refreshOfficeSummary();
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
    setNewCarId('');
    setNewOwnerPaid(false);
  };

  const handleDownloadReport = () => {
    setError('');
    const startDate = normalizeIsoDate(reportStartDate);
    const endDate = normalizeIsoDate(reportEndDate);
    if (startDate && endDate && startDate > endDate) {
      const message = 'Start date must be earlier than or equal to end date.';
      setError(message);
      showToast(message, 'error');
      return;
    }

    const isWithinRange = (value: string) => {
      const normalized = normalizeIsoDate(value);
      if (startDate && normalized < startDate) return false;
      if (endDate && normalized > endDate) return false;
      return true;
    };
    const isBookingWithinRange = (booking: Booking) => {
      if (!startDate && !endDate) return true;
      const bookingStart = normalizeIsoDate(booking.startDate);
      const bookingEnd = normalizeIsoDate(booking.endDate);
      if (startDate && bookingEnd < startDate) return false;
      if (endDate && bookingStart > endDate) return false;
      return true;
    };

    const reportTransactions = transactions.filter((trx) => isWithinRange(trx.date));
    const reportBookings = bookings.filter((booking) => isBookingWithinRange(booking));
    const manualOfficeIncome = reportTransactions
      .filter((t) => {
        if (normalizeType(t.type) !== 'Income') return false;
        return !t.bookingId;
      })
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const paidBookingOfficeCommission = reportBookings
      .filter((booking) => booking.paymentStatus === 'paid' && booking.status !== 'cancelled')
      .reduce((sum, booking) => sum + Number(booking.officeCommissionAmount || 0), 0);
    const reportOfficeIncome = manualOfficeIncome + paidBookingOfficeCommission;
    const reportOfficeExpenses = reportTransactions
      .filter((t) => ['Expense', 'Commission'].includes(normalizeType(t.type)))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const reportPendingOfficeRevenue = reportBookings
      .filter((booking) => booking.paymentStatus === 'pending' && booking.status !== 'cancelled')
      .reduce((sum, booking) => sum + Number(booking.officeCommissionAmount || 0), 0);
    const reportNetProfit = reportOfficeIncome - reportOfficeExpenses;
    const rangeLabel = startDate && endDate
      ? `${formatDateDMY(startDate)} - ${formatDateDMY(endDate)}`
      : startDate
        ? `From ${formatDateDMY(startDate)}`
        : endDate
          ? `Up to ${formatDateDMY(endDate)}`
          : 'All Time';

    const rows = reportTransactions.map((trx) => ([
        trx.id,
        formatDateDMY(trx.date),
        trx.description,
        trx.category,
        trx.type,
        `${['Expense', 'Commission'].includes(trx.type) ? '-' : '+'}$${Number(trx.amount || 0).toFixed(2)}`,
      ]));

    downloadStyledReportPdf({
      title: 'Finance Report',
      summaryLine: `Total Office Income: $${reportOfficeIncome.toFixed(2)}   Total Office Expenses: $${reportOfficeExpenses.toFixed(2)}   Net Profit: $${reportNetProfit.toFixed(2)}   Pending Office Revenue: $${reportPendingOfficeRevenue.toFixed(2)}`,
      filters: [
        { label: 'Date Range', value: rangeLabel },
        { label: 'Rows Exported', value: reportTransactions.length },
      ],
      summaryCards: [
        { label: 'Total Office Income', value: `$${reportOfficeIncome.toFixed(2)}` },
        { label: 'Total Office Expenses', value: `$${reportOfficeExpenses.toFixed(2)}` },
        { label: 'Net Profit', value: `$${reportNetProfit.toFixed(2)}` },
        { label: 'Pending Office Revenue', value: `$${reportPendingOfficeRevenue.toFixed(2)}` },
      ],
      headers: ['Transaction ID', 'Date', 'Description', 'Category', 'Type', 'Amount'],
      rows,
      fileName: `finance-report-${startDate || 'all'}-to-${endDate || 'all'}-${new Date().toISOString().slice(0, 10)}.pdf`,
      footerText: 'Salaam Car Rental - Internal Report',
    });
  };

  const applyReportPreset = (days: number) => {
    setError('');
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - (days - 1));
    setReportStartDate(toIsoDate(start));
    setReportEndDate(toIsoDate(today));
  };

  const refreshCloses = async () => {
    const closes = await api.getFinanceCloses();
    setCloseOverview(closes);
  };

  const refreshOwnerPayouts = async () => {
    const summaries = await api.listOwnerPayoutSummaries();
    setOwnerPayouts(summaries);
  };

  const refreshOfficeSummary = async () => {
    const summary = await api.getOfficeFinanceSummary();
    setOfficeSummary(summary);
  };

  const handleCloseDaily = async () => {
    if (!closeDate) {
      setError('Select a date to close.');
      return;
    }
    setError('');
    setIsClosingDaily(true);
    try {
      await api.closeDailyFinance(closeDate);
      await refreshCloses();
      showToast(`Daily close saved for ${closeDate}.`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run daily close.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsClosingDaily(false);
    }
  };

  const handleCloseMonthly = async () => {
    setError('');
    setIsClosingMonthly(true);
    try {
      await api.closeMonthlyFinance(closeYear, closeMonth);
      await refreshCloses();
      showToast(`Monthly close saved for ${closeYear}-${String(closeMonth).padStart(2, '0')}.`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run monthly close.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsClosingMonthly(false);
    }
  };

  const handleDownloadDailyCloseReport = () => {
    const selectedDate = normalizeIsoDate(closeDate);
    const closed = closeOverview?.daily.find((item) => normalizeIsoDate(item.closeDate) === selectedDate);
    if (!closed) {
      const message = `No daily close found for ${selectedDate}. Close the day first.`;
      setError(message);
      showToast(message, 'error');
      return;
    }

    const rows = transactions
      .filter((trx) => normalizeIsoDate(trx.date) === selectedDate)
      .map((trx) => ([
        trx.id,
        formatDateDMY(trx.date),
        trx.description,
        trx.type,
        trx.category,
        `${trx.type === 'Expense' || trx.type === 'Commission' ? '-' : '+'}$${Number(trx.amount || 0).toFixed(2)}`,
      ]));

    downloadStyledReportPdf({
      title: 'Daily Close Report',
      subtitle: `Closed Date: ${formatDateDMY(selectedDate)}`,
      summaryLine: `Opening: $${closed.openingBalance.toFixed(2)}   Debits: $${closed.totalDebits.toFixed(2)}   Credits: $${closed.totalCredits.toFixed(2)}   Closing: $${closed.closingBalance.toFixed(2)}`,
      filters: [
        { label: 'Period Type', value: 'Daily' },
        { label: 'Close Date', value: selectedDate },
        { label: 'Transactions', value: rows.length },
      ],
      summaryCards: [
        { label: 'Opening Balance', value: `$${closed.openingBalance.toFixed(2)}` },
        { label: 'Debits', value: `$${closed.totalDebits.toFixed(2)}` },
        { label: 'Credits', value: `$${closed.totalCredits.toFixed(2)}` },
        { label: 'Closing Balance', value: `$${closed.closingBalance.toFixed(2)}` },
      ],
      headers: ['Transaction ID', 'Date', 'Description', 'Type', 'Category', 'Amount'],
      rows,
      fileName: `daily-close-${selectedDate}.pdf`,
      footerText: 'Salaam Car Rental - Daily Close',
    });
  };

  const handleDownloadMonthlyCloseReport = () => {
    const closed = closeOverview?.monthly.find((item) => item.year === closeYear && item.month === closeMonth);
    if (!closed) {
      const message = `No monthly close found for ${closeYear}-${String(closeMonth).padStart(2, '0')}. Close the month first.`;
      setError(message);
      showToast(message, 'error');
      return;
    }

    const monthPrefix = `${closeYear}-${String(closeMonth).padStart(2, '0')}`;
    const rows = transactions
      .filter((trx) => trx.date.startsWith(monthPrefix))
      .map((trx) => ([
        trx.id,
        formatDateDMY(trx.date),
        trx.description,
        trx.type,
        trx.category,
        `${trx.type === 'Expense' || trx.type === 'Commission' ? '-' : '+'}$${Number(trx.amount || 0).toFixed(2)}`,
      ]));

    downloadStyledReportPdf({
      title: 'Monthly Close Report',
      subtitle: `Closed Month: ${monthPrefix}`,
      summaryLine: `Opening: $${closed.openingBalance.toFixed(2)}   Debits: $${closed.totalDebits.toFixed(2)}   Credits: $${closed.totalCredits.toFixed(2)}   Closing: $${closed.closingBalance.toFixed(2)}`,
      filters: [
        { label: 'Period Type', value: 'Monthly' },
        { label: 'Month', value: monthPrefix },
        { label: 'Transactions', value: rows.length },
      ],
      summaryCards: [
        { label: 'Opening Balance', value: `$${closed.openingBalance.toFixed(2)}` },
        { label: 'Debits', value: `$${closed.totalDebits.toFixed(2)}` },
        { label: 'Credits', value: `$${closed.totalCredits.toFixed(2)}` },
        { label: 'Closing Balance', value: `$${closed.closingBalance.toFixed(2)}` },
      ],
      headers: ['Transaction ID', 'Date', 'Description', 'Type', 'Category', 'Amount'],
      rows,
      fileName: `monthly-close-${monthPrefix}.pdf`,
      footerText: 'Salaam Car Rental - Monthly Close',
    });
  };

  const handleDownloadOwnerBriefReport = (owner: OwnerFinanceSnapshot) => {
    const reportDate = new Date().toISOString().slice(0, 10);
    const ownerLabel = owner.ownerName || 'Owner';
    const rows = [
      ['Gross', `$${owner.gross.toFixed(2)}`],
      ['Office Commission', `-$${owner.commissions.toFixed(2)}`],
      ['Referral Commission', `-$${owner.referralFees.toFixed(2)}`],
      ['Maintenance', `-$${owner.maintenance.toFixed(2)}`],
      ['Total Deductions', `-$${owner.deductions.toFixed(2)}`],
      ['Net Owner Payout', `$${owner.net.toFixed(2)}`],
    ];

    downloadStyledReportPdf({
      title: 'Owner Payout Brief',
      subtitle: `${ownerLabel} (${owner.ownerId})`,
      summaryLine: `Net Owner Payout: $${owner.net.toFixed(2)}`,
      filters: [
        { label: 'Owner ID', value: owner.ownerId },
        { label: 'Generated', value: formatDateDMY(reportDate) },
      ],
      summaryCards: [
        { label: 'Gross', value: `$${owner.gross.toFixed(2)}` },
        { label: 'Deductions', value: `$${owner.deductions.toFixed(2)}` },
        { label: 'Net Payout', value: `$${owner.net.toFixed(2)}` },
        { label: 'Referral', value: `$${owner.referralFees.toFixed(2)}` },
      ],
      headers: ['Metric', 'Amount'],
      rows,
      fileName: `owner-payout-brief-${toFileToken(ownerLabel)}-${reportDate}.pdf`,
      footerText: 'Salaam Car Rental - Owner Summary',
    });
  };

  return (
    <DashboardLayout title="Financial Overview">
      {isLoading && <div className="section-card no-print" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading finance data...</div>}
      {error && <div className="section-card no-print" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}
      <div className="owner-payout-headline reveal-up">
        <h3>Owner Payout Summary</h3>
        <span> {ownerFinanceActivity.length}  records</span>
      </div>
      <div className="finance-kpi-grid owner-payout-kpi-grid print-break-avoid reveal-up delay-1">
        {ownerFinanceActivity.length > 0 ? (
          ownerFinanceActivity.map((owner) => (
            <article key={owner.ownerId} className="finance-kpi-card owner-finance-card">
              <div className={`finance-kpi-icon ${owner.net >= 0 ? 'net-positive' : 'net-negative'}`}>
                <DollarSign size={24} />
              </div>
              <div className="finance-kpi-copy owner-finance-copy">
                <p>{owner.ownerName || 'Owner'}</p>
                <h3>${owner.net.toLocaleString()}</h3>
                <span className="finance-kpi-sub">Net owner payout</span>
                <div className="owner-finance-breakdown">
                  <span>Gross: ${owner.gross.toLocaleString()}</span>
                  <span>Deductions: ${owner.deductions.toLocaleString()}</span>
                  <span>Office Comm: ${owner.commissions.toLocaleString()}</span>
                  <span>Referral Commision: ${owner.referralFees.toLocaleString()}</span>
                </div>
                <div className="owner-finance-actions no-print">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="owner-brief-btn"
                    onClick={() => handleDownloadOwnerBriefReport(owner)}
                  >
                    <Download size={14} /> Brief Report
                  </Button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <article className="finance-kpi-card owner-finance-card owner-finance-empty">
            <div className="finance-kpi-icon pending"><CreditCard size={24} /></div>
            <div className="finance-kpi-copy">
              <p>Owner activity</p>
              <h3>0</h3>
              <span className="finance-kpi-sub">No owner payout records yet</span>
            </div>
          </article>
        )}
      </div>
      <div className="finance-kpi-grid print-break-avoid reveal-up delay-1">
        <article className="finance-kpi-card">
          <div className="finance-kpi-icon income"><TrendingUp size={24} /></div>
          <div className="finance-kpi-copy">
            <p>Total Office Income</p>
            <h3>${officeFinancials.officeIncome.toLocaleString()}</h3>
            <span className="finance-kpi-pill positive">Office revenue only</span>
          </div>
        </article>
        <article className="finance-kpi-card">
          <div className="finance-kpi-icon expense"><TrendingDown size={24} /></div>
          <div className="finance-kpi-copy">
            <p>Total Office Expenses</p>
            <h3>${officeFinancials.officeExpenses.toLocaleString()}</h3>
            <span className="finance-kpi-pill negative">Office costs only</span>
          </div>
        </article>
        <article className="finance-kpi-card">
          <div className={`finance-kpi-icon ${isNetProfitPositive ? 'net-positive' : 'net-negative'}`}><DollarSign size={24} /></div>
          <div className="finance-kpi-copy">
            <p>Net Profit</p>
            <h3 className={`finance-kpi-value ${isNetProfitPositive ? 'positive' : 'negative'}`}>${officeFinancials.netProfit.toLocaleString()}</h3>
            <span className={`finance-kpi-pill ${isNetProfitPositive ? 'positive' : 'negative'}`}>
              {isNetProfitPositive ? 'Profit is positive' : 'Profit is negative'}
            </span>
          </div>
        </article>
        <article className="finance-kpi-card">
          <div className="finance-kpi-icon pending"><CreditCard size={24} /></div>
          <div className="finance-kpi-copy">
            <p>Pending Office Revenue</p>
            <h3>${officeFinancials.pendingOfficeAmount.toLocaleString()}</h3>
            <span className="finance-kpi-sub">Awaiting settlement</span>
          </div>
        </article>
      </div>

      <div className="finance-actions-shell no-print reveal-up">
        <div className="finance-actions">
          <Button variant={showForm ? 'danger' : 'primary'} onClick={() => { if (!showForm) resetForm(); setShowForm(!showForm); }}>
            {showForm ? <><X size={18} /> Cancel</> : <><Plus size={18} /> Add Transaction</>}
          </Button>
        </div>
        <div className="finance-report-actions">
          <div className="finance-report-range">
            <div className="finance-report-field">
              <label htmlFor="finance-report-start">From</label>
              <input
                id="finance-report-start"
                type="date"
                className="form-input"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
              />
            </div>
            <div className="finance-report-field">
              <label htmlFor="finance-report-end">To</label>
              <input
                id="finance-report-end"
                type="date"
                className="form-input"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
              />
            </div>
            <div className="finance-report-presets" role="group" aria-label="Quick report ranges">
              <button type="button" className="finance-report-preset" onClick={() => applyReportPreset(7)}>
                Last 7 days
              </button>
              <button type="button" className="finance-report-preset" onClick={() => applyReportPreset(30)}>
                Last 30 days
              </button>
              <button type="button" className="finance-report-preset" onClick={() => applyReportPreset(90)}>
                Last 90 days
              </button>
            </div>
          </div>
          <Button
            onClick={handleDownloadReport}
            variant="secondary"
            disabled={Boolean(reportStartDate && reportEndDate && reportStartDate > reportEndDate)}
          >
            <Download size={18} /> Download Report
          </Button>
          {(reportStartDate || reportEndDate) && (
            <button
              type="button"
              className="finance-report-clear"
              onClick={() => {
                setReportStartDate('');
                setReportEndDate('');
              }}
            >
              Clear Dates
            </button>
          )}
        </div>
        <button
          type="button"
          className="finance-close-toggle"
          aria-expanded={isPeriodClosingOpen}
          aria-controls="finance-close-panel"
          onClick={() => setIsPeriodClosingOpen((prev) => !prev)}
        >
          {isPeriodClosingOpen ? 'Hide Period Closing' : 'Period Closing'}
        </button>
      </div>

      {isPeriodClosingOpen && (
        <div id="finance-close-panel" className="finance-close-panel no-print reveal-up delay-1">
          <div className="finance-close-head">
            <h3>Period Closing</h3>
            <span>Lock and report closed periods</span>
          </div>
          <div className="finance-close-tabs" role="tablist" aria-label="Period closing tabs">
            <button
              type="button"
              role="tab"
              aria-selected={closeTab === 'daily'}
              className={`finance-close-tab ${closeTab === 'daily' ? 'active' : ''}`}
              onClick={() => setCloseTab('daily')}
            >
              <CalendarDays size={16} />
              Daily Close
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={closeTab === 'monthly'}
              className={`finance-close-tab ${closeTab === 'monthly' ? 'active' : ''}`}
              onClick={() => setCloseTab('monthly')}
            >
              <CalendarRange size={16} />
              Monthly Close
            </button>
          </div>

          {closeTab === 'daily' ? (
            <div className="finance-close-card finance-close-card-daily">
              <label htmlFor="close-date">Date</label>
              <input
                id="close-date"
                type="date"
                className="form-input"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
              />
              <div className="finance-close-actions">
                <Button type="button" onClick={handleCloseDaily} disabled={isClosingDaily}>
                  {isClosingDaily ? 'Closing...' : 'Close Day'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleDownloadDailyCloseReport}>
                  Download Daily Report
                </Button>
              </div>
              {closeOverview?.latestDaily ? (
                <p className="finance-close-meta">
                  Latest: {formatDateDMY(closeOverview.latestDaily.closeDate)} | Closing Balance: $
                  {closeOverview.latestDaily.closingBalance.toFixed(2)}
                </p>
              ) : (
                <p className="finance-close-meta">No daily close yet.</p>
              )}
            </div>
          ) : (
            <div className="finance-close-card finance-close-card-monthly">
              <div className="finance-close-period">
                <div>
                  <label htmlFor="close-month">Month</label>
                  <select
                    id="close-month"
                    className="form-input"
                    value={closeMonth}
                    onChange={(e) => setCloseMonth(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <option key={month} value={month}>
                        {String(month).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="close-year">Year</label>
                  <input
                    id="close-year"
                    type="number"
                    className="form-input"
                    value={closeYear}
                    onChange={(e) => setCloseYear(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="finance-close-actions">
                <Button type="button" onClick={handleCloseMonthly} disabled={isClosingMonthly}>
                  {isClosingMonthly ? 'Closing...' : 'Close Month'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleDownloadMonthlyCloseReport}>
                  Download Monthly Report
                </Button>
              </div>
              {closeOverview?.latestMonthly ? (
                <p className="finance-close-meta">
                  Latest: {closeOverview.latestMonthly.year}-{String(closeOverview.latestMonthly.month).padStart(2, '0')} |
                  Closing Balance: ${closeOverview.latestMonthly.closingBalance.toFixed(2)}
                </p>
              ) : (
                <p className="finance-close-meta">No monthly close yet.</p>
              )}
            </div>
          )}
        </div>
      )}

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
              {newType === 'Expense' && (
                <>
                  <div className="form-group">
                    <label>Car (Optional)</label>
                    <select
                      className="form-input"
                      value={newCarId}
                      onChange={(e) => {
                        const selectedCarId = e.target.value;
                        setNewCarId(selectedCarId);
                        if (!selectedCarId) setNewOwnerPaid(false);
                      }}
                    >
                      <option value="">Office Expense</option>
                      {cars.map((car) => (
                        <option key={car.id} value={car.id}>
                          {car.name} ({car.licensePlate})
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="finance-owner-paid-toggle">
                    <input
                      type="checkbox"
                      checked={newOwnerPaid}
                      disabled={!newCarId}
                      onChange={(e) => setNewOwnerPaid(e.target.checked)}
                    />
                    Owner-paid maintenance (requires car)
                  </label>
                </>
              )}
            </div>
            <div className="form-footer">
              <Button type="submit"><Save size={18} /> {editingId ? 'Update Transaction' : 'Save Transaction'}</Button>
            </div>
          </form>
        </div>
      )}

      <div className="section-card print-break-avoid reveal-up delay-2">
        <div className="card-header finance-card-header">
          <h3>Transaction History</h3>
          <div className="finance-table-controls no-print">
            <div className="finance-search">
              <Search size={15} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search ID, description, category..."
                aria-label="Search transactions"
              />
            </div>
            <div className="finance-pagination-meta">
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
        </div>
        <div className="table-responsive">
          <table className="data-table finance-transactions-table">
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
              {isLoading ? (
                Array.from({ length: rowsPerPage }, (_, idx) => (
                  <tr key={`finance-skeleton-${idx}`} className="finance-skeleton-row">
                    <td colSpan={7}>
                      <span className="finance-skeleton-line" />
                    </td>
                  </tr>
                ))
              ) : paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="finance-empty-state">
                      <strong>No transactions found</strong>
                      <span>Try another search term or clear your filters.</span>
                    </div>
                  </td>
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
                      <span className={`finance-type-pill ${trx.type === 'Expense' ? 'expense' : trx.type === 'Commission' ? 'commission' : 'income'}`}>
                        {trx.type}
                      </span>
                    </td>
                    <td className={`font-bold finance-amount ${['Expense', 'Commission'].includes(trx.type) ? 'negative' : 'positive'}`}>
                      {['Expense', 'Commission'].includes(trx.type) ? '-' : '+'}${trx.amount}
                    </td>
                    <td className="no-print">
                      <div className="table-actions finance-table-actions">
                      <button
                        className="action-btn finance-ghost-action"
                        onClick={() => handleEdit(trx)}
                        title="Edit Transaction"
                        aria-label={`Edit transaction ${trx.id}`}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="action-btn finance-ghost-action danger"
                        onClick={() => handleDelete(trx)}
                        title={trx.bookingId ? 'Delete Booking + Transaction' : 'Delete Transaction'}
                        aria-label={`Delete transaction ${trx.id}`}
                      >
                        <Trash2 size={16} />
                      </button>
                      </div>
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
