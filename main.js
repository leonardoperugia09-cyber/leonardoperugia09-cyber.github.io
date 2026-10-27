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
    dots.forEach(p => {
      const on = p.y <= y + 2;
      p.node.setAttribute('opacity', on ? 1 : 0.3);
      // the signal arriving at an entry: one ripple, only when it is reached while scrolling
      if (on && p.was === false && !reduce) {
        const r = el('circle', { cx: p.x, cy: p.y, r: 6, class: p.open ? 'ripple open' : 'ripple' });
        r.addEventListener('animationend', () => r.remove());
      }
      p.was = on;
    });
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

/* Hero: a low-poly sheet of spacetime with a black hole sitting in a well.
   Height = the well, −k/√(r² + s²), plus ripples that travel outward and fade like a ringdown.
   The sheet leans toward the pointer; drag the black hole and let go to send a wave. */
const spacetime = (() => {
  const c = document.getElementById('spacetime');
  if (!c) return { wave() {} };
  const ctx = c.getContext('2d');
  const NX = 30, NY = 20, SX = 1.7, SY = 1.1, P0 = 0.98, D = 3.4, YAW0 = -0.18;
  const bh = { x: 0.25, y: 0.05 };
  const L = (() => { const v = [-0.45, -0.55, 0.7], n = Math.hypot(...v); return v.map(a => a / n); })();
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const BASE = [26, 42, 92];
  let DEEP, WAVE, waves = [], yaw = YAW0, pitch = 0, tyaw = YAW0, tpitch = 0;
  let raf = 0, visible = true, drag = null, W = 0, H = 0, scale = 1;

  function field(x, y, now) {
    const dx = x - bh.x, dy = y - bh.y;
    let w = 0;
    for (const v of waves) {
      const t = (now - v.t0) / 1000, front = Math.hypot(x - v.x, y - v.y) - 0.85 * t;
      w += v.A * Math.exp(-t / 1.2) * Math.exp(-front * front / 0.06) * Math.cos(10 * front);
    }
    return [-0.2 / Math.sqrt(dx * dx + dy * dy + 0.028) + 0.11 + w, w];
  }
  function project(x, y, z) {
    const p = P0 + pitch, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    const depth = y1 * Math.cos(p) - z * Math.sin(p), up = y1 * Math.sin(p) + z * Math.cos(p);
    const s = D / (D + depth) * scale;
    return [W / 2 + x1 * s, H * 0.46 - up * s, depth];
  }

  function draw(now) {
    const pts = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const x = (i / NX * 2 - 1) * SX, y = (j / NY * 2 - 1) * SY, [z, w] = field(x, y, now);
      pts.push({ x, y, z, w, p: project(x, y, z) });
    }
    const at = (i, j) => pts[j * (NX + 1) + i], tris = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = at(i, j), b = at(i + 1, j), q = at(i + 1, j + 1), d = at(i, j + 1);
      tris.push([a, b, q], [a, q, d]);
    }
    for (const t of tris) t.depth = (t[0].p[2] + t[1].p[2] + t[2].p[2]) / 3;
    tris.sort((m, n) => n.depth - m.depth);

    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 0.6; ctx.lineJoin = 'round';
    for (const t of tris) {
      const [a, b, d] = t;
      // flat shading from the face normal gives the faceted, low-poly look
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = d.x - a.x, vy = d.y - a.y, vz = d.z - a.z;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const lit = 0.38 + 0.8 * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / (Math.hypot(nx, ny, nz) || 1));
      const deep = clamp(-(a.z + b.z + d.z) / 3 / 0.9, 0, 1), crest = clamp(Math.abs(a.w + b.w + d.w) / 3 * 5, 0, 1);
      const col = BASE.map((v, k) => {
        v += (DEEP[k] - v) * deep * deep;
        v += (WAVE[k] - v) * crest * 0.85;
        return Math.round(clamp(v * lit, 0, 255));
      });
      ctx.globalAlpha = 1 - clamp((t.depth - 0.35) / 1.3, 0, 0.75);   // the far side fades into the night
      ctx.beginPath(); ctx.moveTo(a.p[0], a.p[1]); ctx.lineTo(b.p[0], b.p[1]); ctx.lineTo(d.p[0], d.p[1]); ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle = `rgb(${col})`; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(190, 205, 235, 0.09)'; ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the black hole: a dark disc with its glowing photon ring
    const [bx, by] = project(bh.x, bh.y, field(bh.x, bh.y, now)[0]);
    const r = clamp(scale * 0.075, 8, 18);
    ctx.save();
    ctx.shadowColor = 'rgba(253, 224, 71, 0.85)'; ctx.shadowBlur = 22;
    ctx.strokeStyle = css('--signal'); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(bx, by, r * 1.7, r * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#03060F'; ctx.beginPath(); ctx.arc(bx, by - r * 0.15, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = css('--signal'); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(bx, by, r * 1.7, r * 0.75, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
    return [bx, by];
  }

  function frame(now) {
    raf = 0;
    if (reduce) { draw(now); return; }
    yaw += (tyaw - yaw) * 0.12; pitch += (tpitch - pitch) * 0.12;
    waves = waves.filter(v => now - v.t0 < 5000);
    draw(now);
    const settling = Math.abs(tyaw - yaw) > 0.0008 || Math.abs(tpitch - pitch) > 0.0008;
    if (visible && (waves.length || settling || drag)) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function size() {
    W = c.clientWidth; H = c.clientHeight;
    const dpr = devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(W / (2 * SX) * 0.86, H / 1.75);
    DEEP = rgb(css('--accent')); WAVE = rgb(css('--second'));
    kick();
  }

  function wave(A) {
    const now = performance.now();
    if (reduce) { waves = [{ x: bh.x, y: bh.y, t0: now - 500, A }]; draw(now); return; }
    waves.push({ x: bh.x, y: bh.y, t0: now, A }); kick();
  }

  const hero = c.closest('.hero');
  hero.addEventListener('pointermove', e => {
    if (reduce || e.pointerType === 'touch') return;
    const r = c.getBoundingClientRect();
    tyaw = YAW0 + clamp((e.clientX - (r.left + r.width / 2)) / r.width, -1, 1) * 0.35;
    tpitch = -clamp((e.clientY - (r.top + r.height / 2)) / r.height, -1, 1) * 0.12;
    kick();
  });
  hero.addEventListener('pointerleave', () => { tyaw = YAW0; tpitch = 0; kick(); });

  c.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;          // touch: a tap makes a wave, swipes keep scrolling
    const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const [bx, by] = draw(performance.now());
    if (Math.hypot(px - bx, py - by) < 46) {
      drag = { px, py, x0: bh.x, y0: bh.y, moved: 0 };
      c.setPointerCapture(e.pointerId); c.classList.add('dragging');
    } else drag = { click: true };
  });
  c.addEventListener('pointermove', e => {
    if (!drag || drag.click) return;
    const r = c.getBoundingClientRect(), p = P0 + pitch;
    const x1 = (e.clientX - r.left - drag.px) / scale, y1 = -(e.clientY - r.top - drag.py) / (scale * Math.sin(p));
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    bh.x = clamp(drag.x0 + x1 * cy + y1 * sy, -SX + 0.35, SX - 0.35);
    bh.y = clamp(drag.y0 - x1 * sy + y1 * cy, -SY + 0.3, SY - 0.3);
    drag.moved = Math.hypot(bh.x - drag.x0, bh.y - drag.y0);
    kick();
  });
  const release = e => {
    if (e.pointerType === 'touch') { if (e.type === 'pointerup') wave(0.28); return; }
    if (!drag) return;
    const d = drag; drag = null; c.classList.remove('dragging');
    if (e.type === 'pointerup') wave(d.click ? 0.24 : clamp(0.14 + d.moved * 0.5, 0.14, 0.45));
  };
  c.addEventListener('pointerup', release);
  c.addEventListener('pointercancel', release);

  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }).observe(c);
  addEventListener('resize', size);
  size();
  // one ripple to show the sheet is alive: after the signature intro, or straight away
  setTimeout(() => wave(0.3), document.documentElement.classList.contains('intro') ? 2400 : 500);
  return { wave };
})();
document.getElementById('wave')?.addEventListener('click', () => spacetime.wave(0.3));

