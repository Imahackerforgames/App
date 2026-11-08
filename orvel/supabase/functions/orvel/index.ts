// ORVEL server: accounts and every game action.
//
// The rules engine (server/game.js) is the same file the app used to run in
// the browser. Here it runs on the server against the player's saved row and
// the shared catalog, inside one database transaction with both rows locked,
// so nothing a player does in their browser can change coins, cards or odds.
//
// Deploy: see scripts/deploy-function.sh (copies the engine next to this file).
// verify_jwt is off because sign-up and log-in happen before there is a token;
// every game action verifies the caller's token itself.

import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import postgres from 'npm:postgres@3.4.5'
import { createGameServer, freshState, GameError } from './server/game.js'
import { seedCards } from './lib/seedArt.js'

const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 })
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anonClient = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
class Http extends Error { constructor(public status: number, msg: string, public code = 'error') { super(msg) } }

// What each kind of caller may do. Anything else is refused.
const PLAYER_OPS = new Set([
  'snapshot', 'setPlayerName', 'claimDaily', 'buyPackWithCash', 'quoteSale', 'sellCard', 'quoteDuplicates', 'sellDuplicates',
  'rivals', 'rivalProfile', 'battleQuote', 'startBattle', 'activeBattle', 'playCard', 'useTactic', 'endTurn', 'forfeit',
  'buyCosmetic', 'saveCustom', 'upgradeCustom', 'deleteCustom',
])
const ADMIN_OPS = new Set([
  'adminSnapshot', 'upsertCard', 'setPublished', 'deleteCard', 'removeSampleCards', 'saveRarities', 'upsertPack', 'deletePack',
  'upsertCollection', 'deleteCollection', 'saveRanks', 'saveSettings', 'adminGrantCash', 'adminResetPlayer', 'exportCatalog', 'importCatalog',
  // the simulated checkout mints signed payment events, so only the creator may use it
  'createOrder', '_simulateProviderEvent', 'handlePaymentWebhook', 'cancelOrder',
])
const PUBLIC_READS = new Set(['snapshot', 'rivals', 'rivalProfile'])

const WORLD_KEYS = ['version', 'settings', 'rarities', 'collections', 'packs', 'ranks', 'xpRules', 'cards', 'nextCode', 'seeded', 'paymentSecret']
const SAVE_KEYS = ['players', 'transactions', 'orders', 'battles', 'rivals']
const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

function freshWorld() {
  const s: any = freshState()
  const w = pick(s, WORLD_KEYS)
  return w
}
function freshSave(world: any, username: string) {
  const s: any = freshState()
  s.settings = world.settings
  const save = pick(s, SAVE_KEYS)
  save.players.local.name = username
  save.players.local.cash = world.settings?.startingCash ?? save.players.local.cash
  return save
}

// Runs one engine call against the shared catalog and one player's save.
async function runGame(userId: string | null, username: string, op: string, args: unknown[], isAdmin: boolean, persist: boolean) {
  return await sql.begin(async (tx: any) => {
    let [w] = await tx`select data from orvel_world where id = 1 for update`
    let world = w?.data
    if (!world) {
      world = freshWorld()
      await tx`insert into orvel_world (id, data) values (1, ${tx.json(world)})`
    }
    let save: any = null
    if (userId) {
      const [sv] = await tx`select data from orvel_saves where user_id = ${userId} for update`
      save = sv?.data
    }
    if (!save) save = freshSave(world, username)

    let state: any = { ...world, ...save, admin: { pinHash: null, salt: null } }
    let written: any = null
    const storage = { get: async () => state, set: async (_k: string, v: any) => { written = v } }
    const g: any = createGameServer(storage, { adminCheck: () => isAdmin })

    // first run ever: put the sample cards in the catalog
    if (!world.seeded && !world.cards?.length) {
      await g._seedIfEmpty(seedCards())
      state = written
    }
    if (op === 'deleteCard') {
      const cardId = String(args[1])
      const [{ n }] = await tx`select count(*)::int as n from orvel_saves where coalesce((data->'players'->'local'->'inventory'->${cardId}->>'count')::int, 0) > 0`
      if (n > 0) throw new Http(409, 'Players own copies of this card. Unpublish it instead so nobody loses a card they hold.', 'owned')
    }
    const result = await g[op](...args)
    const next = written || state
    if (persist && userId) {
      const newWorld = pick(next, WORLD_KEYS)
      if (JSON.stringify(newWorld) !== JSON.stringify(world)) await tx`update orvel_world set data = ${tx.json(newWorld)}, updated_at = now() where id = 1`
      await tx`insert into orvel_saves (user_id, data) values (${userId}, ${tx.json(pick(next, SAVE_KEYS))})
               on conflict (user_id) do update set data = excluded.data, updated_at = now()`
    }
    return result
  })
}

// ───────────────────────── accounts ─────────────────────────

