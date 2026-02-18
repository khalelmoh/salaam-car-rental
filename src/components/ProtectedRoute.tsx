import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api, clearAuthToken, getAuthToken } from '../lib/api';
import { clearAuthState, storeUser } from '../lib/auth';

interface ProtectedRouteProps {
    children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        let active = true;
        const run = async () => {
            const token = getAuthToken();
            if (!token) {
                if (active) {
                    setIsAuthenticated(false);
                    setIsLoading(false);
                }
                return;
            }
            try {
                const res = await api.me();
                storeUser(res.user);
                if (active) {
                    setIsAuthenticated(true);
                }
            } catch {
                clearAuthToken();
                clearAuthState();
                if (active) {
                    setIsAuthenticated(false);
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

    return <>{children}</>;
};

export default ProtectedRoute;
