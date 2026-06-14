import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, RefreshCw, Users, FileSpreadsheet, LogOut, Wallet } from 'lucide-react';

// Import Pages
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Expenses from './pages/Expenses.jsx';
import ExpenseDetail from './pages/ExpenseDetail.jsx';
import BalanceBreakdown from './pages/BalanceBreakdown.jsx';
import Transfers from './pages/Transfers.jsx';
import Members from './pages/Members.jsx';
import Import from './pages/Import.jsx';

function AppLayout({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const userStr = localStorage.getItem('flat_ledger_user');
    const token = localStorage.getItem('flat_ledger_token');

    if (!userStr || !token) {
      navigate('/login');
      return;
    }

    setCurrentUser(JSON.parse(userStr));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('flat_ledger_token');
    localStorage.removeItem('flat_ledger_user');
    navigate('/login');
  };

  if (!currentUser) return null;

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Wallet size={24} style={{ color: 'var(--primary)' }} />
          <span>Flatmate Ledger</span>
        </div>

        <nav>
          <ul className="nav-list">
            <li className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}>
              <Link to="/dashboard">
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </Link>
            </li>

            <li className={`nav-item ${isActive('/expenses') ? 'active' : ''}`}>
              <Link to="/expenses">
                <Receipt size={18} />
                <span>Expenses</span>
              </Link>
            </li>

            <li className={`nav-item ${isActive('/transfers') ? 'active' : ''}`}>
              <Link to="/transfers">
                <RefreshCw size={18} />
                <span>Payments</span>
              </Link>
            </li>

            <li className={`nav-item ${isActive('/members') ? 'active' : ''}`}>
              <Link to="/members">
                <Users size={18} />
                <span>Residency</span>
              </Link>
            </li>

            {currentUser.role === 'admin' && (
              <li className={`nav-item ${isActive('/import') ? 'active' : ''}`}>
                <Link to="/import">
                  <FileSpreadsheet size={18} />
                  <span>Import CSV</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <div className="profile-section">
          <div className="profile-info">
            <span className="profile-name">{currentUser.name}</span>
            <span className="profile-role" style={{ textTransform: 'capitalize' }}>{currentUser.role}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

// Route Protector Wrapper
function PrivateRoute({ children }) {
  const token = localStorage.getItem('flat_ledger_token');
  return token ? <AppLayout>{children}</AppLayout> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Private ledger routes */}
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/expenses" element={<PrivateRoute><Expenses /></PrivateRoute>} />
        <Route path="/expenses/:id" element={<PrivateRoute><ExpenseDetail /></PrivateRoute>} />
        <Route path="/balances/:userId" element={<PrivateRoute><BalanceBreakdown /></PrivateRoute>} />
        <Route path="/transfers" element={<PrivateRoute><Transfers /></PrivateRoute>} />
        <Route path="/members" element={<PrivateRoute><Members /></PrivateRoute>} />
        <Route path="/import" element={<PrivateRoute><Import /></PrivateRoute>} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
