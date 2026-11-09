export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function api(method, url, body) {
  let r; try { r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw Object.assign(new Error('You appear to be offline'), { offline: true }); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status, code: j.code }); return j;
}
let tt; export function toast(msg, err) { document.querySelector('.toast')?.remove(); const d = document.createElement('div'); d.className = 'toast' + (err ? ' err' : ''); d.textContent = msg; document.body.append(d); clearTimeout(tt); tt = setTimeout(() => d.remove(), err ? 4200 : 2200); }
export const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { prompt('Copy this link', t); } };
export const sk = (n = 3) => Array.from({ length: n }, () => '<div class="panel"><div class="skel line" style="width:50%"></div><div class="skel line"></div><div class="skel line" style="width:70%"></div></div>').join('');
export const ballChip = (s) => `<span class="ballchip ${s === 'W' ? 'w' : s === '4' ? 'f' : s === '6' ? 's' : /^(Wd|Nb)/.test(s) ? 'x' : s === '0' ? 'd' : ''}">${esc(s)}</span>`;

export function modal(html) {
  const v = document.createElement('div'); v.className = 'veil'; v.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`; document.body.append(v);
  const close = () => v.remove(); v.addEventListener('mousedown', (e) => { if (e.target === v) close(); }); return { el: v.firstElementChild, close };
}
export async function imgToData(file, max = 160) {
  const url = URL.createObjectURL(file); const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); return c.toDataURL('image/png');
}
// fields: [{k,label,type:text|textarea|select|color|number|date|datetime-local|image|multi|checkbox, options:[[v,l]]}]
export function formModal({ title, fields, values = {}, submit = 'Save', extra = '' }) {
  return new Promise((resolve) => {
    const f = (x) => { const v = values[x.k] ?? x.def ?? ''; const id = 'f_' + x.k;
      if (x.type === 'textarea') return `<label class="f"><span>${x.label}</span><textarea id="${id}" rows="3">${esc(v)}</textarea></label>`;
      if (x.type === 'select') return `<label class="f"><span>${x.label}</span><select id="${id}">${x.options.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(v) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
      if (x.type === 'image') return `<label class="f"><span>${x.label}</span><div style="display:flex;gap:12px;align-items:center"><img id="${id}_p" src="${esc(v)}" style="width:54px;height:54px;object-fit:cover;background:#000;${v ? '' : 'display:none'}"><input id="${id}" type="file" accept="image/*"></div></label>`;
      if (x.type === 'multi') return `<div class="f"><span class="mono">${x.label}</span><div class="pick" id="${id}">${x.options.map(([a, b]) => `<label><input type="checkbox" value="${esc(a)}" ${(values[x.k] || []).includes(a) ? 'checked' : ''}> ${esc(b)}</label>`).join('') || '<em class="mono">nothing to pick yet</em>'}</div></div>`;
      if (x.type === 'checkbox') return `<label class="sw"><input id="${id}" type="checkbox" ${(values[x.k] ?? x.def) ? 'checked' : ''}> ${x.label}</label>`;
      return `<label class="f"><span>${x.label}</span><input id="${id}" type="${x.type || 'text'}" value="${esc(v)}" ${x.req ? 'required' : ''} ${x.type === 'number' ? 'step="any"' : ''}></label>`; };
    const m = modal(`<h3>${title}</h3><form class="grid" id="mf">${fields.map(f).join('')}${extra}<div class="row"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn">${submit}</button></div></form>`);
    const imgs = {}; fields.filter(x => x.type === 'image').forEach(x => $('#f_' + x.k, m.el).addEventListener('change', async (e) => { const fl = e.target.files[0]; if (!fl) return; try { imgs[x.k] = await imgToData(fl); const p = $('#f_' + x.k + '_p', m.el); p.src = imgs[x.k]; p.style.display = ''; } catch { toast('Could not read that image', true); } }));
    $('[data-x]', m.el).onclick = () => { m.close(); resolve(null); };
    $('#mf', m.el).onsubmit = (e) => { e.preventDefault(); const out = {};
      for (const x of fields) { const el = $('#f_' + x.k, m.el);
        if (x.type === 'image') { if (imgs[x.k]) out[x.k] = imgs[x.k]; } else if (x.type === 'multi') out[x.k] = $$('input:checked', el).map(i => i.value);
        else if (x.type === 'checkbox') out[x.k] = el.checked; else out[x.k] = x.type === 'number' ? Number(el.value) : el.value; }
      m.close(); resolve(out); };
    const first = $('input:not([type=file]):not([type=checkbox]),select', m.el); first?.focus();
  });
}
export const confirmBox = (msg) => new Promise((res) => { const m = modal(`<h3>Are you sure?</h3><p>${esc(msg)}</p><div class="row"><button class="btn ghost" data-n>Cancel</button><button class="btn red" data-y>Yes, continue</button></div>`); $('[data-n]', m.el).onclick = () => { m.close(); res(false); }; $('[data-y]', m.el).onclick = () => { m.close(); res(true); }; });
export const fmtDate = (s) => { try { return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: s.includes('T') ? 'short' : undefined }); } catch { return s || ''; } };
export const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v10H3z"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h10v5a5 5 0 01-10 0zM5 5H3v2a3 3 0 003 3M19 5h2v2a3 3 0 01-3 3M12 14v4M8 21h8"/></svg>',
  bat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3l7 7-9 9-3-1-3 3-3-3 3-3-1-3z"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="12"/><path d="M8 21h8M12 17v4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
};

export async function download(url, name) {
  const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error('Export failed');
  const u = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
// Offline command queue (IndexedDB). One record per match: array of { command_id, cmd }.
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('crease', 1); r.onupgradeneeded = () => r.result.createObjectStore('queue'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function qGet(id) { try { const d = await idb(); return await new Promise((res) => { const q = d.transaction('queue').objectStore('queue').get(id); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch { return []; } }
export async function qPut(id, arr) { try { const d = await idb(); await new Promise((res) => { const tx = d.transaction('queue', 'readwrite'); tx.objectStore('queue').put(arr, id); tx.oncomplete = res; tx.onerror = res; }); } catch {} }