const USERNAME = /^[A-Za-z0-9_.]{3,16}$/
async function emailFor(identifier: string) {
  const id = identifier.trim()
  if (id.includes('@')) return id.toLowerCase()
  const [p] = await sql`select user_id from orvel_profiles where lower(username) = lower(${id})`
  if (!p) return null
  const { data } = await admin.auth.admin.getUserById(p.user_id)
  return data.user?.email ?? null
}
async function throttle(key: string) {
  const [row] = await sql`select fails, locked_until from orvel_login_attempts where key = ${key}`
  if (row?.locked_until && new Date(row.locked_until) > new Date()) throw new Http(429, 'Too many tries. Wait 15 minutes and try again.', 'locked')
}
async function noteFail(key: string) {
  await sql`insert into orvel_login_attempts (key, fails) values (${key}, 1)
            on conflict (key) do update set fails = orvel_login_attempts.fails + 1,
            locked_until = case when orvel_login_attempts.fails + 1 >= 8 then now() + interval '15 minutes' else null end`
}
async function clearFails(key: string) { await sql`delete from orvel_login_attempts where key = ${key}` }

async function signup({ username, email, password }: any) {
  username = String(username || '').trim(); email = String(email || '').trim().toLowerCase(); password = String(password || '')
  if (!USERNAME.test(username)) throw new Http(400, 'Usernames are 3–16 letters, numbers, dots or underscores')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Http(400, 'Enter a valid email address — it is how you reset your password')
  if (password.length < 8) throw new Http(400, 'Passwords need at least 8 characters')
  const [taken] = await sql`select 1 from orvel_profiles where lower(username) = lower(${username})`
  if (taken) throw new Http(409, 'That username is taken')
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } })
  if (error || !data.user) {
    const msg = /already|registered|exists/i.test(error?.message || '') ? 'An account with that email already exists — log in instead' : (error?.message || 'Could not create the account')
    throw new Http(409, msg)
  }
  try {
    await sql`insert into orvel_profiles (user_id, username) values (${data.user.id}, ${username})`
  } catch {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Http(409, 'That username is taken')
  }
  const s = await anonClient().auth.signInWithPassword({ email, password })
  if (s.error || !s.data.session) throw new Http(500, 'Account created — please log in')
  return { session: { access_token: s.data.session.access_token, refresh_token: s.data.session.refresh_token } }
}

async function login({ identifier, password }: any) {
  const key = 'login:' + String(identifier || '').trim().toLowerCase()
  await throttle(key)
  const email = await emailFor(String(identifier || ''))
  const bad = new Http(401, 'Wrong username or password')
  if (!email) { await noteFail(key); throw bad }
  const s = await anonClient().auth.signInWithPassword({ email, password: String(password || '') })
  if (s.error || !s.data.session) { await noteFail(key); throw bad }
  await clearFails(key)
  return { session: { access_token: s.data.session.access_token, refresh_token: s.data.session.refresh_token } }
}

async function forgot({ identifier, redirectTo }: any) {
  const key = 'forgot:' + String(identifier || '').trim().toLowerCase()
  await throttle(key)
  await noteFail(key) // counts toward the same 8-per-15-minutes limit
  const email = await emailFor(String(identifier || ''))
  if (email) await anonClient().auth.resetPasswordForEmail(email, redirectTo ? { redirectTo: String(redirectTo) } : undefined)
  // same answer either way, so this can't be used to find out who has an account
  return { ok: true }
}

async function caller(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token || token === ANON) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  const [p] = await sql`select username from orvel_profiles where user_id = ${data.user.id}`
  const [a] = await sql`select 1 from orvel_admins where user_id = ${data.user.id}`
  return { id: data.user.id, email: data.user.email, username: p?.username || 'Collector', isAdmin: !!a }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const { op, args = [] } = await req.json()
    if (op === 'signup') return json(await signup(args[0] || {}))
    if (op === 'login') return json(await login(args[0] || {}))
    if (op === 'forgot') return json(await forgot(args[0] || {}))

    const user = await caller(req)
    if (op === 'claimAdmin') {
      if (!user) throw new Http(401, 'Log in first')
      const [{ n }] = await sql`select count(*)::int as n from orvel_admins`
      if (n > 0) throw new Http(403, 'This game already has a creator account')
      await sql`insert into orvel_admins (user_id) values (${user.id})`
      return json({ result: { ok: true } })
    }
    if (op === 'account') {
      if (!user) return json({ result: null })
      const [{ n }] = await sql`select count(*)::int as n from orvel_admins`
      return json({ result: { username: user.username, email: user.email, isAdmin: user.isAdmin, adminClaimable: n === 0 } })
    }

    if (!user) {
      if (!PUBLIC_READS.has(op)) throw new Http(401, 'Sign up or log in to play', 'auth')
      // a guest can look around: the catalog, shop and rivals, with an empty save
      const result = await runGame(null, 'Guest', op, args, false, false)
      return json({ result })
    }
    const allowed = PLAYER_OPS.has(op) || (ADMIN_OPS.has(op) && user.isAdmin)
    if (!allowed) throw new Http(403, ADMIN_OPS.has(op) ? 'Only the creator account can do that' : 'Unknown action')
    const result = await runGame(user.id, user.username, op, args, user.isAdmin, true)
    const snapshot = op === 'snapshot' ? null : await runGame(user.id, user.username, 'snapshot', [], user.isAdmin, false)
    return json({ result, snapshot })
  } catch (e: any) {
    if (e instanceof Http) return json({ error: e.message, code: e.code }, e.status)
    if (e instanceof GameError) return json({ error: e.message, code: e.code }, 400)
    console.error(e)
    return json({ error: 'Something went wrong on the server. Try again.' }, 500)
  }
})
