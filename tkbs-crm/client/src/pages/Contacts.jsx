import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: '', company_id: '' });
  const [editing, setEditing] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('company');
  const debounceRef = useRef(null);

  const load = useCallback(async (q, sort) => {
    const params = {};
    if (q) params.q = q;
    if (sort) params.sort = sort;
    const data = await api.getContacts(params);
    setContacts(data.contacts);
  }, []);

  const loadCompanies = async () => {
    const data = await api.getCompanies();
    setCompanies(data.companies || []);
  };

  useEffect(() => {
    load(searchTerm, sortBy);
    loadCompanies();
  }, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load(value, sortBy);
    }, 300);
  };

  const handleSortChange = (e) => {
    const value = e.target.value;
    setSortBy(value);
    load(searchTerm, value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      role: form.role,
      company_id: form.company_id ? parseInt(form.company_id) : null,
    };
    if (editing) {
      await api.updateContact(editing, payload);
    } else {
      await api.createContact(payload);
    }
    setShowForm(false);
    setForm({ name: '', email: '', phone: '', role: '', company_id: '' });
    setEditing(null);
    load(searchTerm, sortBy);
  };

  const startEdit = (c) => {
    setForm({
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      role: c.role || '',
      company_id: c.company_id ? String(c.company_id) : '',
    });
    setEditing(c.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this contact?')) return;
    await api.deleteContact(id);
    load(searchTerm, sortBy);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Contacts</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={handleSearchChange}
            style={{
              padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4,
              fontSize: 14, width: 300,
            }}
          />
          <select
            value={sortBy}
            onChange={handleSortChange}
            style={{
              padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4,
              fontSize: 14, background: '#fff',
            }}
          >
            <option value="company">By company</option>
            <option value="name">By name</option>
            <option value="recent">Recent</option>
          </select>
        </div>
        <button
          onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '', role: '', company_id: '' }); setShowForm(true); }}
          style={{
            background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Contact
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1B2838', color: '#fff' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Email</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Phone</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Company</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Role</th>
              <th style={{ padding: '10px 16px', width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#64748B' }}>No contacts yet.</td></tr>
            )}
            {contacts.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#F7F8FA' }}>
                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.email || '—'}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.phone || '—'}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.company_name || '—'}</td>
                <td style={{ padding: '10px 16px', color: '#64748B' }}>{c.role || '—'}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <button onClick={() => startEdit(c)} style={{ background: 'none', border: 'none', color: '#00D4AA', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Edit</button>
                  <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', color: '#E6A817', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Contact' : 'New Contact'}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Company</label>
            <select
              value={form.company_id}
              onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
                background: '#fff', color: '#1B2838', cursor: 'pointer',
              }}
            >
              <option value="">— No Company —</option>
              {companies.map(co => (
                <option key={co.id} value={String(co.id)}>{co.name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Role</label>
            <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <button type="submit" style={{
            width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
            border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            {editing ? 'Save Changes' : 'Create Contact'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
