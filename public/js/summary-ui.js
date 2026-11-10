import { modal, toast } from './core.js';
import { summaryCanvas, downloadSummary, shareSummary } from './summary-image.js';
// Opens a preview of the branded match-summary picture with Download and Share buttons.
export async function openSummary(vm, url) {
  const m = modal(`<h3>Match summary picture</h3><div id="sp" style="background:#000;min-height:200px;display:grid;place-items:center"><span class="mono">Preparing...</span></div><p class="mono" style="margin:10px 0 0">1080 x 1350, ready for Facebook, Instagram, WhatsApp.</p><div class="row"><button class="btn ghost" data-x>Close</button><button class="btn ghost" data-dl>Download PNG</button><button class="btn" data-sh>Share</button></div>`);
  m.el.querySelector('[data-x]').onclick = m.close; const name = `${vm.teams.A.short}-vs-${vm.teams.B.short}-summary`.toLowerCase();
  try { const c = await summaryCanvas(vm); c.style.cssText = 'width:100%;max-height:56vh;object-fit:contain'; const sp = m.el.querySelector('#sp'); sp.innerHTML = ''; sp.append(c); } catch { toast('Could not draw the picture', true); }
  m.el.querySelector('[data-dl]').onclick = () => downloadSummary(vm, name).catch(() => toast('Download failed', true));
  m.el.querySelector('[data-sh]').onclick = async () => { try { const r = await shareSummary(vm, url, name); if (r === 'downloaded') toast('Sharing is not supported here, picture downloaded'); } catch (e) { if (e && e.name !== 'AbortError') toast('Share failed', true); } };
}
