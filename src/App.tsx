import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import DashboardHome from './pages/DashboardHome';
import FleetManager from './pages/FleetManager';
import Fleet from './pages/Fleet';
import BookingManager from './pages/BookingManager';
import CustomerManager from './pages/CustomerManager';
import FinanceManager from './pages/FinanceManager';
import Settings from './pages/Settings';
import CarDetails from './pages/CarDetails';

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
          <Route path="/fleet" element={<ProtectedRoute><FleetManager /></ProtectedRoute>} />
          <Route path="/fleet/catalog" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
          <Route path="/fleet/:id" element={<ProtectedRoute><CarDetails /></ProtectedRoute>} />
          <Route path="/bookings" element={<ProtectedRoute><BookingManager /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><CustomerManager /></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute><FinanceManager /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
