import { z } from "zod";

// Postgres accepts any 8-4-4-4-12 hex string as a `uuid`, including the non-RFC
// version/variant nibbles used by our seed data (e.g. 22222222-0000-0000-0000-…).
// Zod v4's strict `.uuid()` rejects those, which broke form submissions that
// reference seeded rows. Use this lenient validator for all id fields instead.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const uuid = (message = "Invalid ID") => z.string().regex(UUID_RE, message);
