import {
  Activity,
  Calendar,
  CalendarDays,
  Car,
  CircleDollarSign,
  Clock3,
  Eye,
  Hammer,
  ListFilter,
  TrendingUp,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { api } from '../lib/api';
import type { Booking, DashboardPayload, Transaction, TransactionType } from '../types/models';
import { onDataChanged } from '../utils/realtime';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './DashboardHome.css';

const normalizeType = (value: string): TransactionType =>
  String(value).toLowerCase() === 'expense'
    ? 'Expense'
    : String(value).toLowerCase() === 'commission'
      ? 'Commission'
      : 'Income';

type RevenuePoint = { name: string; revenue: number };
type DailyRevenuePoint = { date: string; revenue: number };

function derivePaidRevenue(transactions: Transaction[], bookings: Booking[]) {
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const paidTransactions = transactions.filter((t) => {
    if (normalizeType(t.type) !== 'Income') return false;
    if (!t.bookingId) return true;
    return bookingById.get(t.bookingId)?.paymentStatus === 'paid';
  });

  const totalRevenue = paidTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const revenueByMonth = new Map<string, number>();
  const revenueByDay = new Map<string, number>();
  for (const t of paidTransactions) {
    const rawDate = String(t.date || '').slice(0, 10);
    const date = new Date(`${rawDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) continue;
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    revenueByMonth.set(monthKey, (revenueByMonth.get(monthKey) || 0) + Number(t.amount || 0));
    revenueByDay.set(rawDate, (revenueByDay.get(rawDate) || 0) + Number(t.amount || 0));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const revenueData: RevenuePoint[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    const label = monthDate.toLocaleDateString('en-US', { month: 'short' });
    revenueData.push({ name: label, revenue: Number((revenueByMonth.get(monthKey) || 0).toFixed(2)) });
  }

  const dailyRevenue = Array.from(revenueByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue: Number(revenue.toFixed(2)) }));

  return { totalRevenue: Number(totalRevenue.toFixed(2)), revenueData, dailyRevenue };
}

function formatActivityTime(timestamp: number) {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', ', ');
}

function activityIcon(message: string) {
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('maintenance')) return <Wrench size={16} />;
  if (normalized.includes('overdue')) return <Clock3 size={16} />;
  if (normalized.includes('cancel')) return <Hammer size={16} />;
  if (normalized.includes('booking')) return <CalendarDays size={16} />;
  return <Activity size={16} />;
}

function summarizeActivity(message: string) {
  const raw = String(message || '').trim();
  if (!raw) return { title: 'System Update', detail: '-' };
  const splitIndex = raw.indexOf(':');
  if (splitIndex > 0) {
    return {
      title: raw.slice(0, splitIndex).trim(),
      detail: raw.slice(splitIndex + 1).trim() || '-',
    };
  }
  const words = raw.split(/\s+/);
  return {
    title: words.slice(0, 3).join(' '),
    detail: words.slice(3).join(' ') || '-',
  };
}

type RevenueRange = 'year' | 'last90' | 'last30' | 'last7';

const rangeLabels: Record<RevenueRange, string> = {
  year: 'Date - Range: Year',
  last90: 'Date - Range: Last 90 Days',
  last30: 'Date - Range: Last 30 Days',
  last7: 'Date - Range: Last 7 Days',
};

function buildRevenueRangeData(
  range: RevenueRange,
  yearData: RevenuePoint[],
  dailyRevenue: DailyRevenuePoint[],
) {
  if (range === 'year') return yearData;

  const revenueByDay = new Map(dailyRevenue.map((point) => [point.date, point.revenue]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (range === 'last90') {
    const start = new Date(today);
    start.setDate(today.getDate() - 89);
    const monthly = new Map<string, number>();
    const keysInOrder: string[] = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cursor <= endMonth) {
      const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      keysInOrder.push(monthKey);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    for (let i = 0; i < 90; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthly.set(monthKey, (monthly.get(monthKey) || 0) + Number(revenueByDay.get(dateKey) || 0));
    }
    return keysInOrder.map((monthKey) => {
      const [year, month] = monthKey.split('-').map(Number);
      const labelDate = new Date(year, (month || 1) - 1, 1);
      return {
        name: labelDate.toLocaleDateString('en-US', { month: 'short' }),
        revenue: Number((monthly.get(monthKey) || 0).toFixed(2)),
      };
    });
  }

  const days = range === 'last30' ? 30 : 7;
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));
  const points: RevenuePoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    points.push({
      name: range === 'last7'
        ? date.toLocaleDateString('en-US', { weekday: 'short' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: Number((revenueByDay.get(dateKey) || 0).toFixed(2)),
    });
  }
  return points;
}

const DashboardHome = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [revenueRange, setRevenueRange] = useState<RevenueRange>('last7');
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenuePoint[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [activityLimit, setActivityLimit] = useState(4);
  const utilizationOccupied = dashboard?.utilizationOccupied ?? dashboard?.activeRentals ?? 0;
  const utilizationTotal = dashboard?.utilizationTotal ?? dashboard?.totalFleet ?? 0;
  const utilizationValue = `${dashboard?.utilization ?? 0}% (${utilizationOccupied}/${utilizationTotal})`;
  const activities = (dashboard?.activities ?? []).slice(0, activityLimit);
  const revenueData = buildRevenueRangeData(revenueRange, dashboard?.revenueData ?? [], dailyRevenue);
  const revenueTotal = revenueData.reduce((sum, item) => sum + Number(item.revenue || 0), 0);

  const goToActivityTarget = (type?: string) => {
    const value = String(type || '').toLowerCase();
    if (value.includes('customer')) return navigate('/customers');
    if (value.includes('booking')) return navigate('/bookings');
    if (value.includes('car') || value.includes('fleet') || value.includes('vehicle')) return navigate('/fleet');
    return navigate('/notifications');
  };

  useEffect(() => {
    let active = true;
    const load = async (showLoading = false) => {
      setError('');
      if (showLoading) {
        setIsLoading(true);
      }
      try {
        const [data, transactions, bookings, officeSummary] = await Promise.all([
          api.getDashboard(),
          api.listTransactions(),
          api.listBookings(),
          api.getOfficeFinanceSummary(),
        ]);
        const paidRevenue = derivePaidRevenue(transactions, bookings);
        if (active) {
          setDailyRevenue(paidRevenue.dailyRevenue);
          setDashboard({
            ...data,
            totalRevenue: Number(officeSummary.officeIncome || 0),
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
    <DashboardLayout title="Dashboard Overview" theme="overview-dark">
      <div className="overview-shell">
        {isLoading && <div className="overview-status">Loading dashboard...</div>}
        {error && <div className="overview-status overview-status-error">{error}</div>}

        <section className="overview-metrics reveal-up">
          <article className="overview-metric-card">
            <div className="overview-metric-icon">
              <Car size={18} />
            </div>
            <div className="overview-metric-copy">
              <p>Total Fleet:</p>
              <h3>{dashboard?.totalFleet ?? 0}</h3>
              <span className="overview-pill">+12% vs last month</span>
            </div>
          </article>

          <article className="overview-metric-card">
            <div className="overview-metric-icon">
              <Calendar size={18} />
            </div>
            <div className="overview-metric-copy">
              <p>Active Rentals:</p>
              <h3>{dashboard?.activeRentals ?? 0}</h3>
              <span className="overview-pill">+5% from last month</span>
            </div>
            <span className="overview-metric-chip">{utilizationOccupied}/{utilizationTotal} active</span>
          </article>

          <article className="overview-metric-card">
            <div className="overview-metric-icon">
              <CircleDollarSign size={18} />
            </div>
            <div className="overview-metric-copy">
              <p>Total Revenue:</p>
              <h3>${(dashboard?.totalRevenue ?? 0).toLocaleString()}</h3>
              <span className="overview-pill">+8% from last month</span>
            </div>
          </article>

          <article className="overview-metric-card">
            <div className="overview-metric-icon">
              <Activity size={18} />
            </div>
            <div className="overview-metric-copy">
              <p>Utilization</p>
              <h3>{utilizationValue}</h3>
              <span className="overview-metric-sub">over last 7 days</span>
            </div>
            <svg className="overview-sparkline" viewBox="0 0 110 40" aria-hidden="true">
              <defs>
                <linearGradient id="sparklineStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#57bfff" />
                  <stop offset="100%" stopColor="#66e0ff" />
                </linearGradient>
              </defs>
              <path d="M2 30 C 14 12, 22 20, 34 14 C 48 8, 54 22, 66 18 C 80 13, 88 5, 98 17" fill="none" stroke="url(#sparklineStroke)" strokeWidth="2.8" strokeLinecap="round" />
            </svg>
          </article>
        </section>

        <section className="overview-charts reveal-up delay-1">
          <article className="overview-panel">
            <header className="overview-panel-header">
              <h3><TrendingUp size={16} /> Revenue Trends</h3>
              <div className="overview-panel-actions">
                <button type="button" className="overview-ghost-btn" onClick={() => setShowBreakdown((prev) => !prev)}>
                  {showBreakdown ? 'Hide Breakdown' : 'View Breakdown'}
                </button>
                <button
                  type="button"
                  className="overview-ghost-btn"
                  onClick={() => {
                    const order: RevenueRange[] = ['last7', 'last30', 'last90', 'year'];
                    const next = order[(order.indexOf(revenueRange) + 1) % order.length];
                    setRevenueRange(next);
                  }}
                >
                  <ListFilter size={14} />
                  {rangeLabels[revenueRange]}
                </button>
              </div>
            </header>
            <div className="overview-panel-body">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueData} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
                  <defs>
                    <linearGradient id="overviewLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#58bfff" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#58bfff" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="rgba(155, 182, 220, 0.22)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#95a9c5', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#95a9c5', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(9, 20, 40, 0.95)',
                      border: '1px solid rgba(106, 160, 230, 0.45)',
                      borderRadius: '10px',
                      color: '#eaf2ff',
                    }}
                    formatter={(value: number | string | undefined) => [`$${value ?? 0}`, 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#58bfff" strokeWidth={3} dot={{ r: 3, fill: '#9fdcff' }} activeDot={{ r: 6, fill: '#58bfff' }} />
                  <Line type="monotone" dataKey="revenue" stroke="url(#overviewLine)" strokeWidth={8} dot={false} legendType="none" />
                </LineChart>
              </ResponsiveContainer>
              <span className="overview-chart-tag">
                {revenueRange === 'year' ? 'Year' : revenueRange === 'last90' ? '90d' : revenueRange === 'last30' ? '30d' : '7d'}
              </span>
              {showBreakdown && (
                <div className="overview-breakdown">
                  <strong>Revenue Breakdown</strong>
                  <span>Total: ${revenueTotal.toLocaleString()}</span>
                  <ul>
                    {revenueData.map((row) => (
                      <li key={row.name}>
                        <span>{row.name}</span>
                        <span>${Number(row.revenue || 0).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </article>

          <article className="overview-panel">
            <header className="overview-panel-header">
              <h3><Clock3 size={16} /> Fleet Status</h3>
              <button type="button" className="overview-ghost-btn" onClick={() => navigate('/fleet')}>View All Vehicles</button>
            </header>
            <div className="overview-panel-body">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dashboard?.fleetStatusData ?? []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={92}
                    paddingAngle={4}
                    stroke="rgba(16,26,50,0.6)"
                    strokeWidth={2}
                  >
                    {(dashboard?.fleetStatusData ?? []).map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(9, 20, 40, 0.95)',
                      border: '1px solid rgba(106, 160, 230, 0.45)',
                      borderRadius: '10px',
                      color: '#eaf2ff',
                    }}
                  />
                  <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ color: '#c8d6ed', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="overview-panel reveal-up delay-2">
          <header className="overview-panel-header">
            <h3><Activity size={16} /> Recent Activity Log</h3>
          </header>
          <div className="overview-table-wrap">
            <table className="overview-activity-table">
              <tbody>
                {activities.length === 0 && (
                  <tr>
                    <td className="overview-empty">No recent activity yet.</td>
                  </tr>
                )}
                {activities.map((act, index) => {
                  const summary = summarizeActivity(act.message);
                  return (
                    <tr key={act.id}>
                      <td className="overview-event-cell">
                        <span className={`overview-event-icon tone-${index % 4}`}>{activityIcon(act.message)}</span>
                        <strong>{summary.title}</strong>
                      </td>
                      <td className="overview-detail-cell">{summary.detail}</td>
                      <td className="overview-quick-actions-cell">
                        {index === 0 && (
                          <div className="overview-quick-actions">
                            <button type="button" onClick={() => navigate('/bookings')}>Add New Booking</button>
                            <button type="button" onClick={() => navigate('/bookings')}>Check-in Vehicle</button>
                            <button type="button" onClick={() => navigate('/fleet')}>Report Maintenance</button>
                          </div>
                        )}
                      </td>
                      <td className="overview-time-cell">{formatActivityTime(act.timestamp)}</td>
                      <td className="overview-link-cell">
                        <button type="button" className="overview-inline-link" onClick={() => goToActivityTarget(act.type)}>
                          {act.type?.includes('customer') ? <UserRound size={14} /> : <Eye size={14} />}
                          {act.type?.includes('customer') ? 'Contact Customer' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <footer className="overview-footer-actions">
            <button
              type="button"
              className="overview-ghost-btn"
              onClick={() => setActivityLimit((prev) => prev + 4)}
              disabled={activityLimit >= (dashboard?.activities?.length || 0)}
            >
              Load More
            </button>
            <button type="button" className="overview-ghost-btn" onClick={() => navigate('/notifications')}>View Full Log</button>
          </footer>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default DashboardHome;
