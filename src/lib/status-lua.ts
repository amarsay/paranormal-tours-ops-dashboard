/** Production key prefix (default). */
export const DEFAULT_KEY_PREFIX = "pt:agent-ops:";

/**
 * Key prefix for every Agent Ops key. Defaults to the production prefix;
 * PT_AGENT_OPS_KEY_PREFIX overrides it (tests point this at an isolated
 * prefix such as "pt:agent-ops:test:<runId>:"). Read at call time.
 */
export function keyPrefix(): string {
  const p = process.env.PT_AGENT_OPS_KEY_PREFIX?.trim();
  return p ? p : DEFAULT_KEY_PREFIX;
}

/** Existing production key (JSON string) — layout unchanged. */
export const DEFAULT_STATUS_REDIS_KEY = `${DEFAULT_KEY_PREFIX}status:v1`;

/** Status JSON key under the active prefix (prod: pt:agent-ops:status:v1). */
export function statusRedisKey(): string {
  return `${keyPrefix()}status:v1`;
}

/** Per-agent parked-blocker hash prefix (prod: pt:agent-ops:parked:v1:). */
export function parkedKeyPrefix(): string {
  return `${keyPrefix()}parked:v1:`;
}

export function parkedKey(agentId: string): string {
  return `${parkedKeyPrefix()}${agentId}`;
}

/**
 * One atomic Redis script for every status write (plain heartbeats and POSTs
 * with a blocker action). Lua runs as a single step inside Redis, so there is
 * no GET-then-SET window: concurrent heartbeats for different agents can't
 * clobber each other, and a blocker action + its heartbeat fields commit
 * together or not at all.
 *
 * The data layout is unchanged from production (backward compatible, no
 * migration): KEYS[1] is the existing JSON string
 *   pt:agent-ops:status:v1 = {"schemaVersion":1,"updatedAt":…,"agents":{…}}
 * which the script decodes with cjson, updates one agent in, and re-encodes.
 * Other agents' rows are carried over (values unchanged).
 *
 * NULLS: Upstash's Lua cjson decodes JSON null as a missing key and has no
 * usable cjson.null (it is nil there), so cjson.encode can't write null. The
 * blob is therefore written by a small encoder (encRow/encSnap) that emits
 * every known row field (ARGV[13], legacy order) and writes a missing one as
 * null; unknown keys follow, sorted. Agents keep their order in the stored
 * blob (new agents go last). Explicit nulls in a merge patch are lost by the
 * decode too, so their field names come separately in ARGV[14] and are
 * cleared (→ written as null). Parked blockers stay in the
 * per-agent hash KEYS[2] = pt:agent-ops:parked:v1:<agentId>, values
 * '{"since":"…",<rest>}' so the original `since` can be read without decoding.
 *
 * ARGV: 1 agentId · 2 rowMode none|full|merge · 3 row (full) or patch (merge)
 * JSON · 4 row to create when merging onto a missing row · 5 now (ISO) ·
 * 6 schemaVersion · 7 requireRow "1"|"0" · 8 op none|park|clear · 9 blocker id ·
 * 10 blocker JSON tail (no opening brace, no since) · 11 candidate since ·
 * 12 per-agent cap · 13 known row fields, comma-separated, in output order ·
 * 14 fields the merge patch sets to null, comma-separated ("" = none).
 *
 * Returns {"ok", rowJson|"", blockerStatus, blockerValue} or {errorCode}:
 * no_live_row · blocker_limit · corrupt_status · bad_payload.
 * Every check happens before the first write.
 */
