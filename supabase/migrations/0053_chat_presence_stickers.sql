-- ─────────────────────────────────────────────────────────────────────────────
-- 0053 — Presence (online / last seen) + stickers.
-- fn_heartbeat keeps profiles.last_seen_at fresh; the chat RPCs now return each
-- person's last_seen so the UI can show online dots. messages.kind adds stickers.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE app.messages ADD COLUMN kind text NOT NULL DEFAULT 'text'
  CHECK (kind IN ('text', 'sticker'));

-- Presence heartbeat — the client pings this while the app is open.
CREATE OR REPLACE FUNCTION app.fn_heartbeat()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  UPDATE app.profiles SET last_seen_at = now() WHERE id = auth.uid();
$$;

-- Contacts now carry last_seen.
DROP FUNCTION IF EXISTS app.fn_chat_contacts();
CREATE OR REPLACE FUNCTION app.fn_chat_contacts()
RETURNS TABLE (id uuid, full_name text, role text, avatar_url text, last_seen timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT p.id, p.full_name, p.role::text, p.avatar_url, p.last_seen_at
  FROM app.profiles p
  WHERE p.is_active AND p.id <> auth.uid() AND p.role <> 'subsidiary_billing'
  ORDER BY p.full_name;
$$;

-- Conversation members now carry last_seen.
DROP FUNCTION IF EXISTS app.fn_conversation_members(uuid);
CREATE OR REPLACE FUNCTION app.fn_conversation_members(p_conversation uuid)
RETURNS TABLE (id uuid, full_name text, role text, avatar_url text, last_seen timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT p.id, p.full_name, p.role::text, p.avatar_url, p.last_seen_at
  FROM app.conversation_members m
  JOIN app.profiles p ON p.id = m.profile_id
  WHERE m.conversation_id = p_conversation
    AND EXISTS (SELECT 1 FROM app.conversation_members me WHERE me.conversation_id = p_conversation AND me.profile_id = auth.uid())
  ORDER BY p.full_name;
$$;

-- Conversation list now carries the other party's last_seen (1:1 only).
DROP FUNCTION IF EXISTS app.fn_my_conversations();
CREATE OR REPLACE FUNCTION app.fn_my_conversations()
RETURNS TABLE (
  conversation_id uuid, is_group boolean, other_id uuid, other_name text, other_role text, other_avatar text,
  other_last_seen timestamptz, last_body text, last_at timestamptz, last_sender uuid, unread integer, updated_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT
    c.id, c.is_group,
    CASE WHEN c.is_group THEN NULL     ELSE op.id END,
    CASE WHEN c.is_group THEN c.title  ELSE op.full_name END,
    CASE WHEN c.is_group THEN 'group'  ELSE op.role::text END,
    CASE WHEN c.is_group THEN NULL     ELSE op.avatar_url END,
    CASE WHEN c.is_group THEN NULL     ELSE op.last_seen_at END,
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

GRANT EXECUTE ON FUNCTION app.fn_heartbeat()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_chat_contacts()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_conversation_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_my_conversations()         TO authenticated, service_role;

COMMIT;
