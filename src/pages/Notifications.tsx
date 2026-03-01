import { useEffect, useMemo, useState } from 'react';
import { BellRing, RefreshCcw, Trash2 } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import { notifyDataChanged } from '../utils/realtime';
import type { NotificationItem } from '../types/models';
import './Notifications.css';

const READ_AT_KEY = 'salaam_notifications_last_read_at';

const Notifications = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastReadAt, setLastReadAt] = useState<number>(() => Number(localStorage.getItem(READ_AT_KEY) || '0'));

  const loadNotifications = async (loading = false) => {
    setError('');
    if (loading) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const data = await api.listNotifications(200);
      setNotifications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const now = Date.now();
    setLastReadAt(now);
    localStorage.setItem(READ_AT_KEY, String(now));
    loadNotifications(true);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.timestamp > lastReadAt).length,
    [notifications, lastReadAt]
  );

  const handleRefresh = async () => {
    await loadNotifications(false);
  };

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    if (!window.confirm('Clear all notifications?')) return;
    setError('');
    try {
      setIsClearing(true);
      await api.clearNotifications();
      setNotifications([]);
      notifyDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear notifications.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <DashboardLayout title="Notifications">
      <div className="notifications-page-controls">
        <div className="notifications-page-summary">
          <BellRing size={18} />
          <span>Total: {notifications.length}</span>
          <span>Unread: {unreadCount}</span>
        </div>
        <div className="notifications-page-actions">
          <Button type="button" variant="outline" onClick={handleRefresh} disabled={isRefreshing || isLoading}>
            <RefreshCcw size={16} /> {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button type="button" variant="outline" className="notifications-page-clear" onClick={handleClearAll} disabled={isClearing || notifications.length === 0}>
            <Trash2 size={16} /> {isClearing ? 'Clearing...' : 'Clear All'}
          </Button>
        </div>
      </div>

      {isLoading && <div className="notifications-page-card">Loading notifications...</div>}
      {error && <div className="notifications-page-card notifications-page-error">{error}</div>}

      {!isLoading && !error && notifications.length === 0 && (
        <div className="notifications-page-card">No notifications found.</div>
      )}

      {!isLoading && !error && notifications.length > 0 && (
        <div className="notifications-page-list">
          {notifications.map((item) => (
            <article className="notifications-page-item" key={item.id}>
              <div className="notifications-page-item-message">{item.message}</div>
              <div className="notifications-page-item-time">{new Date(item.timestamp).toLocaleString()}</div>
            </article>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default Notifications;
