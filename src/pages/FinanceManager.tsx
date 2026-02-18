import { useState, useMemo, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Plus, Trash2, Printer, X, Save } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import StatsCard from '../components/StatsCard';
import Button from '../components/Button';
import { addActivity, dispatchDataUpdate } from '../utils/activity';
import './FinanceManager.css';

interface Transaction {
    id: string;
    date: string;
    description: string;
    type: 'Income' | 'Expense';
    amount: number;
    category: string;
}

const initialTransactions: Transaction[] = [
    { id: 'TRX-9812', date: '2023-11-20', description: 'Rental: BMW X5 (5 Days)', type: 'Income', amount: 425, category: 'Rental' },
    { id: 'TRX-9811', date: '2023-11-19', description: 'Maintenance: Toyota Camry Oil Change', type: 'Expense', amount: 85, category: 'Maintenance' },
    { id: 'TRX-9810', date: '2023-11-18', description: 'Rental: Tesla Model 3 (2 Days)', type: 'Income', amount: 150, category: 'Rental' },
    { id: 'TRX-9809', date: '2023-11-18', description: 'Insurance Premium (Monthly)', type: 'Expense', amount: 1200, category: 'Insurance' },
    { id: 'TRX-9808', date: '2023-11-15', description: 'Rental: Ford Mustang (3 Days)', type: 'Income', amount: 270, category: 'Rental' },
];

const FinanceManager = () => {
    const [transactions, setTransactions] = useState<Transaction[]>(() => {
        const saved = localStorage.getItem('salaam_transactions');
        return saved ? JSON.parse(saved) : initialTransactions;
    });

    useEffect(() => {
        localStorage.setItem('salaam_transactions', JSON.stringify(transactions));
        // notify other parts of the app
        dispatchDataUpdate('transactions', transactions);
        // record a generic activity about transactions change
        addActivity(`Transactions updated (${transactions.length})`, 'finance');
    }, [transactions]);

    const [showForm, setShowForm] = useState(false);

    // New Transaction Form State
    const [newDate, setNewDate] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newType, setNewType] = useState<'Income' | 'Expense'>('Income');
    const [newAmount, setNewAmount] = useState('');
    const [newCategory, setNewCategory] = useState('');

    // Derived State for Totals
    const financials = useMemo(() => {
        const income = transactions
            .filter(t => t.type === 'Income')
            .reduce((sum, t) => sum + t.amount, 0);
        const expenses = transactions
            .filter(t => t.type === 'Expense')
            .reduce((sum, t) => sum + t.amount, 0);

        // Calculate Pending Payments from Bookings
        const savedBookings = localStorage.getItem('salaam_bookings');
        let pendingAmount = 0;
        if (savedBookings) {
            const bookings: any[] = JSON.parse(savedBookings);
            pendingAmount = bookings
                .filter(b => b.paymentStatus === 'pending' && b.status !== 'cancelled')
                .reduce((sum, b) => sum + (b.totalAmount || 0), 0);
        }

        return {
            income,
            expenses,
            netProfit: income - expenses,
            pendingAmount
        };
    }, [transactions]);

    const handleAddTransaction = (e: React.FormEvent) => {
        e.preventDefault();
        const newTrx: Transaction = {
            id: `TRX-${Math.floor(1000 + Math.random() * 9000)}`,
            date: newDate,
            description: newDesc,
            type: newType,
            amount: Number(newAmount),
            category: newCategory || 'General'
        };

        setTransactions([newTrx, ...transactions]);
        setShowForm(false);
        resetForm();
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Delete this transaction?')) {
            setTransactions(transactions.filter(t => t.id !== id));
        }
    };

    const resetForm = () => {
        setNewDate('');
        setNewDesc('');
        setNewType('Income');
        setNewAmount('');
        setNewCategory('');
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <DashboardLayout title="Financial Overview">
            <div className="finance-actions no-print">
                <Button onClick={() => setShowForm(!showForm)}>
                    {showForm ? <><X size={18} /> Cancel</> : <><Plus size={18} /> Add Transaction</>}
                </Button>
                <Button onClick={handlePrint} variant="secondary">
                    <Printer size={18} /> Print Report
                </Button>
            </div>

            {showForm && (
                <div className="transaction-form-card no-print">
                    <h3>Add New Transaction</h3>
                    <form onSubmit={handleAddTransaction} className="transaction-form">
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    required
                                    className="form-input"
                                    value={newDate}
                                    onChange={e => setNewDate(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Type</label>
                                <select
                                    className="form-input"
                                    value={newType}
                                    onChange={e => setNewType(e.target.value as 'Income' | 'Expense')}
                                >
                                    <option value="Income">Income</option>
                                    <option value="Expense">Expense</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Car Rental (#123)"
                                    className="form-input"
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Amount ($)</label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    step="0.01"
                                    className="form-input"
                                    value={newAmount}
                                    onChange={e => setNewAmount(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Category</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Rental, Maintenance"
                                    className="form-input"
                                    value={newCategory}
                                    onChange={e => setNewCategory(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="form-footer">
                            <Button type="submit"><Save size={18} /> Save Transaction</Button>
                        </div>
                    </form>
                </div>
            )}

            <div className="stats-grid print-break-avoid">
                <StatsCard
                    title="Total Income"
                    value={`$${financials.income.toLocaleString()}`}
                    icon={<TrendingUp size={24} />}
                    color="#10b981"
                    trend={{ value: 8, isPositive: true }}
                />
                <StatsCard
                    title="Total Expenses"
                    value={`$${financials.expenses.toLocaleString()}`}
                    icon={<TrendingDown size={24} />}
                    color="#ef4444"
                    trend={{ value: 3, isPositive: false }}
                />
                <StatsCard
                    title="Net Profit"
                    value={`$${financials.netProfit.toLocaleString()}`}
                    icon={<DollarSign size={24} />}
                    color="#3b82f6"
                    trend={{ value: 12, isPositive: true }}
                />
                <StatsCard
                    title="Pending Payments"
                    value={`$${financials.pendingAmount.toLocaleString()}`}
                    icon={<CreditCard size={24} />}
                    color="#f59e0b"
                />
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
                            {transactions.map(trx => (
                                <tr key={trx.id}>
                                    <td className="font-medium text-sm text-muted">{trx.id}</td>
                                    <td>{trx.date}</td>
                                    <td>{trx.description}</td>
                                    <td><span className="badge">{trx.category}</span></td>
                                    <td>
                                        <span className={`badge ${trx.type === 'Income' ? 'badge-success' : 'badge-danger'}`}>
                                            {trx.type}
                                        </span>
                                    </td>
                                    <td className={`font-bold ${trx.type === 'Income' ? 'text-green' : 'text-red'}`}>
                                        {trx.type === 'Income' ? '+' : '-'}${trx.amount}
                                    </td>
                                    <td className="no-print">
                                        <button
                                            className="action-btn danger"
                                            onClick={() => handleDelete(trx.id)}
                                            title="Delete Transaction"
                                        >
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
