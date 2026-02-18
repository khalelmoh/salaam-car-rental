import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Car, CalendarRange, Users, Settings, LogOut, DollarSign } from 'lucide-react';
import { logout } from '../lib/auth';
import './Sidebar.css';

const Sidebar = () => {
    const handleLogout = async () => {
        if (window.confirm('Are you sure you want to logout?')) {
            await logout();
            window.location.href = '/login';
        }
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <Car className="logo-icon" size={28} />
                    <span>Salaam Admin</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <LayoutDashboard size={20} />
                    <span>Dashboard</span>
                </NavLink>

                <NavLink to="/fleet" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Car size={20} />
                    <span>Fleet Manager</span>
                </NavLink>

                <NavLink to="/bookings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <CalendarRange size={20} />
                    <span>Bookings</span>
                </NavLink>

                <NavLink to="/customers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Users size={20} />
                    <span>Customers</span>
                </NavLink>

                <NavLink to="/finance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <DollarSign size={20} />
                    <span>Finance</span>
                </NavLink>

                <div className="nav-divider"></div>

                <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Settings size={20} />
                    <span>Settings</span>
                </NavLink>
            </nav>

            <div className="sidebar-footer">
                <button className="nav-item logout-btn" onClick={handleLogout}>
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
