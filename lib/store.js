// Key-value store with optimistic versioning. Supabase REST in production, JSON file locally.
import fs from 'node:fs';
export class Conflict extends Error { constructor() { super('CONFLICT'); this.code = 'CONFLICT'; } }

const clean = (s) => String(s || '').trim().replace(/^['"]|['"]$/g, '').trim();
function supabaseStore(rawUrl, rawKey) {
  const key = clean(rawKey), url = clean(rawUrl).replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`; // legacy JWT keys; new sb_secret_ keys use the apikey header only
  const base = `${url}/rest/v1/kv`;
  const fail = async (op, r) => new Error(`DB_${op} ${r.status} ${(await r.text().catch(() => '')).slice(0, 180)}`);
  const enc = encodeURIComponent;
  return {
    kind: 'supabase',
    async get(k) {
      const r = await fetch(`${base}?key=eq.${enc(k)}&select=value,version`, { headers: h });
      if (!r.ok) throw await fail('READ', r);
      const a = await r.json(); return a[0] || null;
    },
    async put(k, value, ver) {
      if (ver == null) {
        const r = await fetch(base, { method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ key: k, value, version: 1 }) });
        if (r.status === 409) throw new Conflict();
        if (!r.ok) throw await fail('WRITE', r);
        return { version: 1 };
      }
      const r = await fetch(`${base}?key=eq.${enc(k)}&version=eq.${ver}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ value, version: ver + 1, updated_at: new Date().toISOString() }) });
      if (!r.ok) throw await fail('WRITE', r);
      const a = await r.json(); if (!a.length) throw new Conflict(); return { version: ver + 1 };
    },
    async list(prefix) {
      const r = await fetch(`${base}?key=like.${enc(prefix)}*&select=key,value,version&limit=500`, { headers: h });
      if (!r.ok) throw await fail('LIST', r); return r.json();
    },
    async del(k) { await fetch(`${base}?key=eq.${enc(k)}`, { method: 'DELETE', headers: h }); },
  };
}

function fileStore(path) {
  let db = {};
  try { if (path) db = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
  const save = () => { if (path) { fs.mkdirSync('.data', { recursive: true }); fs.writeFileSync(path, JSON.stringify(db)); } };
  return {
    kind: path ? 'file' : 'memory',
    async get(k) { return db[k] ? structuredClone(db[k]) : null; },
    async put(k, value, ver) {
      const cur = db[k];
      if (ver == null ? !!cur : !cur || cur.version !== ver) throw new Conflict();
      db[k] = { value: structuredClone(value), version: (cur?.version ?? 0) + 1 }; save(); return { version: db[k].version };
    },
    async list(prefix) { return Object.entries(db).filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, ...structuredClone(v) })); },
    async del(k) { delete db[k]; save(); },
  };
}

let singleton;
export function getStore() {
  if (singleton) return singleton;
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) singleton = supabaseStore(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  else singleton = fileStore(process.env.VERCEL ? null : '.data/db.json');
  return singleton;
}
export function useMemoryStore() { singleton = fileStore(null); return singleton; }
export const storeWarning = () => (!process.env.SUPABASE_URL && process.env.VERCEL)
  ? 'SUPABASE_URL and SUPABASE_SERVICE_KEY are not set. Data is kept in memory and will be lost. See README step 2.' : null;
