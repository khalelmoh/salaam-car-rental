import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import Button from '../components/Button';
import { login } from '../lib/auth';
import salaamLogo from '../assets/salaam-logo.png';
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
                        <img src={salaamLogo} alt="Salaam Car Rental logo" className="login-logo-image" />
                    </div>
                    <h1>Salaam Car Rental</h1>
                    <p>Management System Login</p>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    {error && <div className="error-message">{error}</div>}

                    <div className="form-group">
                        <label>Email Address</label>
                        <div className="input-with-icon">
                            <Mail size={18} className={`input-icon ${email ? 'hidden' : ''}`} />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                autoComplete="off"
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <div className="input-with-icon">
                            <Lock size={18} className={`input-icon ${password ? 'hidden' : ''}`} />
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                    </div>

                    <Button type="submit" disabled={isLoading} style={{ width: '100%' }}>
                        {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>

                </form>
            </div>
        </div>
    );
};

export default Login;