/* Project objects: they lean toward the pointer with a soft sheen;
   drag one sideways (or press it, or the button) to flip it and read the back. */
document.querySelectorAll('[data-obj]').forEach(obj => {
  const inner = obj.querySelector('.obj-inner'), front = obj.querySelector('.front'), btn = obj.querySelector('.obj-flip');
  obj.querySelectorAll('img').forEach(img => { img.draggable = false; });
  let flipped = false, rx = 0, ry = 0, drag = null;
  const apply = (extra = 0) => { inner.style.transform = `rotateX(${rx}deg) rotateY(${(flipped ? 180 : 0) + ry + extra}deg)`; };
  const setFlip = v => {
    flipped = v; rx = ry = 0;
    btn.setAttribute('aria-pressed', v); btn.textContent = v ? 'Back to the front' : 'See details';
    inner.classList.remove('live'); apply();
  };
  btn.addEventListener('click', () => setFlip(!flipped));

  inner.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (drag) { drag.dx = e.clientX - drag.x; inner.classList.add('dragging'); apply(clamp(drag.dx * 0.6, -180, 180)); return; }
    if (reduce) return;
    const r = inner.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    rx = (0.5 - ny) * 9; ry = (nx - 0.5) * 12;
    front.style.setProperty('--mx', `${nx * 100}%`); front.style.setProperty('--my', `${ny * 100}%`); front.style.setProperty('--sheen', 1);
    inner.classList.add('live'); apply();
  });
  inner.addEventListener('pointerleave', () => {
    rx = ry = 0; front.style.setProperty('--sheen', 0); inner.classList.remove('live');
    if (!drag) apply();
  });
  inner.addEventListener('pointerdown', e => {
    if (e.button) return;
    drag = { x: e.clientX, dx: 0, touch: e.pointerType === 'touch' };
    if (!drag.touch) inner.setPointerCapture(e.pointerId);
  });
  const end = e => {
    if (!drag) return;
    const { dx } = drag; drag = null; inner.classList.remove('dragging');
    if (e.type === 'pointerup' && (Math.abs(dx) > 60 || Math.abs(dx) < 4)) setFlip(!flipped); else apply();
  };
  inner.addEventListener('pointerup', end);
  inner.addEventListener('pointercancel', end);
});

