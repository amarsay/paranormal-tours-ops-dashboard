/** Existing production key (JSON string) — layout unchanged. */
export const STATUS_REDIS_KEY = "pt:agent-ops:status:v1";
/** Per-agent parked-blocker hash prefix. */
export const PARKED_KEY_PREFIX = "pt:agent-ops:parked:v1:";

export function parkedKey(agentId: string): string {
  return `${PARKED_KEY_PREFIX}${agentId}`;
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
 * Other agents' rows are carried over untouched. Parked blockers stay in the
 * per-agent hash KEYS[2] = pt:agent-ops:parked:v1:<agentId>, values
 * '{"since":"…",<rest>}' so the original `since` can be read without decoding.
 *
 * ARGV: 1 agentId · 2 rowMode none|full|merge · 3 row (full) or patch (merge)
 * JSON · 4 row to create when merging onto a missing row · 5 now (ISO) ·
 * 6 schemaVersion · 7 requireRow "1"|"0" · 8 op none|park|clear · 9 blocker id ·
 * 10 blocker JSON tail (no opening brace, no since) · 11 candidate since ·
 * 12 per-agent cap.
 *
 * Returns {"ok", rowJson|"", blockerStatus, blockerValue} or {errorCode}:
 * no_live_row · blocker_limit · corrupt_status · bad_payload.
 * Every check happens before the first write.
 */
export const STATUS_WRITE_LUA = `
local agentId, rowMode, rowJson, createJson = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local now, schema, requireRow = ARGV[5], tonumber(ARGV[6]), ARGV[7]
local op, bid, btail, bsince, cap = ARGV[8], ARGV[9], ARGV[10], ARGV[11], tonumber(ARGV[12])

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
    row = existing
  end
end
if rowMode == 'full' or rowMode == 'merge' then
  snap.agents[agentId] = row
  snap.updatedAt = now
  if snap.schemaVersion == nil then snap.schemaVersion = schema end
  redis.call('SET', KEYS[1], cjson.encode(snap))
end

local rowOut = ''
if row ~= nil then rowOut = cjson.encode(row) end
return {'ok', rowOut, bstatus, bval}
`;
