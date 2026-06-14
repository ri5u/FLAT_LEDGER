import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, CheckCircle, FileText, Download, AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, Layers } from 'lucide-react';

export default function Import() {
  const [step, setStep] = useState(1); // 1: Upload, 2: Review, 3: Preview, 4: Success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Upload states
  const [csvText, setCsvText] = useState('');
  const [filename, setFilename] = useState('');
  
  // Batch details from upload
  const [batchId, setBatchId] = useState(null);
  const [classifierSource, setClassifierSource] = useState('');
  const [autoFixedCount, setAutoFixedCount] = useState(0);
  const [reviewItems, setReviewItems] = useState([]);
  const [autoFixedLogs, setAutoFixedLogs] = useState([]);

  // Step 2: Review states (User decisions)
  // key: itemId, value: chosenOptionId
  const [decisions, setDecisions] = useState({});

  // Step 3: Preview states
  const [previewData, setPreviewData] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('flat_ledger_token');
    const userStr = localStorage.getItem('flat_ledger_user');
    if (!token || !userStr) {
      navigate('/login');
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') {
      navigate('/dashboard'); // Only admins can import
    }
  }, [navigate]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setCsvText(evt.target.result);
    };
    reader.readAsText(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!csvText) {
      setError('Please select a CSV file or paste raw CSV text');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('flat_ledger_token');
      const res = await fetch('http://localhost:5000/api/imports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ csvText, filename: filename || 'pasted_data.csv' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload CSV');

      setBatchId(data.batchId);
      setClassifierSource(data.classifierSource);
      setAutoFixedCount(data.autoFixedCount);
      setReviewItems(data.reviewItems || []);
      
      // Load auto-fixed logs from database for Section 1 view
      const batchRes = await fetch(`http://localhost:5000/api/imports/${data.batchId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const batchData = await batchRes.json();
      if (batchRes.ok) {
        setAutoFixedLogs(batchData.autoFixedLogs || []);
      }

      // Pre-select recommended options
      const initialDecisions = {};
      data.reviewItems.forEach(item => {
        initialDecisions[item.id] = item.recommended_option_id;
      });
      setDecisions(initialDecisions);

      if (data.reviewItems.length === 0) {
        // Direct to preview if no review is required
        handleResolveSubmit(data.batchId, initialDecisions);
      } else {
        setStep(2);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionChange = (itemId, optionId) => {
    setDecisions(prev => ({
      ...prev,
      [itemId]: optionId
    }));
  };

  const handleResolveSubmit = async (targetBatchId = batchId, finalDecisions = decisions) => {
    setError('');
    setLoading(true);

    // Format decisions as an array
    const decisionsArray = Object.entries(finalDecisions).map(([itemId, chosenOptionId]) => ({
      itemId,
      chosenOptionId
    }));

    try {
      const token = localStorage.getItem('flat_ledger_token');
      const res = await fetch(`http://localhost:5000/api/imports/${targetBatchId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ decisions: decisionsArray })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate resolution preview');

      setPreviewData(data.preview);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommitSubmit = async () => {
    setError('');
    setLoading(true);

    const decisionsArray = Object.entries(decisions).map(([itemId, chosenOptionId]) => ({
      itemId,
      chosenOptionId
    }));

    try {
      const token = localStorage.getItem('flat_ledger_token');
      const res = await fetch(`http://localhost:5000/api/imports/${batchId}/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ decisions: decisionsArray })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to commit import batch');

      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', color: '#ffffff', fontWeight: '700' }}>Import Ledger Stream</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Upload house CSV logs, resolve data discrepancies via AI assistant, and commit clean entries.
        </p>
      </div>

      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'var(--danger-bg)',
          border: '1px solid rgba(244, 63, 94, 0.2)',
          color: 'var(--danger)',
          padding: '12px 16px',
          borderRadius: 'var(--border-radius-md)',
          fontSize: '13.5px',
          marginBottom: '24px'
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD CSV */}
      {step === 1 && (
        <div className="glass-card" style={{ maxWidth: '650px' }}>
          <form onSubmit={handleUploadSubmit}>
            <div style={{
              border: '2px dashed rgba(255, 255, 255, 0.15)',
              borderRadius: 'var(--border-radius-lg)',
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '24px',
              transition: 'var(--transition-fast)',
              position: 'relative'
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) {
                setFilename(file.name);
                const reader = new FileReader();
                reader.onload = (evt) => setCsvText(evt.target.result);
                reader.readAsText(file);
              }
            }}>
              <input 
                type="file" 
                accept=".csv"
                onChange={handleFileUpload}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer'
                }}
              />
              <UploadCloud size={48} style={{ color: 'var(--text-secondary)', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '16px', color: '#ffffff' }}>
                {filename ? filename : 'Select or drop expenses CSV file'}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                Supports columns: date, description, paid_by, amount, currency, split_type, split_with, split_details, notes
              </p>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Or paste raw CSV text:</label>
              <textarea 
                className="form-input" 
                rows="6"
                placeholder="date,description,paid_by,amount,..."
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '12.5px', background: 'rgba(0,0,0,0.3)', resize: 'vertical' }}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '12px' }}
              disabled={loading}
            >
              {loading ? 'Analyzing CSV Stream...' : 'Analyze Ledger Stream'}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: REVIEW CARDS (MEERA'S VIEW) */}
      {step === 2 && (
        <div>
          {/* Section 2: Review Cards */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} /> Section 2: Review Required Anomalies ({reviewItems.length})
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '800px' }}>
              {reviewItems.map((item, idx) => (
                <div key={idx} className="glass-card" style={{ borderLeft: '4px solid var(--warning)', background: 'rgba(15, 23, 42, 0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <span className="badge badge-warning" style={{ fontSize: '9px' }}>{item.type.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Row Refs: {item.row_refs.join(', ')}</span>
                  </div>
                  <h4 style={{ fontSize: '14.5px', color: '#ffffff', marginBottom: '14px', fontWeight: '500' }}>
                    {item.summary}
                  </h4>

                  {/* Options List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {item.options.map((opt) => {
                      const isSelected = decisions[item.id] === opt.id;
                      const isRecommended = item.recommended_option_id === opt.id;
                      
                      return (
                        <label 
                          key={opt.id} 
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 14px',
                            background: isSelected ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}`,
                            borderRadius: 'var(--border-radius-md)',
                            cursor: 'pointer',
                            fontSize: '13.5px',
                            transition: 'var(--transition-fast)'
                          }}
                        >
                          <input 
                            type="radio" 
                            name={item.id} 
                            checked={isSelected}
                            onChange={() => handleOptionChange(item.id, opt.id)}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <span style={{ flex: 1 }}>{opt.label}</span>
                          {isRecommended && (
                            <span className="badge badge-success" style={{ fontSize: '8px', background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                              Recommended
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 1: Auto-Fixed Log */}
          <div style={{ marginBottom: '36px', maxWidth: '800px' }}>
            <h3 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={18} style={{ color: 'var(--success)' }} /> Section 1: Automatically Resolved Entries ({autoFixedCount})
            </h3>
            
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Anomaly</th>
                    <th>Auto-Fix Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {autoFixedLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--text-secondary)' }}>{log.sourceRowNumber}</td>
                      <td><span className="badge badge-secondary" style={{ fontSize: '8px' }}>{log.anomalyId}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{log.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '14px' }}>
            <button onClick={() => setStep(1)} className="btn btn-secondary">
              <ArrowLeft size={16} /> Back to Upload
            </button>
            <button onClick={() => handleResolveSubmit()} className="btn btn-primary">
              View Preview <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PREVIEW & COMMIT */}
      {step === 3 && previewData && (
        <div style={{ maxWidth: '1000px' }}>
          <h3 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} style={{ color: 'var(--primary)' }} /> Step 3: Preview Ledger Entries before committing
          </h3>

          {/* Expenses Preview */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '14.5px', color: '#ffffff', marginBottom: '10px' }}>Cleaned Expenses to be Created ({previewData.expenses.length})</h4>
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Payer</th>
                    <th>Total (INR)</th>
                    <th>Calculated Roommate Splits</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.expenses.map((exp, idx) => (
                    <tr key={idx} style={{ opacity: exp.status === 'void' ? 0.5 : 1 }}>
                      <td>{exp.sourceRowNumber}</td>
                      <td>{new Date(exp.expenseDate).toLocaleDateString()}</td>
                      <td>
                        <span style={{ fontWeight: '500' }}>{exp.description}</span>
                        {exp.status === 'void' && <span className="badge badge-warning" style={{ fontSize: '8px', marginLeft: '6px' }}>Void</span>}
                      </td>
                      <td>{exp.isWriteOff ? <span style={{ color: 'var(--text-muted)' }}>Write-off</span> : exp.paidByUserName}</td>
                      <td style={{ fontWeight: '600' }}>₹{exp.amountInr}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {exp.splits.map((s, sIdx) => (
                            <span key={sIdx} className="badge badge-secondary" style={{ textTransform: 'none', fontSize: '9px' }}>
                              {s.name}: ₹{s.shareAmountInr}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transfers Preview */}
          {previewData.transfers.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <h4 style={{ fontSize: '14.5px', color: '#ffffff', marginBottom: '10px' }}>Settlements/Deposits to be Recorded ({previewData.transfers.length})</h4>
              <div className="table-container">
                <table className="custom-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Sender</th>
                      <th>Recipient</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.transfers.map((tx, idx) => (
                      <tr key={idx}>
                        <td>{tx.sourceRowNumber}</td>
                        <td>{new Date(tx.transferDate).toLocaleDateString()}</td>
                        <td>{tx.description}</td>
                        <td>{tx.fromUserName}</td>
                        <td>{tx.toUserName}</td>
                        <td style={{ fontWeight: '600', color: 'var(--success)' }}>₹{tx.amountInr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Guest users alert */}
          {previewData.guestUsersToCreate.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'var(--warning-bg)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              color: 'var(--warning)',
              padding: '12px 16px',
              borderRadius: 'var(--border-radius-md)',
              fontSize: '13.5px',
              marginBottom: '24px'
            }}>
              <AlertTriangle size={18} />
              <span>
                <strong>New guest users will be created:</strong> {previewData.guestUsersToCreate.join(', ')}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '14px' }}>
            <button onClick={() => setStep(2)} className="btn btn-secondary" disabled={loading}>
              <ArrowLeft size={16} /> Back to Review
            </button>
            <button onClick={handleCommitSubmit} className="btn btn-primary" disabled={loading}>
              {loading ? 'Committing Ledger...' : 'Confirm & Commit Import'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS & DOWNLOAD REPORTS */}
      {step === 4 && (
        <div className="glass-card" style={{ maxWidth: '600px', textAlign: 'center', padding: '40px 30px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--success-bg)',
            color: 'var(--success)',
            marginBottom: '18px'
          }}>
            <CheckCircle size={32} />
          </div>

          <h2 style={{ fontSize: '22px', color: '#ffffff', marginBottom: '8px' }}>Import Completed!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14.5px', marginBottom: '28px' }}>
            CSV data was parsed, resolved, and committed to database successfully. PDF/CSV audit trail reports are now available.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
            <a 
              href={`http://localhost:5000/api/imports/${batchId}/report?format=pdf&token=${encodeURIComponent(localStorage.getItem('flat_ledger_token') || '')}`}
              target="_blank" 
              rel="noreferrer"
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
            >
              <Download size={16} /> Download PDF Audit Report (Standard)
            </a>
            
            <a 
              href={`http://localhost:5000/api/imports/${batchId}/report?format=csv&token=${encodeURIComponent(localStorage.getItem('flat_ledger_token') || '')}`}
              download
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
            >
              <FileText size={16} /> Download CSV Import Logs
            </a>
          </div>

          <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ padding: '12px 24px' }}>
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
