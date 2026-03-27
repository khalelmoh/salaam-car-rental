import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { clearAuthState, storeUser } from '../lib/auth';

interface ProtectedRouteProps {
    children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const location = useLocation();
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [mustRotatePassword, setMustRotatePassword] = useState(false);

    useEffect(() => {
        let active = true;
        const run = async () => {
            try {
                const res = await api.me();
                storeUser(res.user);
                if (active) {
                    setIsAuthenticated(true);
                    setMustRotatePassword(Boolean(res.user.mustChangePassword));
                }
            } catch {
                clearAuthState();
                if (active) {
                    setIsAuthenticated(false);
                    setMustRotatePassword(false);
                }
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };
        run();
        return () => {
            active = false;
        };
    }, []);

    if (isLoading) {
        return <div style={{ padding: '2rem' }}>Checking session...</div>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (mustRotatePassword && location.pathname !== '/settings') {
        return <Navigate to="/settings?forcePasswordChange=1" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
