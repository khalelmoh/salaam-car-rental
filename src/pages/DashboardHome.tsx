import { Car, DollarSign, Calendar, Activity, TrendingUp, PieChart, Clock3 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import StatsCard from '../components/StatsCard';
import RevenueChart from '../components/RevenueChart';
import FleetStatusChart from '../components/FleetStatusChart';
import { api } from '../lib/api';
import type { Booking, DashboardPayload, Transaction, TransactionType } from '../types/models';
import { onDataChanged } from '../utils/realtime';
import './DashboardHome.css';

type DateRangePreset = '7d' | '30d' | '90d' | 'month' | 'all';

interface DateRange {
    start: Date | null;
    end: Date | null;
}

const normalizeType = (value: string): TransactionType =>
    String(value).toLowerCase() === 'expense'
        ? 'Expense'
        : String(value).toLowerCase() === 'commission'
            ? 'Commission'
            : 'Income';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const addDays = (date: Date, days: number) => new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));

const parseDateOnly = (value?: string) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseActivityTimestamp = (value: number) => {
    const ts = Number(value || 0);
    return new Date(ts < 1_000_000_000_000 ? ts * 1000 : ts);
};

const getRangeFromPreset = (preset: DateRangePreset): DateRange => {
    const today = new Date();
    const end = endOfDay(today);

    if (preset === '7d') return { start: startOfDay(addDays(today, -6)), end };
    if (preset === '30d') return { start: startOfDay(addDays(today, -29)), end };
    if (preset === '90d') return { start: startOfDay(addDays(today, -89)), end };
    if (preset === 'month') return { start: startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)), end };
    return { start: null, end: null };
};

const getPreviousRange = (range: DateRange): DateRange | null => {
    if (!range.start || !range.end) return null;
    const spanMs = range.end.getTime() - range.start.getTime() + 1;
    const prevEnd = new Date(range.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - spanMs + 1);
    return { start: prevStart, end: prevEnd };
};

const isInRange = (date: Date, range: DateRange) => {
    if (!range.start || !range.end) return true;
    const value = date.getTime();
    return value >= range.start.getTime() && value <= range.end.getTime();
};

const bookingOverlapsRange = (booking: Booking, range: DateRange) => {
    if (!range.start || !range.end) return true;
    const start = parseDateOnly(booking.startDate);
    const end = parseDateOnly(booking.endDate);
    if (!start || !end) return false;
    return startOfDay(start) <= range.end && endOfDay(end) >= range.start;
};

function derivePaidRevenue(transactions: Transaction[], bookings: Booking[], range: DateRange) {
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const paidTransactions = transactions.filter((t) => {
        if (normalizeType(t.type) !== 'Income') return false;
        const txDate = parseDateOnly(t.date);
        if (!txDate || !isInRange(txDate, range)) return false;
        if (!t.bookingId) return true;
        return bookingById.get(t.bookingId)?.paymentStatus === 'paid';
    });

    const totalRevenue = paidTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const revenueByMonth = new Map<string, number>();
    for (const t of paidTransactions) {
        const date = parseDateOnly(t.date);
        if (!date) continue;
        const month = monthNames[date.getMonth()];
        if (!month) continue;
        revenueByMonth.set(month, (revenueByMonth.get(month) || 0) + Number(t.amount || 0));
    }

    const revenueData = monthNames.map((name) => ({ name, revenue: Number((revenueByMonth.get(name) || 0).toFixed(2)) }));
    return { totalRevenue: Number(totalRevenue.toFixed(2)), revenueData };
}

const buildTrend = (current: number, previous: number) => {
    if (previous === 0) {
        return { value: current === 0 ? 0 : 100, isPositive: current >= previous };
    }
    const change = ((current - previous) / Math.abs(previous)) * 100;
    return {
        value: Number(Math.abs(change).toFixed(1)),
        isPositive: change >= 0,
    };
};

const formatRangeLabel = (preset: DateRangePreset) => {
    if (preset === '7d') return 'Last 7 days';
    if (preset === '30d') return 'Last 30 days';
    if (preset === '90d') return 'Last 90 days';
    if (preset === 'month') return 'This month';
    return 'All time';
};