/* Signature intro: the name is written in one glowing line, then the page appears.
   Once per visit; any click or key skips it. */
(() => {
  const sig = document.getElementById('sig');
  if (!sig) return;
  if (!document.documentElement.classList.contains('intro')) { sig.remove(); return; }
  const skip = () => { if (!sig.isConnected) return; sig.classList.add('done'); setTimeout(() => sig.remove(), 320); };
  sig.addEventListener('click', skip);
  addEventListener('keydown', skip, { once: true });
  sig.addEventListener('animationend', e => { if (e.target === sig) sig.remove(); });
})();

/* Section titles: scrambled characters that decode, left to right, the first time a title scrolls into view. */
if (!reduce && 'IntersectionObserver' in window) {
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const decode = h => {
    const text = h.dataset.text, start = performance.now(), per = 45, settle = 380;
    const step = now => {
      const t = now - start;
      let out = '', done = true;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ' || t > settle + i * per) out += ch;
        else { out += GLYPHS[(Math.random() * GLYPHS.length) | 0]; done = false; }
      }
      h.firstChild.textContent = out;
      if (!done) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { decode(en.target); io.unobserve(en.target); }
  }), { threshold: 0.5 });
  document.querySelectorAll('[data-scramble]').forEach(h => {
    h.dataset.text = h.textContent.toUpperCase();
    h.setAttribute('aria-label', h.textContent);
    h.innerHTML = `<span aria-hidden="true">${h.dataset.text}</span>`;
    io.observe(h);
  });
}

/* Marquee: two bands drifting in opposite directions; scrolling speeds them up. */
(() => {
  const rows = [...document.querySelectorAll('.mq-row')];
  if (!rows.length || reduce) return;
  const bands = rows.map((row, k) => {
    const track = row.querySelector('.mq-track');
    track.innerHTML += track.innerHTML;                 // two copies so the loop is seamless
    return { track, x: 0, dir: k % 2 ? 1 : -1, w: 0 };
  });
  const measure = () => bands.forEach(b => { b.w = b.track.scrollWidth / 2; });
  let last = performance.now(), lastY = scrollY, boost = 0, on = true;
  const tick = now => {
    const dt = Math.min(64, now - last); last = now;
    boost = boost * 0.92 + Math.abs(scrollY - lastY) * 0.06; lastY = scrollY;
    for (const b of bands) {
      b.x += b.dir * (0.04 + boost * 0.02) * dt;
      if (b.x <= -b.w) b.x += b.w;
      if (b.x > 0) b.x -= b.w;
      b.track.style.transform = `translate3d(${b.x}px, 0, 0)`;
    }
    if (on) requestAnimationFrame(tick);
  };
  new IntersectionObserver(([en]) => {
    const was = on; on = en.isIntersecting;
    if (on && !was) { last = performance.now(); requestAnimationFrame(tick); }
  }).observe(rows[0].parentElement);
  document.fonts.ready.then(measure); addEventListener('resize', measure); measure();
  bands[1].x = -bands[1].w / 2;
  requestAnimationFrame(tick);
})();

/* "In numbers": each figure counts up once when it comes into view. */
(() => {
  const nums = document.querySelectorAll('[data-count]');
  if (!nums.length || reduce || !('IntersectionObserver' in window)) return;
  const fmt = new Intl.NumberFormat('en-GB');
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    const el = en.target, end = +el.dataset.count, start = performance.now(), dur = 1400;
    const step = now => {
      const p = clamp((now - start) / dur, 0, 1), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt.format(Math.round(end * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { threshold: 0.8 });
  nums.forEach(n => { n.textContent = '0'; io.observe(n); });
})();

/* The floating "Scroll" pill fades away once the visitor starts scrolling. */
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 80), { passive: true });
