import { Car, DollarSign, Calendar, Activity, TrendingUp, PieChart, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import StatsCard from '../components/StatsCard';
import RevenueChart from '../components/RevenueChart';
import FleetStatusChart from '../components/FleetStatusChart';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { DashboardPayload } from '../types/models';
import './DashboardHome.css';

const DashboardHome = () => {
    const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const handleExport = () => {
        if (!dashboard) return;
        const content = JSON.stringify(dashboard, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `dashboard-report-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        let active = true;
        const load = async () => {
            setError('');
            setIsLoading(true);
            try {
                const data = await api.getDashboard();
                if (active) {
                    setDashboard(data);
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
        load();
        return () => {
            active = false;
        };
    }, []);

    return (
        <DashboardLayout title="Dashboard Overview">
            <div className="dashboard-actions" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <Button onClick={handleExport}>
                    <Download size={18} /> Export Report
                </Button>
            </div>
            {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading dashboard...</div>}
            {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}

            <div className="stats-grid">
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
                    color="#10b981"
                    trend={{ value: 8, isPositive: true }}
                />
                <StatsCard
                    title="Utilization"
                    value={`${dashboard?.utilization ?? 0}%`}
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

            <div className="dashboard-sections">
                <div className="recent-activity section-card">
                    <div className="card-header">
                        <h3><Activity size={20} /> Recent Activity</h3>
                    </div>
                    <ul className="activity-list">
                        {(dashboard?.activities ?? []).map(act => (
                            <li className="activity-item" key={act.id}>
                                <span className="dot bg-green"></span>
                                <span>{act.message}</span>
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
