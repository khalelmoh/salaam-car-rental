import { Car, DollarSign, Calendar, Activity, TrendingUp, PieChart, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import StatsCard from '../components/StatsCard';
import RevenueChart from '../components/RevenueChart';
import FleetStatusChart from '../components/FleetStatusChart';
import Button from '../components/Button';
import { getActivities } from '../utils/activity';
import { cars } from '../data/cars';
import './DashboardHome.css';

const DashboardHome = () => {
    const [totalFleet, setTotalFleet] = useState(cars.length);
    const [activeRentals, setActiveRentals] = useState(0);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [utilization, setUtilization] = useState(0);
    const [activities, setActivities] = useState(() => getActivities());

    const handleExport = () => {
        alert('Exporting Dashboard Report to PDF...');
    };

    const computeStats = () => {
        const bookingsRaw = localStorage.getItem('salaam_bookings') || '[]';
        const bookings = JSON.parse(bookingsRaw) as any[];
        const active = bookings.filter(b => b.status === 'active').length;

        const trxRaw = localStorage.getItem('salaam_transactions') || '[]';
        const tx = JSON.parse(trxRaw) as any[];
        const revenue = tx.reduce((s, t) => s + (t.amount || 0), 0);

        setTotalFleet(cars.length);
        setActiveRentals(active);
        setTotalRevenue(revenue);
        setUtilization(cars.length ? Math.round((active / cars.length) * 100) : 0);
    };

    useEffect(() => {
        computeStats();

        const onBookings = () => computeStats();
        const onTransactions = () => computeStats();
        const onActivity = (e: any) => {
            const detail = e.detail;
            setActivities(prev => [detail, ...prev].slice(0, 50));
        };

        window.addEventListener('bookings-updated', onBookings);
        window.addEventListener('transactions-updated', onTransactions);
        window.addEventListener('activity-updated', onActivity as EventListener);

        return () => {
            window.removeEventListener('bookings-updated', onBookings);
            window.removeEventListener('transactions-updated', onTransactions);
            window.removeEventListener('activity-updated', onActivity as EventListener);
        };
    }, []);

    return (
        <DashboardLayout title="Dashboard Overview">
            <div className="dashboard-actions" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <Button onClick={handleExport}>
                    <Download size={18} /> Export Report
                </Button>
            </div>

            <div className="stats-grid">
                <StatsCard
                    title="Total Fleet"
                    value={`${totalFleet}`}
                    icon={<Car size={24} />}
                    color="#3b82f6"
                    trend={{ value: 12, isPositive: true }}
                />
                <StatsCard
                    title="Active Rentals"
                    value={`${activeRentals}`}
                    icon={<Calendar size={24} />}
                    color="#8b5cf6"
                    trend={{ value: 5, isPositive: true }}
                />
                <StatsCard
                    title="Total Revenue"
                    value={`$${totalRevenue.toLocaleString()}`}
                    icon={<DollarSign size={24} />}
                    color="#10b981"
                    trend={{ value: 8, isPositive: true }}
                />
                <StatsCard
                    title="Utilization"
                    value={`${utilization}%`}
                    icon={<Activity size={24} />}
                    color="#f59e0b"
                    trend={{ value: 2, isPositive: true }}
                />
            </div>

            <div className="dashboard-charts-grid">
                <div className="chart-card section-card">
                    <div className="card-header">
                        <h3><TrendingUp size={20} /> Revenue Trends</h3>
                    </div>
                    <div className="card-body">
                        <RevenueChart />
                    </div>
                </div>
                <div className="chart-card section-card">
                    <div className="card-header">
                        <h3><PieChart size={20} /> Fleet Status</h3>
                    </div>
                    <div className="card-body">
                        <FleetStatusChart />
                    </div>
                </div>
            </div>

            <div className="dashboard-sections">
                <div className="recent-activity section-card">
                    <div className="card-header">
                        <h3><Activity size={20} /> Recent Activity</h3>
                    </div>
                    <ul className="activity-list">
                        {activities.map(act => (
                            <li className="activity-item" key={act.id}>
                                <span className="dot bg-green"></span>
                                <span dangerouslySetInnerHTML={{ __html: act.message }} />
                                <span className="time">{new Date(act.timestamp).toLocaleString()}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default DashboardHome;
