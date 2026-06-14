import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, User, Plus, X, Calendar, DollarSign, AlertCircle, RefreshCw } from 'lucide-react';

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualFromUser, setManualFromUser] = useState('');
  const [manualToUser, setManualToUser] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualType, setManualType] = useState('settlement');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const navigate = useNavigate();

  const fetchTransfers = async () => {
    try {
      const token = localStorage.getItem('flat_ledger_token');
      if (!token) return;

      const res = await fetch('http://localhost:5000/api/transfers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to load transfers');
      setTransfers(data.transfers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('flat_ledger_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchUsers = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) setUsers(data.users || []);
      } catch (err) {
        console.error('Failed to load users:', err);
      }
    };

    fetchUsers();
    fetchTransfers();
  }, [navigate]);

  const handleAddManualTransfer = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!manualAmount || !manualDate || !manualFromUser || !manualToUser) {
      setFormError('Please fill in all required fields');
      return;
    }

    if (manualFromUser === manualToUser) {
      setFormError('Sender and Recipient cannot be the same person');
      return;
    }

    setFormLoading(true);

    try {
      const token = localStorage.getItem('flat_ledger_token');
      const res = await fetch('http://localhost:5000/api/transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(manualAmount),
          transferDate: manualDate,
          fromUserId: parseInt(manualFromUser, 10),
          toUserId: parseInt(manualToUser, 10),
          description: manualDesc || undefined,
          transferType: manualType
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record transfer');

      // Reset
      setManualAmount('');
      setManualDate(new Date().toISOString().slice(0, 10));
      setManualFromUser('');
      setManualToUser('');
      setManualDesc('');
      setManualType('settlement');
      setIsModalOpen(false);
      
      // Reload
      fetchTransfers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', color: '#ffffff', fontWeight: '700' }}>Direct Payments & Deposits</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Track peer-to-peer settlements and security deposits that reduce net balances.
          </p>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)} 
          className="btn btn-primary"
        >
          <Plus size={16} /> Record Transfer
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading transfers...</div>
      ) : error ? (
        <div style={{ color: 'var(--danger)' }}>Error: {error}</div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Sender (Paid)</th>
                <th>Recipient (Received)</th>
                <th>Amount (INR)</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                    No settlements or deposits recorded yet.
                  </td>
                </tr>
              ) : (
                transfers.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {new Date(tx.transferDate).toLocaleDateString()}
                    </td>
                    <td style={{ fontWeight: '500' }}>{tx.description}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <User size={13} style={{ color: 'var(--text-secondary)' }} />
                        {tx.fromUser?.name}
                        {tx.fromUser?.isGuest && <span className="badge badge-secondary" style={{ fontSize: '7.5px', padding: '1px 4px' }}>Guest</span>}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <User size={13} style={{ color: 'var(--text-secondary)' }} />
                        {tx.toUser?.name}
                        {tx.toUser?.isGuest && <span className="badge badge-secondary" style={{ fontSize: '7.5px', padding: '1px 4px' }}>Guest</span>}
                      </span>
                    </td>
                    <td style={{ fontWeight: '600', color: 'var(--success)' }}>₹{tx.amountInr}</td>
                    <td>
                      <span className={`badge ${tx.transferType === 'settlement' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                        {tx.transferType}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Transfer Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '450px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
              <h2 style={{ fontSize: '18px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowLeftRight size={20} style={{ color: 'var(--primary)' }} /> Record Direct Transfer
              </h2>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setFormError('');
                }} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--danger-bg)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                color: 'var(--danger)',
                padding: '10px 12px',
                borderRadius: 'var(--border-radius-md)',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddManualTransfer}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">From (Paid) *</label>
                  <select 
                    className="form-input"
                    value={manualFromUser}
                    onChange={(e) => setManualFromUser(e.target.value)}
                    disabled={formLoading}
                  >
                    <option value="">Select Sender</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} {u.isGuest ? '(Guest)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">To (Received) *</label>
                  <select 
                    className="form-input"
                    value={manualToUser}
                    onChange={(e) => setManualToUser(e.target.value)}
                    disabled={formLoading}
                  >
                    <option value="">Select Recipient</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} {u.isGuest ? '(Guest)' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Amount (INR) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    placeholder="e.g. 5000"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    disabled={formLoading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    disabled={formLoading}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Description (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Repaid wifi share"
                    value={manualDesc}
                    onChange={(e) => setManualDesc(e.target.value)}
                    disabled={formLoading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Type *</label>
                  <select 
                    className="form-input"
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value)}
                    disabled={formLoading}
                  >
                    <option value="settlement">Settlement</option>
                    <option value="deposit">Deposit</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px', marginTop: '10px' }}
                disabled={formLoading}
              >
                {formLoading ? 'Recording...' : 'Record Payment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
