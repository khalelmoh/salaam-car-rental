import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Lock, Mail } from 'lucide-react';
import Button from '../components/Button';
import { login } from '../lib/auth';
import './Login.css';

const Login = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) {
            setError('Email and password are required.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-logo">
                        <Car size={32} className="text-primary" />
                    </div>
                    <h1>Salaam Car Rental</h1>
                    <p>Management System Login</p>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    {error && <div className="error-message">{error}</div>}

                    <div className="form-group">
                        <label>Email Address</label>
                        <div className="input-with-icon">
                            <Mail size={18} className="input-icon" />
                            <input
                                type="email"
                                placeholder="admin@salaam.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <div className="input-with-icon">
                            <Lock size={18} className="input-icon" />
                            <input
                                type="password"
                                placeholder="••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <Button type="submit" disabled={isLoading} style={{ width: '100%' }}>
                        {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>

                    <div className="login-footer">
                        <p className="text-sm text-muted">Use <strong>admin@salaam.com</strong> / <strong>admin</strong></p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
