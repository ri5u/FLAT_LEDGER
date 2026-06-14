import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, User, ArrowUpRight, ArrowDownLeft, Receipt, RefreshCw } from 'lucide-react';

export default function BalanceBreakdown() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('flat_ledger_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchBreakdown = async () => {
      try {
        setLoading(true);
        const res = await fetch(`http://localhost:5000/api/balances/${userId}/breakdown`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        
        if (!res.ok) {
          throw new Error(json.error || 'Failed to load balance breakdown');
        }

        setData(json);
        // Expand the first group by default
        if (json.breakdown && json.breakdown.length > 0) {
          setExpandedGroups({ [json.breakdown[0].counterparty.id]: true });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBreakdown();
  }, [userId, navigate]);

  const toggleGroup = (id) => {
    setExpandedGroups(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Loading transaction drill-down...</div>;
  }

  if (error) {
    return (
      <div style={{ color: 'var(--danger)', fontSize: '15px' }}>
        <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', marginBottom: '16px' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <div>Error: {error}</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        
        <h1 style={{ fontSize: '28px', color: '#ffffff', fontWeight: '700' }}>
          Balance Details for {data.userName}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Drill-down audit trail of all transactions and direct transfers composing net balances.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {data.breakdown.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            No transaction history recorded for this user.
          </div>
        ) : (
          data.breakdown.map((group, idx) => {
            const cp = group.counterparty;
            const isExpanded = !!expandedGroups[cp.id];
            
            return (
              <div key={idx} className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                {/* Header Section (Accordion Trigger) */}
                <div 
                  onClick={() => toggleGroup(cp.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 24px',
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                    transition: 'var(--transition-fast)',
                    borderBottom: isExpanded ? '1px solid var(--glass-border)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)'
                    }}>
                      <User size={20} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: '600' }}>{cp.name}</span>
                        {cp.isGuest && <span className="badge badge-secondary" style={{ fontSize: '8px' }}>Guest</span>}
                      </div>
                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        {group.items.length} contributing transactions
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block' }}>
                        {group.netBalance >= 0 ? 'Owes you net' : 'You owe net'}
                      </span>
                      <span style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: group.netBalance >= 0 ? 'var(--success)' : 'var(--danger)'
                      }}>
                        ₹{Math.abs(group.netBalance)}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {/* Expanded Details Table */}
                {isExpanded && (
                  <div style={{ padding: '24px' }}>
                    <div className="table-container">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Type</th>
                            <th>Direction</th>
                            <th>Total Amount</th>
                            <th>Your Net Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item, itemIdx) => {
                            const isExpense = item.type === 'expense_split';
                            const isPositive = item.direction === 'positive'; // Reduces debt / means other owes you
                            
                            return (
                              <tr key={itemIdx}>
                                <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                  {new Date(item.date).toLocaleDateString()}
                                </td>
                                <td>
                                  {isExpense ? (
                                    <Link to={`/expenses/${item.refId}`} style={{ fontWeight: '500', color: 'var(--primary)' }}>
                                      {item.description}
                                    </Link>
                                  ) : (
                                    <span style={{ fontWeight: '500', color: '#ffffff' }}>{item.description}</span>
                                  )}
                                </td>
                                <td>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}>
                                    {isExpense ? <Receipt size={14} style={{ color: 'var(--accent)' }} /> : <RefreshCw size={14} style={{ color: 'var(--primary)' }} />}
                                    {isExpense ? 'Expense split' : 'Direct payment'}
                                  </span>
                                </td>
                                <td>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    color: isPositive ? 'var(--success)' : 'var(--danger)'
                                  }}>
                                    {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                                    {isExpense 
                                      ? (item.role === 'creditor' ? 'Owed to you' : 'Owed by you')
                                      : (item.role === 'sender' ? 'You paid them' : 'They paid you')
                                    }
                                  </span>
                                </td>
                                <td style={{ color: 'var(--text-secondary)' }}>
                                  {isExpense ? `₹${item.totalAmount}` : '—'}
                                </td>
                                <td style={{ 
                                  fontWeight: '600', 
                                  color: isPositive ? 'var(--success)' : 'var(--danger)' 
                                }}>
                                  {isPositive ? '+' : '-'}₹{item.shareAmount}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
