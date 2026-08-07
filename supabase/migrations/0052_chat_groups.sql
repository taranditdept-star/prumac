-- ─────────────────────────────────────────────────────────────────────────────
-- 0052 — Chat groups + Chitsano bot participant.
-- Adds a single "PRUMAC Team" group everyone is auto-joined to, lets Chitsano
-- post into conversations (sender_kind='chitsano', no profile), and extends the
-- conversation list to include groups.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE app.conversations ADD COLUMN is_team boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX conversations_one_team ON app.conversations (is_team) WHERE is_team;

-- Chitsano posts have no profile; sender_id becomes nullable + a sender_kind.
ALTER TABLE app.messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE app.messages ADD COLUMN sender_kind text NOT NULL DEFAULT 'user'
  CHECK (sender_kind IN ('user', 'chitsano'));

-- Clients may only insert their OWN user messages; Chitsano posts go through the
-- service role (bypasses RLS) in a server action.
DROP POLICY IF EXISTS messages_insert ON app.messages;
CREATE POLICY messages_insert ON app.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND sender_kind = 'user' AND app.is_conversation_member(conversation_id));

-- Seed the single team group + enrol every active internal user (not external billing).
DO $$
DECLARE team_id uuid;
BEGIN
  SELECT id INTO team_id FROM app.conversations WHERE is_team;
  IF team_id IS NULL THEN
    INSERT INTO app.conversations (is_group, is_team, title) VALUES (true, true, 'PRUMAC Team') RETURNING id INTO team_id;
  END IF;
  INSERT INTO app.conversation_members (conversation_id, profile_id)
  SELECT team_id, p.id FROM app.profiles p WHERE p.is_active AND p.role <> 'subsidiary_billing'
  ON CONFLICT DO NOTHING;
END $$;

-- Make sure the caller is in the team group (lazily enrols new users on first open).
CREATE OR REPLACE FUNCTION app.fn_ensure_team_membership()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_catalog AS $$
DECLARE team_id uuid;
BEGIN
  SELECT id INTO team_id FROM app.conversations WHERE is_team;
  IF team_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO app.conversation_members (conversation_id, profile_id)
  VALUES (team_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN team_id;
END $$;

-- Human members of a conversation (for group sender names + @mention picker).
-- SECURITY DEFINER so drivers (who can't read other profiles) still get names.
CREATE OR REPLACE FUNCTION app.fn_conversation_members(p_conversation uuid)
RETURNS TABLE (id uuid, full_name text, role text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT p.id, p.full_name, p.role::text, p.avatar_url
  FROM app.conversation_members m
  JOIN app.profiles p ON p.id = m.profile_id
  WHERE m.conversation_id = p_conversation
    AND EXISTS (SELECT 1 FROM app.conversation_members me WHERE me.conversation_id = p_conversation AND me.profile_id = auth.uid())
  ORDER BY p.full_name;
$$;

-- Conversation list now includes groups (shown even with no messages yet).
-- Return type changes (adds is_group), so drop the 0051 version first.
DROP FUNCTION IF EXISTS app.fn_my_conversations();
CREATE OR REPLACE FUNCTION app.fn_my_conversations()
RETURNS TABLE (
  conversation_id uuid, is_group boolean, other_id uuid, other_name text, other_role text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread integer, updated_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT
    c.id, c.is_group,
    CASE WHEN c.is_group THEN NULL     ELSE op.id END,
    CASE WHEN c.is_group THEN c.title  ELSE op.full_name END,
    CASE WHEN c.is_group THEN 'group'  ELSE op.role::text END,
    CASE WHEN c.is_group THEN NULL     ELSE op.avatar_url END,
    lm.body, lm.created_at, lm.sender_id,
    (SELECT count(*)::int FROM app.messages x
       WHERE x.conversation_id = c.id AND x.created_at > me.last_read_at AND x.sender_id IS DISTINCT FROM auth.uid()),
    c.last_message_at
  FROM app.conversations c
  JOIN app.conversation_members me ON me.conversation_id = c.id AND me.profile_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT om.profile_id FROM app.conversation_members om
    WHERE om.conversation_id = c.id AND om.profile_id <> auth.uid() LIMIT 1
  ) other ON NOT c.is_group
  LEFT JOIN app.profiles op ON op.id = other.profile_id
  LEFT JOIN LATERAL (
    SELECT body, created_at, sender_id FROM app.messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE c.is_group OR EXISTS (SELECT 1 FROM app.messages mm WHERE mm.conversation_id = c.id)
  ORDER BY c.last_message_at DESC;
$$;

GRANT EXECUTE ON FUNCTION app.fn_ensure_team_membership()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_conversation_members(uuid)        TO authenticated, service_role;

COMMIT;
