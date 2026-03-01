import { useEffect, useState } from 'react';
import { BellRing, KeyRound, Save, UserRound } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { AppSettings } from '../types/models';
import './Settings.css';

const Settings = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingBookingNotifications, setIsSavingBookingNotifications] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
    name: '',
    title: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [bookingNotificationForm, setBookingNotificationForm] = useState({
    bookingNotificationsEnabled: true,
    bookingReminderMinutes: '10',
    autoMarkOverdue: true,
  });

  useEffect(() => {
    const load = async () => {
      setError('');
      try {
        setIsLoading(true);
        const [me, settings] = await Promise.all([api.me(), api.getSettings()]);
        setProfileForm((prev) => ({
          ...prev,
          username: me.user.username || '',
          email: me.user.email || '',
          name: me.user.name || '',
          title: me.user.title || '',
        }));
        setAppSettings(settings);
        setBookingNotificationForm({
          bookingNotificationsEnabled: settings.bookingNotificationsEnabled !== false,
          bookingReminderMinutes: String(settings.bookingReminderMinutes ?? 10),
          autoMarkOverdue: settings.autoMarkOverdue !== false,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!profileForm.username.trim() || !profileForm.email.trim()) {
      setError('Username and email are required.');
      return;
    }
    if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    try {
      setIsSavingProfile(true);
      const payload: {
        username: string;
        email: string;
        name: string;
        title: string;
        currentPassword?: string;
        newPassword?: string;
      } = {
        username: profileForm.username.trim(),
        email: profileForm.email.trim(),
        name: profileForm.name.trim(),
        title: profileForm.title.trim(),
      };
      if (profileForm.newPassword) {
        payload.currentPassword = profileForm.currentPassword;
        payload.newPassword = profileForm.newPassword;
      }

      const updated = await api.updateProfile(payload);
      setProfileForm((prev) => ({
        ...prev,
        username: updated.user.username || prev.username,
        email: updated.user.email || prev.email,
        name: updated.user.name || '',
        title: updated.user.title || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleBookingNotificationsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!appSettings) {
      setError('Settings are not loaded yet.');
      return;
    }

    const reminderMinutes = Number(bookingNotificationForm.bookingReminderMinutes);
    if (Number.isNaN(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 120) {
      setError('Reminder minutes must be a number between 0 and 120.');
      return;
    }

    try {
      setIsSavingBookingNotifications(true);
      const updated = await api.updateSettings({
        ...appSettings,
        bookingNotificationsEnabled: bookingNotificationForm.bookingNotificationsEnabled,
        bookingReminderMinutes: reminderMinutes,
        autoMarkOverdue: bookingNotificationForm.autoMarkOverdue,
      });
      setAppSettings(updated);
      setBookingNotificationForm({
        bookingNotificationsEnabled: updated.bookingNotificationsEnabled !== false,
        bookingReminderMinutes: String(updated.bookingReminderMinutes ?? 10),
        autoMarkOverdue: updated.autoMarkOverdue !== false,
      });
      setSuccess('Booking end-time notification settings updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking notification settings.');
    } finally {
      setIsSavingBookingNotifications(false);
    }
  };

  return (
    <DashboardLayout title="Settings">
      {isLoading && <div className="settings-status">Loading settings...</div>}
      {error && <div className="settings-status settings-error">{error}</div>}
      {success && <div className="settings-status settings-success">{success}</div>}

      {!isLoading && (
        <div className="settings-grid">
          <section className="settings-card">
            <h3><UserRound size={18} /> Profile Settings</h3>
            <form onSubmit={handleProfileSave} className="settings-form">
              <label>
                Username
                <input
                  value={profileForm.username}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </label>
              <label>
                Name
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label>
                Title
                <input
                  value={profileForm.title}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </label>

              <h4><KeyRound size={16} /> Change Password</h4>
              <label>
                Current Password
                <input
                  type="password"
                  value={profileForm.currentPassword}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                />
              </label>
              <label>
                New Password
                <input
                  type="password"
                  value={profileForm.newPassword}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                />
              </label>
              <label>
                Confirm New Password
                <input
                  type="password"
                  value={profileForm.confirmPassword}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                />
              </label>

              <div className="settings-actions">
                <Button type="submit" disabled={isSavingProfile}>
                  <Save size={16} /> {isSavingProfile ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            </form>
          </section>

          <section className="settings-card">
            <h3><BellRing size={18} /> Booking End-Time Notifications</h3>
            <form onSubmit={handleBookingNotificationsSave} className="settings-form">
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={bookingNotificationForm.bookingNotificationsEnabled}
                  onChange={(e) => setBookingNotificationForm((prev) => ({ ...prev, bookingNotificationsEnabled: e.target.checked }))}
                />
                <span>Enable automated booking end-time notifications</span>
              </label>

              <label>
                Reminder Before End (minutes)
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={bookingNotificationForm.bookingReminderMinutes}
                  onChange={(e) => setBookingNotificationForm((prev) => ({ ...prev, bookingReminderMinutes: e.target.value }))}
                  disabled={!bookingNotificationForm.bookingNotificationsEnabled}
                />
              </label>

              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={bookingNotificationForm.autoMarkOverdue}
                  onChange={(e) => setBookingNotificationForm((prev) => ({ ...prev, autoMarkOverdue: e.target.checked }))}
                  disabled={!bookingNotificationForm.bookingNotificationsEnabled}
                />
                <span>Automatically mark booking as Overdue when end time is reached</span>
              </label>

              <div className="settings-actions">
                <Button type="submit" disabled={isSavingBookingNotifications}>
                  <Save size={16} /> {isSavingBookingNotifications ? 'Saving...' : 'Save Notification Settings'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Settings;
