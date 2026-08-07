-- ─────────────────────────────────────────────────────────────────────────────
-- 0051 — In-app chat (WhatsApp-style 1:1 direct messages).
-- Conversations + members + messages, members-only RLS, realtime on messages,
-- and SECURITY DEFINER RPCs for the operations RLS can't express directly
-- (finding/creating a DM, listing my chats with the other party's name, and
-- listing contactable users — drivers can't read other profiles under RLS).
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE app.conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group         boolean NOT NULL DEFAULT false,
  title            text,
  created_by       uuid REFERENCES app.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.conversation_members (
  conversation_id  uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  profile_id       uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  last_read_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);
CREATE INDEX conversation_members_profile_idx ON app.conversation_members(profile_id);

CREATE TABLE app.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  sender_id        uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  body             text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON app.messages(conversation_id, created_at);

-- Membership test — SECURITY DEFINER so RLS policies on member/message tables
-- don't recurse into conversation_members' own RLS.
CREATE OR REPLACE FUNCTION app.is_conversation_member(p_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.conversation_members m
    WHERE m.conversation_id = p_conversation AND m.profile_id = auth.uid()
  );
$$;

ALTER TABLE app.conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.messages             ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_read ON app.conversations
  FOR SELECT TO authenticated USING (app.is_conversation_member(id));

CREATE POLICY members_read ON app.conversation_members
  FOR SELECT TO authenticated USING (app.is_conversation_member(conversation_id));

CREATE POLICY messages_read ON app.messages
  FOR SELECT TO authenticated USING (app.is_conversation_member(conversation_id));

CREATE POLICY messages_insert ON app.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND app.is_conversation_member(conversation_id));

-- Keep conversations ordered by recency.
CREATE OR REPLACE FUNCTION app.fn_touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_catalog AS $$
BEGIN
  UPDATE app.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON app.messages FOR EACH ROW EXECUTE FUNCTION app.fn_touch_conversation();

-- Find an existing 1:1 conversation between me and p_other, or create one.
CREATE OR REPLACE FUNCTION app.fn_get_or_create_dm(p_other uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_catalog AS $$
DECLARE me uuid := auth.uid(); conv uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_other IS NULL OR p_other = me THEN RAISE EXCEPTION 'invalid recipient'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app.profiles WHERE id = p_other AND is_active) THEN
    RAISE EXCEPTION 'recipient not found';
  END IF;

  SELECT c.id INTO conv
  FROM app.conversations c
  JOIN app.conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = me
  JOIN app.conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = p_other
  WHERE NOT c.is_group
    AND (SELECT count(*) FROM app.conversation_members m WHERE m.conversation_id = c.id) = 2
  LIMIT 1;

  IF conv IS NOT NULL THEN RETURN conv; END IF;

  INSERT INTO app.conversations (is_group, created_by) VALUES (false, me) RETURNING id INTO conv;
  INSERT INTO app.conversation_members (conversation_id, profile_id) VALUES (conv, me), (conv, p_other);
  RETURN conv;
END $$;

-- My conversations: the other participant, the last message, and my unread count.
CREATE OR REPLACE FUNCTION app.fn_my_conversations()
RETURNS TABLE (
  conversation_id uuid, other_id uuid, other_name text, other_role text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread integer, updated_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT
    c.id, op.id, op.full_name, op.role::text, op.avatar_url,
    lm.body, lm.created_at, lm.sender_id,
    (SELECT count(*)::int FROM app.messages x
       WHERE x.conversation_id = c.id AND x.created_at > me.last_read_at AND x.sender_id <> auth.uid()),
    c.last_message_at
  FROM app.conversations c
  JOIN app.conversation_members me ON me.conversation_id = c.id AND me.profile_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT om.profile_id FROM app.conversation_members om
    WHERE om.conversation_id = c.id AND om.profile_id <> auth.uid() LIMIT 1
  ) other ON true
  LEFT JOIN app.profiles op ON op.id = other.profile_id
  LEFT JOIN LATERAL (
    SELECT body, created_at, sender_id FROM app.messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE EXISTS (SELECT 1 FROM app.messages mm WHERE mm.conversation_id = c.id)
  ORDER BY c.last_message_at DESC;
$$;

-- Contactable users — active, not me, excluding external billing users. Bypasses
-- profiles RLS so a driver can start a chat with anyone on the team.
CREATE OR REPLACE FUNCTION app.fn_chat_contacts()
RETURNS TABLE (id uuid, full_name text, role text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT p.id, p.full_name, p.role::text, p.avatar_url
  FROM app.profiles p
  WHERE p.is_active AND p.id <> auth.uid() AND p.role <> 'subsidiary_billing'
  ORDER BY p.full_name;
$$;

CREATE OR REPLACE FUNCTION app.fn_mark_conversation_read(p_conversation uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  UPDATE app.conversation_members SET last_read_at = now()
  WHERE conversation_id = p_conversation AND profile_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION app.is_conversation_member(uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_get_or_create_dm(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_my_conversations()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_chat_contacts()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_mark_conversation_read(uuid)   TO authenticated, service_role;

-- Realtime on messages (guarded, idempotent).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='app' AND tablename='messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app.messages;
  END IF;
END $$;

COMMIT;
