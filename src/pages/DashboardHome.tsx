import { Car, DollarSign, Calendar, Activity, TrendingUp, PieChart } from 'lucide-react';
import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import StatsCard from '../components/StatsCard';
import RevenueChart from '../components/RevenueChart';
import FleetStatusChart from '../components/FleetStatusChart';
import { api } from '../lib/api';
import type { Booking, DashboardPayload, Transaction, TransactionType } from '../types/models';
import { onDataChanged } from '../utils/realtime';
import './DashboardHome.css';

const normalizeType = (value: string): TransactionType =>
  String(value).toLowerCase() === 'expense'
    ? 'Expense'
    : String(value).toLowerCase() === 'commission'
      ? 'Commission'
      : 'Income';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function derivePaidRevenue(transactions: Transaction[], bookings: Booking[]) {
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const paidTransactions = transactions.filter((t) => {
    if (normalizeType(t.type) !== 'Income') return false;
    if (!t.bookingId) return true;
    return bookingById.get(t.bookingId)?.paymentStatus === 'paid';
  });

  const totalRevenue = paidTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const revenueByMonth = new Map<string, number>();
  for (const t of paidTransactions) {
    const date = new Date(`${t.date}T00:00:00`);
    const month = monthNames[date.getMonth()];
    if (!month) continue;
    revenueByMonth.set(month, (revenueByMonth.get(month) || 0) + Number(t.amount || 0));
  }

  const revenueData = monthNames.map((name) => ({ name, revenue: Number((revenueByMonth.get(name) || 0).toFixed(2)) }));
  return { totalRevenue: Number(totalRevenue.toFixed(2)), revenueData };
}

const DashboardHome = () => {
    const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const utilizationOccupied = dashboard?.utilizationOccupied ?? dashboard?.activeRentals ?? 0;
    const utilizationTotal = dashboard?.utilizationTotal ?? dashboard?.totalFleet ?? 0;
    const utilizationValue = `${dashboard?.utilization ?? 0}% (${utilizationOccupied}/${utilizationTotal})`;

    useEffect(() => {
        let active = true;
        const load = async (showLoading = false) => {
            setError('');
            if (showLoading) {
                setIsLoading(true);
            }
            try {
                const [data, transactions, bookings] = await Promise.all([
                    api.getDashboard(),
                    api.listTransactions(),
                    api.listBookings(),
                ]);
                const paidRevenue = derivePaidRevenue(transactions, bookings);
                if (active) {
                    setDashboard({
                        ...data,
                        totalRevenue: paidRevenue.totalRevenue,
                        revenueData: paidRevenue.revenueData,
                    });
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

    return (
        <DashboardLayout title="Dashboard Overview">
            {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading dashboard...</div>}
            {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}

            <div className="stats-grid reveal-up">
                <StatsCard
                    title="Total Fleet"
                    value={`${dashboard?.totalFleet ?? 0}`}
                    icon={<Car size={24} />}
                    color="#3b82f6"
                    trend={{ value: 12, isPositive: true }}
                />
                <StatsCard
                    title="Active Rentals"
                    value={`${dashboard?.activeRentals ?? 0}`}
                    icon={<Calendar size={24} />}
                    color="#8b5cf6"
                    trend={{ value: 5, isPositive: true }}
                />
                <StatsCard
                    title="Total Revenue"
                    value={`$${(dashboard?.totalRevenue ?? 0).toLocaleString()}`}
                    icon={<DollarSign size={24} />}
                    color="#ad1a24"
                    trend={{ value: 8, isPositive: true }}
                />
                <StatsCard
                    title="Utilization"
                    value={utilizationValue}
                    icon={<Activity size={24} />}
                    color="#f59e0b"
                />
            </div>

            <div className="dashboard-charts-grid reveal-up delay-1">
                <div className="chart-card section-card">
                    <div className="card-header">
                        <h3><TrendingUp size={20} /> Revenue Trends</h3>
                    </div>
                    <div className="card-body">
                        <RevenueChart data={dashboard?.revenueData ?? []} />
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

            <div className="dashboard-sections reveal-up delay-2">
                <div className="recent-activity section-card">
                    <div className="card-header">
                        <h3><Activity size={20} /> Recent Activity</h3>
                    </div>
                    <ul className="activity-list">
                        {(dashboard?.activities ?? []).length === 0 ? (
                            <li className="activity-item text-muted">No recent activity yet.</li>
                        ) : (
                            (dashboard?.activities ?? []).map(act => (
                                <li className="activity-item" key={act.id}>
                                    <span className="dot bg-green"></span>
                                    <span>{act.message}</span>
                                    <span className="time">{new Date(act.timestamp).toLocaleString()}</span>
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
