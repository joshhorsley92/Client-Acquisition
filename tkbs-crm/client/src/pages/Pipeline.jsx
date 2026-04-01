import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { api } from '../lib/api';
import DealCard from '../components/DealCard';
import Modal from '../components/Modal';

const STAGES = [
  { id: 'lead', label: 'Lead' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'discovery_call', label: 'Discovery Call' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'follow_up', label: 'Follow-Up' },
  { id: 'closed_won', label: 'Closed Won' },
];

export default function Pipeline() {
  const [deals, setDeals] = useState([]);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDeal, setNewDeal] = useState({
    company_id: '',
    company_name: '',
    contact_id: '',
    contact_name: '',
    source: 'referral',
    estimated_value: '',
  });
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDeals = async () => {
    try {
      const data = await api.getDeals();
      setDeals(data.deals);
    } catch (err) {
      console.error('Failed to load deals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDeals(); }, []);

  useEffect(() => {
    if (showNewDeal) {
      api.getCompanies().then((d) => setCompanies(d.companies || [])).catch(() => {});
      api.getContacts().then((d) => setContacts(d.contacts || [])).catch(() => {});
    }
  }, [showNewDeal]);

  const dealsByStage = (stageId) => deals.filter((d) => d.stage === stageId);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const dealId = parseInt(result.draggableId);
    const newStage = result.destination.droppableId;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === newStage) return;

    if (newStage === 'closed_lost') {
      const reason = prompt('Lost reason (price, timing, competitor, ghosted, other):');
      if (!reason) return;
      await api.updateDeal(dealId, { stage: newStage, lost_reason: reason });
    } else {
      await api.updateDeal(dealId, { stage: newStage });
    }
    loadDeals();
  };

  const handleCreateDeal = async (e) => {
    e.preventDefault();
    try {
      // Resolve company: use existing or create new
      let companyId = newDeal.company_id ? parseInt(newDeal.company_id) : null;
      if (!companyId && newDeal.company_name) {
        const compData = await api.createCompany({ name: newDeal.company_name });
        companyId = compData.company.id;
      }
      // Resolve contact: use existing or create new
      let contactId = newDeal.contact_id ? parseInt(newDeal.contact_id) : null;
      if (!contactId && newDeal.contact_name) {
        const ctData = await api.createContact({ name: newDeal.contact_name, company_id: companyId });
        contactId = ctData.contact.id;
      }
      // Create deal
      await api.createDeal({
        company_id: companyId,
        contact_id: contactId,
        source: newDeal.source,
        estimated_value: parseFloat(newDeal.estimated_value) || 0,
      });
      setShowNewDeal(false);
      setNewDeal({ company_id: '', company_name: '', contact_id: '', contact_name: '', source: 'referral', estimated_value: '' });
      loadDeals();
    } catch (err) {
      alert('Failed to create deal: ' + err.message);
    }
  };

  if (loading) return <div style={{ padding: 40 }}>Loading pipeline...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Pipeline</h1>
        <button
          onClick={() => setShowNewDeal(true)}
          style={{
            background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Deal
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
          {STAGES.map((stage) => (
            <Droppable droppableId={stage.id} key={stage.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    minWidth: 240, width: 240, background: snapshot.isDraggingOver ? '#E6FAF5' : '#F7F8FA',
                    borderRadius: 8, padding: 12, flexShrink: 0,
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #00D4AA',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1B2838' }}>{stage.label}</span>
                    <span style={{
                      fontSize: 11, color: '#64748B', background: '#E2E6EB',
                      borderRadius: 10, padding: '2px 8px',
                    }}>
                      {dealsByStage(stage.id).length}
                    </span>
                  </div>

                  {dealsByStage(stage.id).map((deal, index) => (
                    <Draggable draggableId={String(deal.id)} index={index} key={deal.id}>
                      {(provided) => <DealCard deal={deal} provided={provided} />}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <Modal open={showNewDeal} onClose={() => setShowNewDeal(false)} title="New Deal">
        <form onSubmit={handleCreateDeal}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Company</label>
            <select
              value={newDeal.company_id}
              onChange={(e) => setNewDeal({ ...newDeal, company_id: e.target.value, contact_id: '', contact_name: '' })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14, background: '#fff' }}
            >
              <option value="">+ Add New Company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {newDeal.company_id === '' && (
              <input
                placeholder="Company name"
                value={newDeal.company_name}
                onChange={(e) => setNewDeal({ ...newDeal, company_name: e.target.value })}
                required
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #00D4AA', borderRadius: 4, fontSize: 14, marginTop: 6, boxSizing: 'border-box' }}
              />
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Contact</label>
            {(() => {
              const filteredContacts = newDeal.company_id
                ? contacts.filter((c) => c.company_id === parseInt(newDeal.company_id))
                : contacts;
              return (
                <>
                  <select
                    value={newDeal.contact_id}
                    onChange={(e) => setNewDeal({ ...newDeal, contact_id: e.target.value, contact_name: '' })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14, background: '#fff' }}
                  >
                    <option value="">+ Add New Contact</option>
                    {filteredContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {newDeal.contact_id === '' && (
                    <input
                      placeholder="Contact name (optional)"
                      value={newDeal.contact_name}
                      onChange={(e) => setNewDeal({ ...newDeal, contact_name: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #00D4AA', borderRadius: 4, fontSize: 14, marginTop: 6, boxSizing: 'border-box' }}
                    />
                  )}
                </>
              );
            })()}
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Source</label>
              <select
                value={newDeal.source} onChange={(e) => setNewDeal({ ...newDeal, source: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}
              >
                <option value="referral">Referral</option>
                <option value="cold">Cold</option>
                <option value="web">Web</option>
                <option value="content">Content</option>
                <option value="paid_ads">Paid Ads</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Est. Value ($/mo)</label>
              <input
                type="number" value={newDeal.estimated_value}
                onChange={(e) => setNewDeal({ ...newDeal, estimated_value: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}
              />
            </div>
          </div>
          <button
            type="submit"
            style={{
              width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
              border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Create Deal
          </button>
        </form>
      </Modal>
    </div>
  );
}
