// Supabase Realtime (Broadcast) listener over a plain WebSocket. Pings carry only a version number.
// If anything fails the caller keeps its normal polling, so this can only make things faster.
export function subscribe(rt, onPing) {
  if (!rt || !rt.url || !rt.key || !rt.ch || typeof WebSocket === 'undefined') return { connected: () => false, close() {} };
  let ws, hb, closed = false, ok = false, retry = 0; const topic = 'realtime:' + rt.ch;
  function open() {
    try { ws = new WebSocket(rt.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(rt.key) + '&vsn=1.0.0'); } catch { return; }
    ws.onopen = () => {
      ws.send(JSON.stringify({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [], private: false } }, ref: '1' }));
      hb = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' })); }, 25000);
    };
    ws.onmessage = (m) => { let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d.topic === topic && d.event === 'phx_reply') { ok = d.payload && d.payload.status === 'ok'; if (ok) retry = 0; }
      else if (d.topic === topic && d.event === 'broadcast') { onPing(d.payload && d.payload.payload); }
      else if (d.topic === topic && (d.event === 'phx_error' || d.event === 'phx_close')) ok = false; };
    ws.onclose = () => { ok = false; clearInterval(hb); if (!closed) setTimeout(open, Math.min(15000, 1000 * 2 ** retry++)); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  open(); return { connected: () => ok, close() { closed = true; clearInterval(hb); try { ws.close(); } catch {} } };
}
