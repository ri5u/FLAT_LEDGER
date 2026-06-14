import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, User, Search, Plus, X, Tag, Receipt, AlertCircle, Eye } from 'lucide-react';

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [payerFilter, setPayerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Manual Expense Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manualDesc, setManualDesc] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualPayer, setManualPayer] = useState('');
  const [manualSplitType, setManualSplitType] = useState('equal');
  const [manualParticipants, setManualParticipants] = useState([]);
  const [manualSplitDetails, setManualSplitDetails] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const navigate = useNavigate();

  const fetchExpenses = async () => {
    try {
      const token = localStorage.getItem('flat_ledger_token');
      if (!token) return;

      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.append('status', statusFilter);
      if (payerFilter) queryParams.append('payerId', payerFilter);
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);

      const res = await fetch(`http://localhost:5000/api/expenses?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to load expenses');
      setExpenses(data.expenses || []);
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
  }, [navigate]);

  useEffect(() => {
    fetchExpenses();
  }, [payerFilter, statusFilter, startDate, endDate]);

  const handleToggleParticipant = (userId) => {
    setManualParticipants(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleAddManualExpense = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!manualDesc || !manualAmount || !manualDate || !manualPayer || manualParticipants.length === 0) {
      setFormError('Please fill in all required fields and select at least one participant');
      return;
    }

    setFormLoading(true);

    try {
      const token = localStorage.getItem('flat_ledger_token');
      const res = await fetch('http://localhost:5000/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          description: manualDesc,
          amount: parseFloat(manualAmount),
          expenseDate: manualDate,
          paidById: parseInt(manualPayer, 10),
          splitType: manualSplitType,
          participantIds: manualParticipants,
          splitDetails: manualSplitDetails
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log manual expense');

      // Reset form
      setManualDesc('');
      setManualAmount('');
      setManualDate(new Date().toISOString().slice(0, 10));
      setManualPayer('');
      setManualSplitType('equal');
      setManualParticipants([]);
      setManualSplitDetails('');
      setIsModalOpen(false);
      
      // Reload list
      fetchExpenses();
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
          <h1 style={{ fontSize: '28px', color: '#ffffff', fontWeight: '700' }}>Committed Expenses</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            List of all committed expenses and audits in the shared flat ledger.
          </p>
        </div>
        
        <button 
          onClick={() => {
            setManualParticipants(users.filter(u => !u.isGuest).map(u => u.id)); // default select permanent flatmates
            setIsModalOpen(true);
          }} 
          className="btn btn-primary"
        >
          <Plus size={16} /> Log Expense
        </button>
      </div>

      {/* Filters Section */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', padding: '18px 24px' }}>
        <div style={{ flex: '1 1 180px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>PAID BY</label>
          <select 
            className="form-input" 
            value={payerFilter} 
            onChange={(e) => setPayerFilter(e.target.value)}
            style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px' }}
          >
            <option value="">All Roommates</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name} {u.isGuest ? '(Guest)' : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 120px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>STATUS</label>
          <select 
            className="form-input" 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px' }}
          >
            <option value="active">Active</option>
            <option value="void">Voided</option>
            <option value="excluded_duplicate">Duplicates</option>
            <option value="">All Statuses</option>
          </select>
        </div>

        <div style={{ flex: '1 1 150px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>FROM DATE</label>
          <input 
            type="date" 
            className="form-input" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px' }}
          />
        </div>

        <div style={{ flex: '1 1 150px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>TO DATE</label>
          <input 
            type="date" 
            className="form-input" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px' }}
          />
        </div>
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading expenses...</div>
      ) : error ? (
        <div style={{ color: 'var(--danger)' }}>Error: {error}</div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Paid By</th>
                <th>Split Type</th>
                <th>Total (INR)</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                    No expenses found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {new Date(exp.expenseDate).toLocaleDateString()}
                    </td>
                    <td style={{ fontWeight: '500' }}>{exp.description}</td>
                    <td>
                      {exp.paidBy ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <User size={13} style={{ color: 'var(--text-secondary)' }} />
                          {exp.payer?.name}
                          {exp.payer?.isGuest && <span className="badge badge-secondary" style={{ fontSize: '7.5px', padding: '1px 4px' }}>Guest</span>}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Write-off</span>
                      )}
                    </td>
                    <td style={{ textTransform: 'capitalize', fontSize: '13px' }}>{exp.splitType}</td>
                    <td style={{ fontWeight: '600' }}>₹{exp.amountInr}</td>
                    <td>
                      <span className={`badge ${exp.status === 'active' ? 'badge-success' : exp.status === 'void' ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                        {exp.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link 
                        to={`/expenses/${exp.id}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--primary)' }}
                      >
                        <Eye size={13} /> View Splits
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Expense Modal Overlay */}
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
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
              <h2 style={{ fontSize: '18px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Receipt size={20} style={{ color: 'var(--primary)' }} /> Log Manual Expense
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

            <form onSubmit={handleAddManualExpense}>
              <div className="form-group">
                <label className="form-label">Description *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Groceries DMart"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  disabled={formLoading}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Amount (INR) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    placeholder="e.g. 1500"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Paid By *</label>
                  <select 
                    className="form-input"
                    value={manualPayer}
                    onChange={(e) => setManualPayer(e.target.value)}
                    disabled={formLoading}
                  >
                    <option value="">Select Payer</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} {u.isGuest ? '(Guest)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Split Type *</label>
                  <select 
                    className="form-input"
                    value={manualSplitType}
                    onChange={(e) => setManualSplitType(e.target.value)}
                    disabled={formLoading}
                  >
                    <option value="equal">Equal Split</option>
                    <option value="percentage">Percentage Split</option>
                    <option value="share">Share Split</option>
                    <option value="unequal">Unequal Split</option>
                  </select>
                </div>
              </div>

              {/* Participants Selection */}
              <div className="form-group">
                <label className="form-label">Split Participants *</label>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '8px',
                  background: 'rgba(0,0,0,0.15)',
                  padding: '12px',
                  borderRadius: 'var(--border-radius-md)',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  {users.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={manualParticipants.includes(u.id)}
                        onChange={() => handleToggleParticipant(u.id)}
                        disabled={formLoading}
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      <span>{u.name} {u.isGuest ? 'G' : ''}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Split Details Input for Non-Equal Split Types */}
              {manualSplitType !== 'equal' && (
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Split details *</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {manualSplitType === 'percentage' && 'Format: Name1 30%; Name2 70%'}
                      {manualSplitType === 'share' && 'Format: Name1 1; Name2 2'}
                      {manualSplitType === 'unequal' && 'Format: Name1 500; Name2 1000'}
                    </span>
                  </label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder={
                      manualSplitType === 'percentage' ? 'e.g. Aisha 30%; Rohan 30%; Priya 40%' :
                      manualSplitType === 'share' ? 'e.g. Aisha 1; Rohan 2; Priya 1' :
                      'e.g. Aisha 500; Rohan 1000'
                    }
                    value={manualSplitDetails}
                    onChange={(e) => setManualSplitDetails(e.target.value)}
                    disabled={formLoading}
                  />
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px' }}
                disabled={formLoading}
              >
                {formLoading ? 'Logging...' : 'Save Transaction'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
