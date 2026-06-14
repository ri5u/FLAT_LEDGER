import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Scale, User, FileText, ArrowRight } from 'lucide-react';

export default function Dashboard() {
  const [balances, setBalances] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const userStr = localStorage.getItem('flat_ledger_user');
    const token = localStorage.getItem('flat_ledger_token');

    if (!userStr || !token) {
      navigate('/login');
      return;
    }

    const user = JSON.parse(userStr);
    setCurrentUser(user);

    const fetchBalances = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/balances', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load balances');
        }

        setBalances(data.balances || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
  }, [navigate]);

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Loading dashboard balances...</div>;
  }

  if (error) {
    return <div style={{ color: 'var(--danger)', fontSize: '15px' }}>Error: {error}</div>;
  }

  // Calculate personal net balance
  // Filter balances where current user is debtor (they owe someone) or creditor (someone owes them)
  let personalNet = 0;
  const personalBalances = [];

  balances.forEach(b => {
    if (b.debtorId === currentUser.id) {
      personalNet -= b.amountInr;
      personalBalances.push({
        counterpartyId: b.creditorId,
        counterpartyName: b.creditorName,
        counterpartyIsGuest: b.creditorIsGuest,
        amount: b.amountInr,
        type: 'owe' // you owe them
      });
    } else if (b.creditorId === currentUser.id) {
      personalNet += b.amountInr;
      personalBalances.push({
        counterpartyId: b.debtorId,
        counterpartyName: b.debtorName,
        counterpartyIsGuest: b.debtorIsGuest,
        amount: b.amountInr,
        type: 'owed' // they owe you
      });
    }
  });

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', color: '#ffffff', fontWeight: '700' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Overview of pairwise balances and splits across the flat
        </p>
      </div>

      {/* Stats Cards Section */}
      <div className="dashboard-grid">
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: personalNet >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: personalNet >= 0 ? 'var(--success)' : 'var(--danger)',
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {personalNet >= 0 ? <ArrowUpRight size={22} /> : <ArrowDownLeft size={22} />}
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Your Net Balance</div>
            <div style={{
              fontSize: '22px',
              fontWeight: '700',
              color: personalNet >= 0 ? 'var(--success)' : 'var(--danger)',
              marginTop: '2px'
            }}>
              {personalNet >= 0 ? '+' : ''}₹{Math.round(personalNet * 100) / 100}
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'var(--primary-glow)',
            color: 'var(--primary)',
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Scale size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Active Relationships</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
              {personalBalances.length}
            </div>
          </div>
        </div>
      </div>

      {/* Aisha's View: Personal Balances List */}
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '16px', fontWeight: '600' }}>
          Your Shared Balances (Aisha's View)
        </h2>
        
        {personalBalances.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '30px' }}>
            You are completely settled up! No active debts or credits.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {personalBalances.map((item, idx) => (
              <div 
                key={idx} 
                className="glass-card" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '18px 24px',
                  background: 'rgba(15, 23, 42, 0.4)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)'
                  }}>
                    <User size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '600', fontSize: '15px' }}>{item.counterpartyName}</span>
                      {item.counterpartyIsGuest && (
                        <span className="badge badge-secondary" style={{ fontSize: '9px', padding: '2px 6px' }}>Guest</span>
                      )}
                    </div>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {item.type === 'owe' 
                        ? `You owe ${item.counterpartyName} money` 
                        : `${item.counterpartyName} owes you money`}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <span style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: item.type === 'owe' ? 'var(--danger)' : 'var(--success)'
                  }}>
                    {item.type === 'owe' ? '-' : '+'}₹{item.amount}
                  </span>
                  
                  <Link 
                    to={`/balances/${item.counterpartyId}`}
                    className="btn btn-secondary"
                    style={{ padding: '8px 14px', fontSize: '12.5px' }}
                  >
                    View Details <ArrowRight size={14} style={{ marginLeft: '4px' }} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global Ledger Balance Table */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', color: '#ffffff', fontWeight: '600' }}>Global Pairwise Ledger</h2>
          {currentUser.role === 'admin' && (
            <Link to="/import" className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '12.5px' }}>
              Import CSV
            </Link>
          )}
        </div>
        
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Debtor (Owes)</th>
                <th>Creditor (Is Owed)</th>
                <th>Amount (INR)</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                    No pairwise balances logged. Try importing expenses.
                  </td>
                </tr>
              ) : (
                balances.map((b, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{b.debtorName}</span>
                        {b.debtorIsGuest && <span className="badge badge-secondary" style={{ fontSize: '8px' }}>Guest</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{b.creditorName}</span>
                        {b.creditorIsGuest && <span className="badge badge-secondary" style={{ fontSize: '8px' }}>Guest</span>}
                      </div>
                    </td>
                    <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>₹{b.amountInr}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link 
                        to={`/balances/${b.debtorId}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--primary)' }}
                      >
                        Drill Down <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
