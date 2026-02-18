import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { AppSettings } from '../types/models';

const defaultSettings: AppSettings = {
  companyName: '',
  contactEmail: '',
  currency: 'USD',
  taxRate: 0,
  bookingLeadHours: 1,
};

const Settings = () => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await api.getSettings();
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: name === 'taxRate' || name === 'bookingLeadHours' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!settings.companyName.trim() || !settings.contactEmail.trim()) {
      setError('Company name and contact email are required.');
      return;
    }
    if (settings.taxRate < 0 || settings.bookingLeadHours < 0) {
      setError('Tax rate and booking lead hours must be non-negative.');
      return;
    }

    try {
      setIsSaving(true);
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      setSuccess('Settings saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout title="Settings">
      {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading settings...</div>}
      {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}
      {success && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#15803d' }}>{success}</div>}

      <div className="section-card" style={{ padding: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>System Configuration</h3>
        <form onSubmit={handleSubmit} className="booking-form">
          <div className="form-grid">
            <div className="form-group">
              <label>Company Name</label>
              <input className="form-input" name="companyName" required value={settings.companyName} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Contact Email</label>
              <input className="form-input" name="contactEmail" type="email" required value={settings.contactEmail} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <select className="form-input" name="currency" value={settings.currency} onChange={handleChange}>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tax Rate (%)</label>
              <input className="form-input" name="taxRate" type="number" min="0" step="0.01" value={settings.taxRate} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Minimum Booking Lead (Hours)</label>
              <input className="form-input" name="bookingLeadHours" type="number" min="0" step="1" value={settings.bookingLeadHours} onChange={handleChange} />
            </div>
          </div>
          <div className="form-footer">
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Settings'}</Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
