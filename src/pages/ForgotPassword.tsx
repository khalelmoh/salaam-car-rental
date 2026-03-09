import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import Button from '../components/Button';
import { api } from '../lib/api';
import salaamLogo from '../assets/salaam-logo.png';
import './Login.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setResetUrl('');

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await api.forgotPassword(email.trim());
      setSuccess(result.message || 'If the account exists, a reset link has been generated.');
      if (result.resetUrl) setResetUrl(result.resetUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img src={salaamLogo} alt="Salaam Car Rental logo" className="login-logo-image" />
          </div>
          <h1>Forgot Password</h1>
          <p>Enter your email to get a reset link</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="form-group">
            <label>Email Address</label>
            <div className="input-with-icon">
              <Mail size={18} className={`input-icon ${email ? 'hidden' : ''}`} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting} style={{ width: '100%' }}>
            {isSubmitting ? 'Sending...' : 'Send Reset Link'}
          </Button>

          {resetUrl && (
            <p className="login-helper">
              Development reset link:{' '}
              <a className="login-link" href={resetUrl}>
                Open reset page
              </a>
            </p>
          )}

          <div className="login-footer">
            <Link to="/login" className="login-link">Back to Login</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