export const STATUS_WRITE_LUA = `
local agentId, rowMode, rowJson, createJson = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local now, schema, requireRow = ARGV[5], tonumber(ARGV[6]), ARGV[7]
local op, bid, btail, bsince, cap = ARGV[8], ARGV[9], ARGV[10], ARGV[11], tonumber(ARGV[12])

local fields, known, nullKeys = {}, {}, {}
for f in string.gmatch(ARGV[13] or '', '[^,]+') do
  fields[#fields + 1] = f
  known[f] = true
end
for f in string.gmatch(ARGV[14] or '', '[^,]+') do nullKeys[#nullKeys + 1] = f end

local function sortedExtras(t, skip)
  local extra = {}
  for k, _ in pairs(t) do
    if not skip[k] then extra[#extra + 1] = k end
  end
  table.sort(extra, function(a, b) return tostring(a) < tostring(b) end)
  return extra
end

-- Row → JSON with every known field (missing → null), legacy order.
local function encRow(r)
  if type(r) ~= 'table' then return cjson.encode(r) end
  local parts = {}
  for _, f in ipairs(fields) do
    local v = r[f]
    if v == nil then
      parts[#parts + 1] = cjson.encode(f) .. ':null'
    else
      parts[#parts + 1] = cjson.encode(f) .. ':' .. cjson.encode(v)
    end
  end
  for _, k in ipairs(sortedExtras(r, known)) do
    parts[#parts + 1] = cjson.encode(tostring(k)) .. ':' .. cjson.encode(r[k])
  end
  return '{' .. table.concat(parts, ',') .. '}'
end

local rowIn, createIn
if rowMode == 'full' or rowMode == 'merge' then
  local ok, v = pcall(cjson.decode, rowJson)
  if not ok or type(v) ~= 'table' then return {'bad_payload'} end
  rowIn = v
end
if rowMode == 'merge' then
  local ok, v = pcall(cjson.decode, createJson)
  if not ok or type(v) ~= 'table' then return {'bad_payload'} end
  createIn = v
end

local raw = redis.call('GET', KEYS[1])
local snap
if raw then
  local ok, s = pcall(cjson.decode, raw)
  if not ok or type(s) ~= 'table' then return {'corrupt_status'} end
  snap = s
  if snap.agents == nil or snap.agents == cjson.null then snap.agents = {} end
  if type(snap.agents) ~= 'table' then return {'corrupt_status'} end
else
  snap = { schemaVersion = schema, updatedAt = now, agents = {} }
end

local existing = snap.agents[agentId]
if type(existing) ~= 'table' then existing = nil end
if requireRow == '1' and existing == nil then return {'no_live_row'} end

local bstatus, bval = '', ''
if op == 'park' then
  local cur = redis.call('HGET', KEYS[2], bid)
  local since = bsince
  if cur then
    local s = string.match(cur, '^{"since":"([^"]*)"')
    if s then since = s end
  elseif redis.call('HLEN', KEYS[2]) >= cap then
    return {'blocker_limit'}
  end
  bval = '{"since":"' .. since .. '",' .. btail
  redis.call('HSET', KEYS[2], bid, bval)
  if cur then bstatus = '2' else bstatus = '1' end
elseif op == 'clear' then
  bstatus = tostring(redis.call('HDEL', KEYS[2], bid))
end

local row = existing
if rowMode == 'full' then
  row = rowIn
elseif rowMode == 'merge' then
  if existing == nil then
    row = createIn
  else
    for k, v in pairs(rowIn) do existing[k] = v end
    for _, k in ipairs(nullKeys) do existing[k] = nil end
    row = existing
  end
end
if rowMode == 'full' or rowMode == 'merge' then
  snap.agents[agentId] = row
  snap.updatedAt = now
  if snap.schemaVersion == nil then snap.schemaVersion = schema end
  -- Agents in their current order in the stored blob; new ones last.
  local ids, pos = {}, {}
  for id, _ in pairs(snap.agents) do
    ids[#ids + 1] = id
    pos[id] = (raw and string.find(raw, cjson.encode(tostring(id)) .. ':{', 1, true)) or math.huge
  end
  table.sort(ids, function(a, b)
    if pos[a] ~= pos[b] then return pos[a] < pos[b] end
    return tostring(a) < tostring(b)
  end)
  local agentParts = {}
  for _, id in ipairs(ids) do
    agentParts[#agentParts + 1] = cjson.encode(tostring(id)) .. ':' .. encRow(snap.agents[id])
  end
  local top = {
    '"schemaVersion":' .. cjson.encode(snap.schemaVersion),
    '"updatedAt":' .. cjson.encode(snap.updatedAt),
    '"agents":{' .. table.concat(agentParts, ',') .. '}',
  }
  for _, k in ipairs(sortedExtras(snap, { schemaVersion = true, updatedAt = true, agents = true })) do
    top[#top + 1] = cjson.encode(tostring(k)) .. ':' .. cjson.encode(snap[k])
  end
  redis.call('SET', KEYS[1], '{' .. table.concat(top, ',') .. '}')
end

local rowOut = ''
if row ~= nil then rowOut = encRow(row) end
return {'ok', rowOut, bstatus, bval}
`;
