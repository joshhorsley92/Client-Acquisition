-- TKBS CRM — 0009 Client contacts table
-- =========================================================================
-- Adds first-class multi-contact support per client, plus an optional
-- engagement-level override for which contact is "the contact" on a given
-- engagement.
--
-- Pragmatic dual-source: the legacy primary_contact_name / email / phone /
-- role / preferred_contact columns on clients are kept as a denormalized
-- cache of the primary contact. The API layer keeps them in sync with the
-- client_contacts row marked is_primary=true. This avoids touching every
-- read site (ai-prompts, scrub-website, import-clients, OverviewTab) right
-- now while still giving us a real contacts list.
--
-- additional_contacts JSONB is migrated into proper rows here; we keep the
-- column on the table for now so any out-of-band data isn't lost, but new
-- code shouldn't read or write it.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE crm.client_contacts (
  id                BIGSERIAL    PRIMARY KEY,
  client_id         BIGINT       NOT NULL REFERENCES crm.clients(id) ON DELETE CASCADE,
  name              TEXT         NOT NULL,
  email             TEXT,
  phone             TEXT,
  role              TEXT,
  preferred_contact TEXT         CHECK (preferred_contact IN ('email','phone','text','linkedin')),
  is_primary        BOOLEAN      NOT NULL DEFAULT false,
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One primary contact per client (partial UNIQUE).
CREATE UNIQUE INDEX idx_client_contacts_one_primary
  ON crm.client_contacts(client_id) WHERE is_primary;
CREATE INDEX idx_client_contacts_client_id
  ON crm.client_contacts(client_id);
CREATE INDEX idx_client_contacts_created_at
  ON crm.client_contacts(client_id, created_at);

CREATE TRIGGER client_contacts_touch BEFORE UPDATE ON crm.client_contacts
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — same shape as the rest of crm.* domain tables.
-- ---------------------------------------------------------------------------
ALTER TABLE crm.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contacts_member_full_access ON crm.client_contacts
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Backfill — primary contact from clients row
-- ---------------------------------------------------------------------------
INSERT INTO crm.client_contacts (
  client_id, name, email, phone, role, preferred_contact, is_primary, created_at
)
SELECT
  c.id,
  COALESCE(c.primary_contact_name, c.email, c.name) AS name,
  c.email,
  c.phone,
  c.role,
  c.preferred_contact,
  true AS is_primary,
  c.created_at
FROM crm.clients c
WHERE c.primary_contact_name IS NOT NULL
   OR c.email IS NOT NULL
   OR c.phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Backfill — additional_contacts JSONB array entries become non-primary rows
-- ---------------------------------------------------------------------------
-- Tolerates entries with various key spellings (name | full_name, email,
-- phone, role | title). Skips anything without a name AND no email AND no
-- phone — those are useless empty entries.
INSERT INTO crm.client_contacts (
  client_id, name, email, phone, role, is_primary, created_at
)
SELECT
  c.id,
  COALESCE(NULLIF(TRIM(elem->>'name'), ''),
           NULLIF(TRIM(elem->>'full_name'), ''),
           NULLIF(TRIM(elem->>'email'), ''),
           'Contact') AS name,
  NULLIF(TRIM(elem->>'email'), ''),
  NULLIF(TRIM(elem->>'phone'), ''),
  COALESCE(NULLIF(TRIM(elem->>'role'), ''), NULLIF(TRIM(elem->>'title'), '')),
  false AS is_primary,
  c.created_at
FROM crm.clients c,
     jsonb_array_elements(COALESCE(c.additional_contacts, '[]'::jsonb)) AS elem
WHERE jsonb_typeof(c.additional_contacts) = 'array'
  AND (
    NULLIF(TRIM(elem->>'name'), '')      IS NOT NULL OR
    NULLIF(TRIM(elem->>'full_name'), '') IS NOT NULL OR
    NULLIF(TRIM(elem->>'email'), '')     IS NOT NULL OR
    NULLIF(TRIM(elem->>'phone'), '')     IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- Engagement contact override
-- ---------------------------------------------------------------------------
-- NULL means "use the client's primary" — that's the default for every
-- existing engagement. ON DELETE SET NULL so deleting a contact doesn't
-- cascade-destroy the engagement.
ALTER TABLE crm.engagements
  ADD COLUMN contact_id BIGINT REFERENCES crm.client_contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_engagements_contact_id ON crm.engagements(contact_id);
