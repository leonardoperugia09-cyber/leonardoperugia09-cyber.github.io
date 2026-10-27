const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const NS = 'http://www.w3.org/2000/svg';

/* Hero: h(t) = e^{-t/τ220} cos(2π f220 t) + a e^{-t/τ221} cos(2π f221 t + φ)
   Frequencies and damping times match Overtone Explorer's default "truth" values.
   Pulling the signal sets its loudness; the detector noise stays fixed, so a louder
   ring lifts the second note back out of the noise. */
(() => {
  const c = document.getElementById('ring'), ctx = c.getContext('2d');
  const f1 = 271.4, t1 = 3.759e-3, f2 = 265.4, t2 = 1.238e-3, T = 0.011;
  const overtone = t => 0.9 * Math.exp(-t / t2) * Math.cos(2 * Math.PI * f2 * t + 0.6);
  const h = t => Math.exp(-t / t1) * Math.cos(2 * Math.PI * f1 * t) + overtone(t);

  // fixed noise draw so the picture doesn't flicker between redraws
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  const N = 400, noise = Array.from({ length: N }, gauss);

  let peak = 0;
  for (let i = 0; i <= 2000; i++) peak = Math.max(peak, Math.abs(h(i / 2000 * T)));

  let gain = 0.85, sign = 1, start = 0, raf = 0, noisy = false;
  const drag = { on: false, x: 0, y: 0, y0: 0 };

  function size() {
    const dpr = devicePixelRatio || 1, w = c.clientWidth, H = c.clientHeight;
    c.width = w * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, H];
  }
  const geom = H => { const plotH = H - 28; return { mid: plotH / 2, amp: plotH * 0.46 / peak }; };

  function trace(w, upto, f, k, amp, mid) {
    ctx.beginPath();
    for (let x = 0; x <= upto; x++) { const y = mid - k * f(x / w * T) * amp; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }

  function axes(w, H, mid) {
    ctx.strokeStyle = css('--rule'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
    ctx.fillStyle = css('--muted'); ctx.font = '500 12px "Public Sans", sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('time after the peak, about 11 ms →', w, H);
  }

  function frame(now) {
    if (!c.clientWidth) return;
    const [w, H] = size(), { mid, amp } = geom(H);
    const p = reduce ? 1 : clamp((now - start) / 1600, 0, 1);
    const ease = 1 - Math.pow(1 - p, 3), upto = w * ease, k = sign * gain;
    ctx.clearRect(0, 0, w, H);
    axes(w, H, mid);

    if (noisy) {
      ctx.fillStyle = css('--muted'); ctx.globalAlpha = 0.55;
      for (let i = 0; i < N * ease; i++) {
        const x = i / (N - 1) * w, t = i / (N - 1) * T;
        ctx.beginPath(); ctx.arc(x, mid - (k * h(t) + 0.3 * peak * noise[i]) * amp, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // the second note on its own: dashed, so it reads without relying on colour
    ctx.strokeStyle = css('--second'); ctx.lineWidth = 1.75; ctx.setLineDash([5, 4]);
    trace(w, upto, overtone, k, amp, mid);
    ctx.setLineDash([]);

    ctx.strokeStyle = css('--signal'); ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    trace(w, upto, h, k, amp, mid);

    // key in the top-right corner, where the signal has already gone quiet
    if (ease > 0.35) {
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '500 13px "Public Sans", sans-serif';
      const row = (text, y, color, dashed) => {
        const tw = ctx.measureText(text).width, x1 = w - tw - 12;
        ctx.lineWidth = 6; ctx.strokeStyle = css('--bg'); ctx.strokeText(text, w, y);
        ctx.fillStyle = color; ctx.fillText(text, w, y);
        ctx.strokeStyle = color; ctx.lineWidth = dashed ? 1.75 : 2.5; ctx.setLineDash(dashed ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(x1 - 28, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
      };
      row('the full signal', 10, css('--signal'), false);
      row('second note, already fading', 30, css('--second'), true);
    }
    if (p < 1) raf = requestAnimationFrame(frame);
  }

  // while pulling: the signal is held like a plucked string, pinned at both ends
  function drawPull() {
    const [w, H] = size(), { mid } = geom(H);
    const x = clamp(drag.x, 24, w - 24), y = clamp(drag.y, 8, H - 36);
    ctx.clearRect(0, 0, w, H);
    axes(w, H, mid);
    ctx.strokeStyle = css('--signal'); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, mid);
    ctx.quadraticCurveTo(x * 0.6, y, x, y);
    ctx.quadraticCurveTo(x + (w - x) * 0.4, y, w, mid);
    ctx.stroke();
    ctx.fillStyle = css('--signal'); ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = css('--ink'); ctx.font = '500 13px "Public Sans", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const loud = Math.round(clamp(Math.abs(y - mid) / (mid * 0.92), 0.15, 1) * 100);
    ctx.fillText(`let go to ring (loudness ${loud}%)`, clamp(x + 14, 0, w - 190), y + (y < mid ? -16 : 16));
  }

  const ring = () => { cancelAnimationFrame(raf); start = performance.now(); raf = requestAnimationFrame(frame); };
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => drag.on ? drawPull() : frame(start + 1e9)); };

  const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.addEventListener('pointerdown', e => {
    if (!e.isPrimary) return;
    [drag.x, drag.y] = pos(e); drag.y0 = drag.y;
    if (e.pointerType === 'touch') return;          // touch: a tap rings, vertical swipes keep scrolling
    drag.on = true; c.setPointerCapture(e.pointerId); c.classList.add('dragging');
    cancelAnimationFrame(raf); drawPull();
  });
  c.addEventListener('pointermove', e => {
    if (!drag.on) return;
    [drag.x, drag.y] = pos(e);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(drawPull);
  });
  const release = e => {
    if (e.pointerType === 'touch') { if (e.type === 'pointerup') ring(); return; }
    if (!drag.on) return;
    drag.on = false; c.classList.remove('dragging');
    const { mid } = geom(c.clientHeight), dy = drag.y - mid;
    if (Math.abs(drag.y - drag.y0) > 6 && e.type === 'pointerup') {
      gain = clamp(Math.abs(dy) / (mid * 0.92), 0.15, 1);
      sign = dy < 0 ? 1 : -1;
    }
    ring();
  };
  c.addEventListener('pointerup', release);
  c.addEventListener('pointercancel', release);

  const cap = document.getElementById('ring-cap'), capClean = cap.textContent;
  const btn = document.getElementById('noise');
  btn.addEventListener('click', () => {
    noisy = !noisy;
    btn.setAttribute('aria-pressed', noisy);
    btn.textContent = noisy ? 'Remove noise' : 'Add detector noise';
    cap.textContent = noisy
      ? 'The same signal with simulated detector noise (dots). The second note fades first, so the noise hides it first. A louder signal lifts it back out.'
      : capClean;
    redraw();
  });
  document.getElementById('restrike').addEventListener('click', ring);
  addEventListener('resize', redraw);
  document.fonts.ready.then(redraw);
  ring();
})();

/* Timeline: one decaying oscillation down the margin, a peak at each entry.
   As you scroll, the signal travels down it and lights each entry it reaches.
   Filled dot = finished, hollow ring = ongoing. */
(() => {
  const svg = document.getElementById('tlsvg'), list = document.getElementById('tl-list');
  let H = 0, dots = [], samples = [], clipRect, lit, head, halo, ticking = false;

  const el = (name, attrs, parent = svg) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.append(n); return n;
  };

  function build() {
    const items = [...list.children];
    const W = svg.clientWidth, mid = W / 2;
    H = svg.clientHeight;
    let d = `M${mid} 0`, prevY = 0;
    dots = [];
    items.forEach((li, i) => {
      const y = li.offsetTop + 11;
      const amp = (W / 2 - 8) * Math.exp(-i * 0.22), x = mid + (i % 2 ? -1 : 1) * amp;
      d += ` C${x} ${prevY + (y - prevY) * 0.35} ${x} ${y - (y - prevY) * 0.25} ${x} ${y}`;
      prevY = y;
      dots.push({ x, y, open: li.classList.contains('ongoing') });
    });
    d += ` C${mid} ${prevY + 40} ${mid} ${prevY + 40} ${mid} ${H}`;

    svg.replaceChildren();
    const defs = el('defs', {});
    const clip = el('clipPath', { id: 'tl-clip' }, defs);
    clipRect = el('rect', { x: -40, y: 0, width: W + 80, height: 0 }, clip);
    el('path', { d, fill: 'none', stroke: css('--rule'), 'stroke-width': 1.5 });
    lit = el('path', { d, fill: 'none', stroke: css('--second'), 'stroke-width': 1.75, 'clip-path': 'url(#tl-clip)' });
    dots.forEach(p => {
      p.node = el('circle', {
        cx: p.x, cy: p.y, r: p.open ? 5 : 6,
        fill: p.open ? css('--bg') : css('--signal'),
        stroke: p.open ? css('--second') : 'none', 'stroke-width': 2
      });
    });
    halo = el('circle', { r: 12, fill: css('--signal'), opacity: 0.18 });
    head = el('circle', { r: 4.5, fill: css('--signal') });

    // sample the path once so the travelling head can follow it
    const len = lit.getTotalLength();
    samples = [];
    for (let s = 0; s <= len; s += 3) samples.push(lit.getPointAtLength(s));
    update();
  }

  function update() {
    ticking = false;
    const top = svg.getBoundingClientRect().top;
    const y = reduce ? H : clamp(innerHeight * 0.6 - top, 0, H);
    clipRect.setAttribute('height', y);
    dots.forEach(p => p.node.setAttribute('opacity', p.y <= y + 2 ? 1 : 0.3));
    const show = !reduce && y > 0 && y < H;
    head.style.display = halo.style.display = show ? '' : 'none';
    if (show) {
      const pt = samples.find(s => s.y >= y) || samples[samples.length - 1];
      for (const n of [head, halo]) { n.setAttribute('cx', pt.x); n.setAttribute('cy', pt.y); }
    }
  }

  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  new ResizeObserver(build).observe(list);
  document.fonts.ready.then(build);
})();

/* Photo diary: a swipeable strip with previous/next buttons and a counter. */
document.querySelectorAll('[data-diary]').forEach(diary => {
  const track = diary.querySelector('.diary-track'), items = [...track.children];
  const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const nav = document.createElement('div');
  nav.className = 'diary-nav';
  nav.innerHTML = `<button type="button" aria-label="Previous photo">${icon('M15 18l-6-6 6-6')}</button>`
    + `<span class="diary-count"></span>`
    + `<button type="button" aria-label="Next photo">${icon('M9 18l6-6-6-6')}</button>`;
  diary.append(nav);
  const [prev, count, next] = nav.children;
  const step = () => items[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 12);
  const index = () => Math.round(track.scrollLeft / step());
  const sync = () => {
    const i = clamp(index(), 0, items.length - 1);
    count.textContent = `${i + 1} / ${items.length}`;
    prev.disabled = track.scrollLeft < 4;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };
  const go = dir => track.scrollBy({ left: dir * step(), behavior: reduce ? 'auto' : 'smooth' });
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  let t = false;
  track.addEventListener('scroll', () => { if (!t) { t = true; requestAnimationFrame(() => { t = false; sync(); }); } }, { passive: true });
  diary.closest('details')?.addEventListener('toggle', sync);
  sync();
});
