import { panel, fx, slotOf } from './themes.js';
// Mounts a scaled 1920x1080 overlay stage inside any container (homepage, theme gallery, dashboard).
export function mountStage(host, theme = 'arena') {
  host.classList.add('stagehost'); host.innerHTML = `<div class="stage ${theme}" style="--safe:36px"><div class="tick"></div><div class="lowerslot"></div><div class="gfx"></div><div class="fxl"></div></div>`;
  const st = host.firstElementChild, tick = st.querySelector('.tick'), low = st.querySelector('.lowerslot'), gfx = st.querySelector('.gfx'), fxl = st.querySelector('.fxl');
  const fit = () => { st.style.transform = `scale(${host.clientWidth / 1920})`; }; new ResizeObserver(fit).observe(host); fit();
  let th = theme, shown = false, timer = 0, last = null;
  const bar = (vm, inl) => { vm.custom ||= {}; tick.innerHTML = `<div>${panel(th, 'scoreboard', vm, { inl, swap: inl ? true : false })}</div>`; if (!shown) { tick.firstElementChild.firstElementChild?.classList.add('in'); shown = true; } };
  return {
    setTheme(t) { th = t; st.className = `stage ${t}`; shown = false; },
    ticker(vm) { last = vm; bar(vm, ''); },
    // Routes a graphic to its slot, like the real overlay does: scoreboard section, lower third, or full panel.
    graphic(key, vm, p) { last = vm || last; vm = last; low.innerHTML = ''; gfx.innerHTML = '';
      const slot = key ? slotOf(key) : ''; bar(vm, slot === 'inline' ? key : '');
      const el = slot === 'lower' ? low : slot === 'full' ? gfx : null; if (el) { el.innerHTML = panel(th, key, vm, p || {}); el.firstElementChild?.classList.add('in'); } },
    play(kind, payload, vm, ms = 3200) { clearTimeout(timer); fxl.innerHTML = fx(th, kind, payload, vm); const el = fxl.firstElementChild; if (el) el.style.setProperty('--d', ms + 'ms'); timer = setTimeout(() => { fxl.innerHTML = ''; }, ms); },
    clear() { low.innerHTML = ''; gfx.innerHTML = ''; fxl.innerHTML = ''; },
  };
}
