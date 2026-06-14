import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, Tag, Info, User, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ExpenseDetail() {
  const { id } = useParams();
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('flat_ledger_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchExpenseDetails = async () => {
      try {
        setLoading(true);
        const res = await fetch(`http://localhost:5000/api/expenses/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load expense details');
        }

        setExpense(data.expense);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchExpenseDetails();
  }, [id, navigate]);

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Loading expense details...</div>;
  }

  if (error) {
    return (
      <div style={{ color: 'var(--danger)', fontSize: '15px' }}>
        <Link to="/expenses" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', marginBottom: '16px' }}>
          <ArrowLeft size={16} /> Back to Expenses
        </Link>
        <div>Error: {error}</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            color: 'var(--text-secondary)', 
            fontSize: '14px', 
            marginBottom: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={16} /> Go Back
        </button>
        
        <h1 style={{ fontSize: '28px', color: '#ffffff', fontWeight: '700' }}>
          {expense.description}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
          <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)' }}>
            ₹{expense.amountInr}
          </span>
          {expense.originalAmount && (
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              ({expense.originalCurrency} {expense.originalAmount} @ {expense.exchangeRate}/USD)
            </span>
          )}
          <span className={`badge ${expense.status === 'active' ? 'badge-success' : expense.status === 'void' ? 'badge-warning' : 'badge-danger'}`}>
            {expense.status}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', alignItems: 'start' }}>
        {/* Left Side: General Info Card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <h3 style={{ fontSize: '16px', color: '#ffffff', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            Expense Details
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calendar size={18} style={{ color: 'var(--text-secondary)' }} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>DATE OF EXPENSE</div>
              <div style={{ fontSize: '14.5px', color: '#ffffff' }}>
                {new Date(expense.expenseDate).toLocaleDateString(undefined, { dateStyle: 'long' })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <User size={18} style={{ color: 'var(--text-secondary)' }} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>PAID BY</div>
              <div style={{ fontSize: '14.5px', color: '#ffffff', fontWeight: '500' }}>
                {expense.isWriteOff ? 'Write-off (No Payer)' : expense.payer?.name}
                {expense.payer?.isGuest && <span className="badge badge-secondary" style={{ fontSize: '8px', marginLeft: '6px' }}>Guest</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Tag size={18} style={{ color: 'var(--text-secondary)' }} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>SPLIT METHOD</div>
              <div style={{ fontSize: '14.5px', color: '#ffffff', textTransform: 'capitalize' }}>
                {expense.splitType}
              </div>
            </div>
          </div>

          {expense.importBatch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Info size={18} style={{ color: 'var(--text-secondary)' }} />
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>IMPORT ORIGIN</div>
                <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
                  File: {expense.importBatch.originalFilename} (Batch {expense.importBatch.id})
                </div>
              </div>
            </div>
          )}

          {expense.notes && (
            <div style={{ 
              marginTop: '10px',
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 'var(--border-radius-md)',
              borderLeft: '3px solid var(--primary)',
              fontSize: '13.5px',
              color: 'var(--text-secondary)'
            }}>
              <span style={{ fontWeight: '600', color: '#ffffff', display: 'block', marginBottom: '4px', fontSize: '12px' }}>NOTES:</span>
              {expense.notes}
            </div>
          )}
        </div>

        {/* Right Side: Split Breakdown Card */}
        <div className="glass-card">
          <h3 style={{ fontSize: '16px', color: '#ffffff', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', marginBottom: '18px' }}>
            Split Breakdown (Rohan's View)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {expense.splits.map((split, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.15)',
                  borderRadius: 'var(--border-radius-md)',
                  border: '1px solid rgba(255,255,255,0.03)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: split.userId === expense.paidBy ? 'var(--primary-glow)' : 'rgba(255,255,255,0.05)',
                    color: split.userId === expense.paidBy ? 'var(--primary)' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}>
                    {split.user.name.substring(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: '500', fontSize: '14px' }}>{split.user.name}</span>
                      {split.user.isGuest && <span className="badge badge-secondary" style={{ fontSize: '8px' }}>Guest</span>}
                      {split.userId === expense.paidBy && <span className="badge badge-success" style={{ fontSize: '8px', background: 'var(--primary-glow)', color: 'var(--primary)' }}>Payer</span>}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Share criteria: {split.shareInput || 'equal'}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: '700', color: '#ffffff' }}>
                    ₹{split.shareAmountInr}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                    {split.userId === expense.paidBy 
                      ? 'Credited to total' 
                      : `Owes ${expense.payer?.name || 'group'}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
