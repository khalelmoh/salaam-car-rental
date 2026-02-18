import type { ReactNode } from 'react';
import { useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import { getStoredUser } from '../lib/auth';
import './DashboardLayout.css';

interface DashboardLayoutProps {
    children: ReactNode;
    title: string;
}

const DashboardLayout = ({ children, title }: DashboardLayoutProps) => {
    const user = useMemo(() => getStoredUser(), []);

    return (
        <div className="dashboard-layout">
            <Sidebar />
            <main className="dashboard-main">
                <header className="dashboard-header">
                    <h1>{title}</h1>
                    <div className="user-profile">
                        <div className="avatar">A</div>
                        <span className="username">{user?.name || 'Admin User'}</span>
                    </div>
                </header>
                <div className="dashboard-content">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
