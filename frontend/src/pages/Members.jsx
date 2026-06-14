import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Edit2, X, Calendar, UserCheck, AlertCircle } from 'lucide-react';

export default function Members() {
  const [users, setUsers] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // Add Member Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addIsGuest, setAddIsGuest] = useState(false);
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Edit Membership Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingMembership, setEditingMembership] = useState(null);
  const [editJoinDate, setEditJoinDate] = useState('');
  const [editLeaveDate, setEditLeaveDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const navigate = useNavigate();

  const fetchMembersAndTimelines = async () => {
    try {
      const token = localStorage.getItem('flat_ledger_token');
      if (!token) return;

      const [usersRes, memRes] = await Promise.all([
        fetch('http://localhost:5000/api/users', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('http://localhost:5000/api/memberships', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const usersJson = await usersRes.json();
      const memJson = await memRes.json();

      if (!usersRes.ok) throw new Error(usersJson.error || 'Failed to load users');
      if (!memRes.ok) throw new Error(memJson.error || 'Failed to load memberships');

      setUsers(usersJson.users || []);
      setMemberships(memJson.memberships || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userStr = localStorage.getItem('flat_ledger_user');
    const token = localStorage.getItem('flat_ledger_token');

    if (!userStr || !token) {
      navigate('/login');
      return;
    }

    setCurrentUser(JSON.parse(userStr));
    fetchMembersAndTimelines();
  }, [navigate]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setAddError('');

    if (!addName) {
      setAddError('Name is required');
      return;
    }

    setAddLoading(true);

    try {
      const token = localStorage.getItem('flat_ledger_token');
      const res = await fetch('http://localhost:5000/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: addName,
          email: addEmail || undefined,
          isGuest: addIsGuest,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add user');

      setAddName('');
      setAddEmail('');
      setAddIsGuest(false);
      setIsAddOpen(false);
      fetchMembersAndTimelines();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleEditMembership = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditLoading(true);

    try {
      const token = localStorage.getItem('flat_ledger_token');
      const res = await fetch(`http://localhost:5000/api/memberships/${editingMembership.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          joinedDate: editJoinDate,
          leftDate: editLeaveDate || null,
          notes: editNotes || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update membership');

      setIsEditOpen(false);
      setEditingMembership(null);
      fetchMembersAndTimelines();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const openEditModal = (mem) => {
    setEditingMembership(mem);
    setEditJoinDate(new Date(mem.joinedDate).toISOString().slice(0, 10));
    setEditLeaveDate(mem.leftDate ? new Date(mem.leftDate).toISOString().slice(0, 10) : '');
    setEditNotes(mem.notes || '');
    setIsEditOpen(true);
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Loading flat roster...</div>;
  }

  if (error) {
    return <div style={{ color: 'var(--danger)', fontSize: '15px' }}>Error: {error}</div>;
  }

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', color: '#ffffff', fontWeight: '700' }}>Roster & Memberships</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Roster of flatmates and guests, and their active residency timelines.
          </p>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => setIsAddOpen(true)} 
            className="btn btn-primary"
          >
            <Plus size={16} /> Add Roommate
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', alignItems: 'start' }}>
        {/* Left Card: Users Roster */}
        <div className="glass-card">
          <h2 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '16px', fontWeight: '600' }}>
            Roommates & Guests
          </h2>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: '500' }}>{u.name}</td>
                    <td style={{ textTransform: 'capitalize', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {u.role}
                    </td>
                    <td>
                      <span className={`badge ${u.isGuest ? 'badge-secondary' : 'badge-success'}`} style={{ fontSize: '8.5px' }}>
                        {u.isGuest ? 'Guest' : 'Flatmate'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Card: Memberships Calendar */}
        <div className="glass-card">
          <h2 style={{ fontSize: '18px', color: '#ffffff', marginBottom: '16px', fontWeight: '600' }}>
            Residency Calendar
          </h2>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Roommate</th>
                  <th>Joined</th>
                  <th>Left</th>
                  {isAdmin && <th style={{ textAlign: 'right' }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: '500' }}>{m.user?.name}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {new Date(m.joinedDate).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {m.leftDate ? new Date(m.leftDate).toLocaleDateString() : <span style={{ color: 'var(--success)', fontSize: '12px', fontWeight: '500' }}>Active</span>}
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          onClick={() => openEditModal(m)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '13px'
                          }}
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Roommate Modal */}
      {isAddOpen && (
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
          zIndex: 999
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
              <h2 style={{ fontSize: '17px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} style={{ color: 'var(--primary)' }} /> Add Roommate / Guest
              </h2>
              <button 
                onClick={() => {
                  setIsAddOpen(false);
                  setAddError('');
                }} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {addError && (
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
                <AlertCircle size={16} />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Sam"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  disabled={addLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email (Optional)</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="e.g. sam@flat.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  disabled={addLoading}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={addIsGuest}
                    onChange={(e) => setAddIsGuest(e.target.checked)}
                    disabled={addLoading}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span>Treat as temporary guest (no logins, pure split placeholder)</span>
                </label>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px' }}
                disabled={addLoading}
              >
                {addLoading ? 'Adding...' : 'Add User'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Residency Modal */}
      {isEditOpen && (
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
          zIndex: 999
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
              <h2 style={{ fontSize: '17px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: 'var(--primary)' }} /> Edit residency timeline
              </h2>
              <button 
                onClick={() => {
                  setIsEditOpen(false);
                  setEditError('');
                }} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {editError && (
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
                <AlertCircle size={16} />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditMembership}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>EDITING RESIDENCY FOR:</div>
                <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--primary)' }}>
                  {editingMembership?.user?.name}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Join Date *</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={editJoinDate}
                  onChange={(e) => setEditJoinDate(e.target.value)}
                  disabled={editLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Leave Date (Optional)</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={editLeaveDate}
                  onChange={(e) => setEditLeaveDate(e.target.value)}
                  disabled={editLoading}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  Leave empty if roommate is currently living in the flat
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Notes</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Moved out to new flat"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  disabled={editLoading}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px' }}
                disabled={editLoading}
              >
                {editLoading ? 'Updating...' : 'Save Residency Details'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
