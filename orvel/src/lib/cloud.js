// ORVEL cloud: accounts and the server that runs the game.
//
// The URL and publishable key below are designed to be public: they identify
// the project, and every table is locked so only the server function can
// touch saves. No secret keys ever ship in the app.
//
// Set VITE_ORVEL_MODE=local to run fully offline against the in-browser
// engine (used for development and the tests).
import { createClient } from '@supabase/supabase-js'

export const CLOUD = (import.meta.env?.VITE_ORVEL_MODE || 'cloud') !== 'local'
const URL_ = import.meta.env?.VITE_ORVEL_SUPABASE_URL || 'https://yhiyehwsqaromgxfpkxh.supabase.co'
const KEY = import.meta.env?.VITE_ORVEL_SUPABASE_KEY || 'sb_publishable_1HmCHjXjSGCZVb5DaBKJWA_KGYh7Ows'
const FN = `${URL_}/functions/v1/orvel`

// Sessions persist in this browser, so closing the app keeps you signed in.
export const supabase = CLOUD
  ? createClient(URL_, KEY, { auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'orvel-auth' } })
  : null

export class CloudError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status }
}

async function rpc(op, args = []) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let res
  try {
    res = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token || KEY}` },
      body: JSON.stringify({ op, args }),
    })
  } catch {
    throw new CloudError("Can't reach the ORVEL server. Check your connection and try again.", 'offline')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new CloudError(body.error || 'Something went wrong', body.code || 'error', res.status)
  return body
}

// Same method names as the in-browser engine, so the UI doesn't care which
// one it talks to. Each action also returns a fresh snapshot, which the next
// snapshot() call uses instead of asking the server again.
let pendingSnap = null
export const cloudServer = new Proxy({}, {
  get(_, op) {
    if (op === 'then' || typeof op === 'symbol') return undefined
    if (op === 'adminLogout') return () => {}
    if (op === 'snapshot') return async () => {
      if (pendingSnap) { const s = pendingSnap; pendingSnap = null; return s }
      return (await rpc('snapshot')).result
    }
    return async (...args) => {
      const r = await rpc(op, args)
      if (r.snapshot) pendingSnap = r.snapshot
      return r.result
    }
  },
})

export const account = {
  async signup(username, email, password) {
    const r = await rpc('signup', [{ username, email, password }])
    await supabase.auth.setSession(r.session)
  },
  async login(identifier, password) {
    const r = await rpc('login', [{ identifier, password }])
    await supabase.auth.setSession(r.session)
  },
  forgot: (identifier) => rpc('forgot', [{ identifier, redirectTo: location.origin + location.pathname }]),
  async logout() { pendingSnap = null; await supabase.auth.signOut() },
  async changePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new CloudError(/should be different/i.test(error.message) ? 'Choose a password you have not used for this account' : error.message, 'password')
  },
  me: async () => (await rpc('account')).result,
  claimCreator: async () => (await rpc('claimAdmin')).result,
}

// Uploads go straight to storage; the bucket rules decide who may write.
export async function uploadImage(bucket, file, folder = '') {
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${folder ? folder + '/' : ''}${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new CloudError(/row-level|policy|unauthor/i.test(error.message) ? "You don't have permission to upload here" : error.message, 'upload')
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
export async function myUserId() { return (await supabase.auth.getUser()).data.user?.id }
