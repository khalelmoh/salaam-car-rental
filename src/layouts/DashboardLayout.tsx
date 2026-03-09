import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarRange, DollarSign, LayoutDashboard, Settings, Users } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { getStoredUser } from '../lib/auth';
import { api } from '../lib/api';
import { notifyDataChanged } from '../utils/realtime';
import { formatDateTimeDMY } from '../utils/date';
import type { NotificationItem } from '../types/models';
import './DashboardLayout.css';

interface DashboardLayoutProps {
    children: ReactNode;
    title: string;
    theme?: 'default' | 'overview-dark';
}

const DashboardLayout = ({ children, title, theme = 'default' }: DashboardLayoutProps) => {
    const user = useMemo(() => getStoredUser(), []);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
    const [isClearingNotifications, setIsClearingNotifications] = useState(false);
    const [notificationsError, setNotificationsError] = useState('');
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [lastReadAt, setLastReadAt] = useState<number>(() => Number(localStorage.getItem('salaam_notifications_last_read_at') || '0'));
    const notificationsRef = useRef<HTMLDivElement | null>(null);

    const loadNotifications = async (showLoading = false) => {
        setNotificationsError('');
        if (showLoading) setIsNotificationsLoading(true);
        try {
            const list = await api.listNotifications(50);
            setNotifications(list);
        } catch (err) {
            setNotificationsError(err instanceof Error ? err.message : 'Failed to load notifications.');
        } finally {
            setIsNotificationsLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications(true);
    }, []);

    useEffect(() => {
        if (!isNotificationsOpen) return;
        const now = Date.now();
        setLastReadAt(now);
        localStorage.setItem('salaam_notifications_last_read_at', String(now));
        loadNotifications(true);
        const intervalId = window.setInterval(() => loadNotifications(false), 30000);
        return () => window.clearInterval(intervalId);
    }, [isNotificationsOpen]);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (!notificationsRef.current) return;
            if (!notificationsRef.current.contains(event.target as Node)) {
                setIsNotificationsOpen(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, []);

    const handleClearNotifications = async () => {
        try {
            setIsClearingNotifications(true);
            setNotificationsError('');
            await api.clearNotifications();
            setNotifications([]);
            notifyDataChanged();
        } catch (err) {
            setNotificationsError(err instanceof Error ? err.message : 'Failed to clear notifications.');
        } finally {
            setIsClearingNotifications(false);
        }
    };

    const unreadCount = notifications.filter((n) => n.timestamp > lastReadAt).length;

    return (
        <div className={`dashboard-layout ${theme === 'overview-dark' ? 'dashboard-layout-overview-dark' : ''}`}>
            <Sidebar />
            <main className="dashboard-main">
                <header className={`dashboard-header ${theme === 'overview-dark' ? 'dashboard-header-overview-dark' : ''}`}>
                    <h1>{title}</h1>
                    <div className="header-actions">
                        <div className="notifications-wrap" ref={notificationsRef}>
                            <button
                                type="button"
                                className="notification-btn"
                                aria-label="Notifications"
                                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                            >
                                <Bell size={18} />
                                {unreadCount > 0 && (
                                    <span className="notification-count">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </button>
                            {isNotificationsOpen && (
                                <div className="notifications-panel">
                                    <div className="notifications-panel-header">
                                        <strong>Notifications</strong>
                                        <button
                                            type="button"
                                            className="notifications-clear-btn"
                                            onClick={handleClearNotifications}
                                            disabled={isClearingNotifications || notifications.length === 0}
                                        >
                                            {isClearingNotifications ? 'Clearing...' : 'Clear all'}
                                        </button>
                                    </div>
                                    <div className="notifications-panel-body">
                                        {isNotificationsLoading && <div className="notifications-empty">Loading...</div>}
                                        {!isNotificationsLoading && notificationsError && (
                                            <div className="notifications-empty notifications-error">{notificationsError}</div>
                                        )}
                                        {!isNotificationsLoading && !notificationsError && notifications.length === 0 && (
                                            <div className="notifications-empty">No notifications yet.</div>
                                        )}
                                        {!isNotificationsLoading && !notificationsError && notifications.length > 0 && (
                                            <ul className="notifications-list">
                                                {notifications.map((item) => (
                                                    <li key={item.id} className="notifications-item">
                                                        <div className="notifications-message">{item.message}</div>
                                                        <div className="notifications-time">{formatDateTimeDMY(item.timestamp)}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="notifications-panel-footer">
                                        <Link to="/notifications" className="notifications-view-all" onClick={() => setIsNotificationsOpen(false)}>
                                            View all notifications
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="user-profile">
                            <div className="avatar">A</div>
                            <span className="username">{user?.name || 'Admin User'}</span>
                        </div>
                    </div>
                </header>
                <div className="dashboard-content">
                    {children}
                </div>
                <nav className="mobile-action-nav">
                    <NavLink to="/" end className={({ isActive }) => `mobile-action-item ${isActive ? 'active' : ''}`}>
                        <LayoutDashboard size={16} />
                        <span>Home</span>
                    </NavLink>
                    <NavLink to="/bookings" className={({ isActive }) => `mobile-action-item ${isActive ? 'active' : ''}`}>
                        <CalendarRange size={16} />
                        <span>Bookings</span>
                    </NavLink>
                    <NavLink to="/customers" className={({ isActive }) => `mobile-action-item ${isActive ? 'active' : ''}`}>
                        <Users size={16} />
                        <span>Customers</span>
                    </NavLink>
                    <NavLink to="/finance" className={({ isActive }) => `mobile-action-item ${isActive ? 'active' : ''}`}>
                        <DollarSign size={16} />
                        <span>Finance</span>
                    </NavLink>
                    <NavLink to="/settings" className={({ isActive }) => `mobile-action-item ${isActive ? 'active' : ''}`}>
                        <Settings size={16} />
                        <span>Settings</span>
                    </NavLink>
                </nav>
            </main>
        </div>
    );
};

export default DashboardLayout;