const DashboardHome = () => {
    const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [rangePreset, setRangePreset] = useState<DateRangePreset>('30d');

    useEffect(() => {
        let active = true;
        const load = async (showLoading = false) => {
            setError('');
            if (showLoading) {
                setIsLoading(true);
            }
            try {
                const [data, txData, bookingData] = await Promise.all([
                    api.getDashboard(),
                    api.listTransactions(),
                    api.listBookings(),
                ]);
                if (active) {
                    setDashboard(data);
                    setTransactions(txData);
                    setBookings(bookingData);
                }
            } catch (err) {
                if (active) {
                    setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
                }
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };
        load(true);

        const intervalId = window.setInterval(load, 15000);
        const unsubscribe = onDataChanged(load);
        const onFocus = () => load();
        window.addEventListener('focus', onFocus);

        return () => {
            active = false;
            window.clearInterval(intervalId);
            unsubscribe();
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    const currentRange = useMemo(() => getRangeFromPreset(rangePreset), [rangePreset]);
    const previousRange = useMemo(() => getPreviousRange(currentRange), [currentRange]);

    const getMetricsForRange = (range: DateRange) => {
        const bookingsInRange = bookings.filter((booking) => bookingOverlapsRange(booking, range));
        const activeRentals = bookingsInRange.filter((b) => b.status === 'active' || b.status === 'overdue').length;
        const pendingAmount = bookingsInRange
            .filter((b) => b.paymentStatus === 'pending' && b.status !== 'cancelled')
            .reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
        const { totalRevenue, revenueData } = derivePaidRevenue(transactions, bookings, range);
        const totalFleet = dashboard?.totalFleet ?? 0;
        const utilization = totalFleet > 0 ? Number(((activeRentals / totalFleet) * 100).toFixed(1)) : 0;

        return {
            activeRentals,
            pendingAmount: Number(pendingAmount.toFixed(2)),
            totalRevenue,
            revenueData,
            utilization,
            totalFleet,
        };
    };

    const currentMetrics = useMemo(() => getMetricsForRange(currentRange), [currentRange, bookings, transactions, dashboard]);
    const previousMetrics = useMemo(() => (previousRange ? getMetricsForRange(previousRange) : null), [previousRange, bookings, transactions, dashboard]);

    const activities = useMemo(
        () =>
            (dashboard?.activities ?? []).filter((activity) =>
                isInRange(parseActivityTimestamp(Number(activity.timestamp || 0)), currentRange)
            ),
        [dashboard, currentRange]
    );

    const trendLabel = 'vs previous period';
    const activeTrend = previousMetrics ? buildTrend(currentMetrics.activeRentals, previousMetrics.activeRentals) : undefined;
    const revenueTrend = previousMetrics ? buildTrend(currentMetrics.totalRevenue, previousMetrics.totalRevenue) : undefined;
    const pendingTrend = previousMetrics ? buildTrend(currentMetrics.pendingAmount, previousMetrics.pendingAmount) : undefined;
    const utilizationTrend = previousMetrics ? buildTrend(currentMetrics.utilization, previousMetrics.utilization) : undefined;
    const utilizationValue = `${currentMetrics.utilization}% (${currentMetrics.activeRentals}/${currentMetrics.totalFleet})`;

    return (
        <DashboardLayout title="Dashboard Overview">
            {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading dashboard...</div>}
            {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}

            <div className="dashboard-toolbar reveal-up">
                <div className="dashboard-toolbar-text">
                    <h3>Performance Snapshot</h3>
                    <p>{formatRangeLabel(rangePreset)} analytics with previous-period comparison.</p>
                </div>
                <div className="dashboard-toolbar-controls">
                    <label htmlFor="dashboard-range" className="range-label">Range</label>
                    <select
                        id="dashboard-range"
                        className="dashboard-range-select"
                        value={rangePreset}
                        onChange={(e) => setRangePreset(e.target.value as DateRangePreset)}
                    >
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                        <option value="month">This month</option>
                        <option value="all">All time</option>
                    </select>
                </div>
            </div>

            <div className="stats-grid reveal-up delay-1">
                <StatsCard
                    title="Total Fleet"
                    value={`${dashboard?.totalFleet ?? 0}`}
                    icon={<Car size={24} />}
                    color="#3b82f6"
                />
                <StatsCard
                    title="Active Rentals"
                    value={`${currentMetrics.activeRentals}`}
                    icon={<Calendar size={24} />}
                    color="#8b5cf6"
                    trend={activeTrend}
                    trendLabel={trendLabel}
                />
                <StatsCard
                    title="Paid Revenue"
                    value={`$${currentMetrics.totalRevenue.toLocaleString()}`}
                    icon={<DollarSign size={24} />}
                    color="#10b981"
                    trend={revenueTrend}
                    trendLabel={trendLabel}
                />
                <StatsCard
                    title="Pending Payments"
                    value={`$${currentMetrics.pendingAmount.toLocaleString()}`}
                    icon={<Clock3 size={24} />}
                    color="#f59e0b"
                    trend={pendingTrend}
                    trendLabel={trendLabel}
                />
                <StatsCard
                    title="Utilization"
                    value={utilizationValue}
                    icon={<Activity size={24} />}
                    color="#0ea5e9"
                    trend={utilizationTrend}
                    trendLabel={trendLabel}
                />
            </div>

            <div className="dashboard-charts-grid reveal-up delay-2">
                <div className="chart-card section-card">
                    <div className="card-header">
                        <h3><TrendingUp size={20} /> Revenue Trends</h3>
                    </div>
                    <div className="card-body">
                        <RevenueChart data={currentMetrics.revenueData} />
                    </div>
                </div>
                <div className="chart-card section-card">
                    <div className="card-header">
                        <h3><PieChart size={20} /> Fleet Status</h3>
                    </div>
                    <div className="card-body">
                        <FleetStatusChart data={dashboard?.fleetStatusData ?? []} />
                    </div>
                </div>
            </div>

            <div className="dashboard-sections reveal-up delay-3">
                <div className="recent-activity section-card">
                    <div className="card-header">
                        <h3><Activity size={20} /> Recent Activity</h3>
                    </div>
                    <ul className="activity-list">
                        {activities.length === 0 ? (
                            <li className="activity-item text-muted">No activity in this range.</li>
                        ) : (
                            activities.map((act) => (
                                <li className="activity-item" key={act.id}>
                                    <span className="dot bg-green"></span>
                                    <span>{act.message}</span>
                                    <span className="time">{parseActivityTimestamp(Number(act.timestamp || 0)).toLocaleString()}</span>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default DashboardHome;
