import { panel, fx } from './themes.js';
// Mounts a scaled 1920x1080 overlay stage inside any container (used by homepage, theme gallery, dashboard).
export function mountStage(host, theme = 'arena') {
  host.classList.add('stagehost'); host.innerHTML = `<div class="stage ${theme}" style="--safe:36px"><div class="tick"></div><div class="gfx"></div><div class="fxl"></div></div>`;
  const st = host.firstElementChild, tick = st.querySelector('.tick'), gfx = st.querySelector('.gfx'), fxl = st.querySelector('.fxl');
  const fit = () => { st.style.transform = `scale(${host.clientWidth / 1920})`; }; new ResizeObserver(fit).observe(host); fit();
  let th = theme, shown = false, timer = 0;
  return {
    setTheme(t) { th = t; st.className = `stage ${t}`; shown = false; },
    ticker(vm) { tick.innerHTML = `<div>${panel(th, 'scoreboard', vm)}</div>`; if (!shown) { tick.firstElementChild.firstElementChild?.classList.add('in'); shown = true; } },
    graphic(key, vm, p) { gfx.innerHTML = key ? panel(th, key, vm, p || {}) : ''; gfx.firstElementChild?.classList.add('in'); },
    play(kind, payload, vm, ms = 3200) { clearTimeout(timer); fxl.innerHTML = fx(th, kind, payload, vm); const el = fxl.firstElementChild; if (el) el.style.setProperty('--d', ms + 'ms'); timer = setTimeout(() => { fxl.innerHTML = ''; }, ms); },
    clear() { gfx.innerHTML = ''; fxl.innerHTML = ''; },
  };
}
