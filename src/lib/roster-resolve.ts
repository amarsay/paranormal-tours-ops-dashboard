import { loadRoster } from "./roster";
import { toSlug } from "./slug";

export interface RosterAgentRef {
  id: string;
  name: string;
  displayName: string;
  role: string;
  squad: string;
}

export function listRosterAgents(): RosterAgentRef[] {
  const roster = loadRoster();
  return roster.agents.map((a) => ({
    id: toSlug(a.name),
    name: a.name,
    displayName: a.displayName,
    role: a.role,
    squad: a.squad,
  }));
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Short label: "Spectre — Automation Engineer" → "Spectre" */
function shortName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const cut = trimmed.split(/\s+[—–-]\s+/)[0]?.trim() || trimmed;
  return cut.split(/\s+/)[0] || cut;
}

function matchByName(agents: RosterAgentRef[], nameRaw: string): RosterAgentRef | null {
  if (!nameRaw.trim()) return null;
  const lower = nameRaw.trim().toLowerCase();
  const short = shortName(nameRaw).toLowerCase();

  const exact = agents.find(
    (a) =>
      a.name.toLowerCase() === lower ||
      a.displayName.toLowerCase() === lower
  );
  if (exact) return exact;

  // Full title from Grok Bot → roster short name
  const byShort = agents.find(
    (a) =>
      a.name.toLowerCase() === short ||
      a.displayName.toLowerCase() === short ||
      lower.startsWith(a.name.toLowerCase() + " ") ||
      lower.startsWith(a.name.toLowerCase() + " —") ||
      lower.startsWith(a.name.toLowerCase() + " -")
  );
  if (byShort) return byShort;

  const slug = toSlug(short || nameRaw);
  return agents.find((a) => a.id === slug) ?? null;
}

/** Resolve by agentId (slug), then name/displayName (incl. full titles), then slug. */
export function resolveRosterAgent(input: {
  agentId?: string | null;
  agentName?: string | null;
  name?: string | null;
  slug?: string | null;
}): RosterAgentRef | null {
  const agents = listRosterAgents();
  const id = (input.agentId || "").trim().toLowerCase();
  if (id && !looksLikeUuid(id)) {
    const byId = agents.find((a) => a.id === id || a.id === toSlug(id));
    if (byId) return byId;
  }

  const nameRaw = (input.agentName || input.name || "").trim();
  const byName = matchByName(agents, nameRaw);
  if (byName) return byName;

  const slug = (input.slug || "").trim().toLowerCase() || toSlug(shortName(nameRaw) || nameRaw);
  if (slug) {
    const bySlug = agents.find((a) => a.id === slug);
    if (bySlug) return bySlug;
  }

  return null;
}
