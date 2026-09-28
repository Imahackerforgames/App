/* adj — shelf, book maker and coloring studio. */
(function () {
  const A = window.ADJ_ART;
  // The studio canvas is 1.5x the drawing's own units, for crisp lines and prints.
  const K = 1.5, W = A.W * K, H = A.H * K;
  const $ = (id) => document.getElementById(id);
  const DISPLAY = "'Chewy','Comic Sans MS',cursive";
  const store = {
    get(k, d) { try { const v = localStorage.getItem('adj.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('adj.' + k, JSON.stringify(v)); return true; } catch { return false; } },
  };

  // ---------- paint storage (IndexedDB, memory fallback) ----------
  const mem = new Map();
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      try { const q = indexedDB.open('adj', 1); q.onupgradeneeded = () => q.result.createObjectStore('paint'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }
      catch (e) { rej(e); }
    });
    return dbp;
  }
  const idb = {
    async get(k) {
      try { const d = await db(); return await new Promise((res) => { const q = d.transaction('paint').objectStore('paint').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
      catch { return mem.get(k) || null; }
    },
    async put(k, v) {
      mem.set(k, v);
      try { const d = await db(); await new Promise((res) => { const t = d.transaction('paint', 'readwrite'); t.objectStore('paint').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch {}
    },
    async del(k) {
      mem.delete(k);
      try { const d = await db(); await new Promise((res) => { const t = d.transaction('paint', 'readwrite'); t.objectStore('paint').delete(k); t.oncomplete = res; t.onerror = res; }); } catch {}
    },
  };

  // ---------- Claude capabilities (only inside a Claude artifact) ----------
  let sample = null, downloads = null;
  const inClaude = !!(window.claude && window.claude.use);
  if (inClaude) {
    window.claude.use('sample').then((s) => { sample = s; if (s) setMode(true); }).catch(() => {});
    window.claude.use('downloads').then((d) => { downloads = d; $('save').hidden = !d; }).catch(() => { $('save').hidden = true; });
    $('save').hidden = true;
  } else {
    $('print').hidden = false; $('printBook').hidden = false;
  }
  function setMode(ai) {
    const m = $('mode');
    m.classList.toggle('ai', ai);
    m.querySelector('span').textContent = ai
      ? 'adj can draw anything you type. A new book takes about a minute to draw.'
      : "Books come from adj's drawing box: animals, dinos, space, trucks, sweets, bugs and more.";
  }

  // ---------- sound ----------
  let soundOn = store.get('sound', true), actx = null;
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.12, slide = 0) {
    if (!soundOn) return;
    try {
      audio();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
    } catch {}
  }
  const sfx = {
    pop: () => tone(520, 0.14, 'sine', 0.14, 1.8),
    tick: () => tone(880, 0.05, 'triangle', 0.06),
    stamp: () => tone(300, 0.12, 'square', 0.05, 2),
    yay: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.1), i * 110)),
  };
  function paintSoundBtn() {
    $('sound').setAttribute('aria-pressed', soundOn);
    $('sound').innerHTML = (soundOn
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/></svg>Sounds on'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>Sounds off');
  }
  $('sound').onclick = () => { soundOn = !soundOn; store.set('sound', soundOn); paintSoundBtn(); sfx.tick(); };
  paintSoundBtn();

  // ---------- music: shuffles through songs, played live with Web Audio ----------
  // Public-domain nursery tunes plus two originals. "note:beats", beats default 1.
  const SONGS = [
    { name: 'Twinkle, Twinkle, Little Star', key: 'C', bpm: 104, n: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
    { name: 'Mary Had a Little Lamb', key: 'C', bpm: 116, n: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4' },
    { name: 'Are You Sleeping', key: 'C', bpm: 112, n: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2' },
    { name: 'Row, Row, Row Your Boat', key: 'C', bpm: 100, n: 'C4:1.5 C4:1.5 C4 D4:.5 E4:1.5 E4 D4:.5 E4 F4:.5 G4:3 C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 G4 F4:.5 E4 D4:.5 C4:3' },
    { name: 'Old MacDonald', key: 'G', bpm: 120, n: 'G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:3 D4 G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:4' },
    { name: 'London Bridge', key: 'C', bpm: 116, n: 'G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:3' },
    { name: 'Ode to Joy', key: 'C', bpm: 108, n: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2' },
    { name: 'Hot Cross Buns', key: 'C', bpm: 112, n: 'E4 D4 C4:2 E4 D4 C4:2 C4:.5 C4:.5 C4:.5 C4:.5 D4:.5 D4:.5 D4:.5 D4:.5 E4 D4 C4:2' },
    { name: 'Spooky Tiptoe', key: 'Am', bpm: 96, n: 'A3:.5 C4:.5 E4:.5 A4:.5 G#4 E4 F4:.5 E4:.5 D4:.5 C4:.5 B3:2 A3:.5 C4:.5 E4:.5 A4:.5 B4 C5 B4:.5 G#4:.5 E4:.5 B3:.5 A3:2 E4:.5 E4:.5 F4:.5 E4:.5 D4:.5 E4:.5 C4 B3:.5 C4:.5 D4:.5 B3:.5 A3:2' },
    { name: 'Crayon Dance', key: 'C', bpm: 126, n: 'C4:.5 E4:.5 G4:.5 C5:.5 A4 G4 F4:.5 A4:.5 G4:.5 E4:.5 D4:2 C4:.5 E4:.5 G4:.5 C5:.5 D5 B4 C5:2 A4:.5 A4:.5 G4:.5 E4:.5 F4 D4 E4:.5 D4:.5 C4:.5 D4:.5 C4:2' },
  ];
  const TRIADS = { C: [[0, 4, 7], [5, 9, 0], [7, 11, 2]], G: [[7, 11, 2], [0, 4, 7], [2, 6, 9]], Am: [[9, 0, 4], [2, 5, 9], [4, 8, 11]] };
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (t) => { const m = t.match(/^([A-G])(#?)(\d)$/); return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] ? 1 : 0); };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const INSTRUMENTS = [
    { name: 'music box', parts: [['sine', 1, 1], ['sine', 2, 0.35], ['sine', 3, 0.12]], decay: 0.9 },
    { name: 'marimba', parts: [['sine', 1, 1], ['sine', 4, 0.2]], decay: 0.45 },
    { name: 'flute', parts: [['triangle', 1, 1], ['sine', 2, 0.15]], decay: 0.0 },
    { name: 'xylophone', parts: [['triangle', 1, 1], ['sine', 3, 0.3]], decay: 0.3 },
  ];
  let musicOn = store.get('music', true), musicBus = null, songGain = null, songTimer = null, lastSong = -1, nowPlaying = null;
  function audio() { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; }
  function bus() {
    if (musicBus) return musicBus;
    const a = audio(), out = a.createGain(), dly = a.createDelay(), fb = a.createGain(), wet = a.createGain();
    out.gain.value = 0.55; dly.delayTime.value = 0.28; fb.gain.value = 0.25; wet.gain.value = 0.22;
    out.connect(a.destination); out.connect(dly); dly.connect(fb).connect(dly); dly.connect(wet).connect(a.destination);
    return (musicBus = out);
  }
  function voice(dest, f0, t, len, inst, vol) {
    const a = audio();
    for (const [type, mult, amp] of inst.parts) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.value = f0 * mult;
      const end = inst.decay ? t + Math.max(inst.decay, len) : t + len;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * amp, t + 0.015);
      if (inst.decay) g.gain.exponentialRampToValueAtTime(0.0001, end);
      else { g.gain.setValueAtTime(vol * amp, Math.max(t + 0.02, end - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, end); }
      o.connect(g).connect(dest); o.start(t); o.stop(end + 0.05);
    }
  }
  function playSong(idx) {
    stopSong();
    const a = audio(), song = SONGS[idx], inst = INSTRUMENTS[(Math.random() * INSTRUMENTS.length) | 0];
    const beat = 60 / (song.bpm * (0.94 + Math.random() * 0.12));
    songGain = a.createGain(); songGain.gain.value = 1; songGain.connect(bus());
    const notes = song.n.split(' ').map((tok) => { const [nm, b] = tok.split(':'); return { m: midi(nm), b: b ? +b : 1 }; });
    let t = a.currentTime + 0.15, pos = 0, chord = TRIADS[song.key][0];
    const t0 = t, total = notes.reduce((x, y) => x + y.b, 0);
    for (const nt of notes) {
      voice(songGain, hz(nt.m), t, nt.b * beat * 0.92, inst, 0.11);
      t += nt.b * beat;
    }
    // Oom-pah bass: every two beats pick the chord that holds the melody note there.
    for (let bt = 0; bt < total; bt += 2) {
      let acc = 0, m = notes[0].m;
      for (const nt of notes) { if (acc + nt.b > bt) { m = nt.m; break; } acc += nt.b; }
      chord = TRIADS[song.key].find((tr) => tr.includes(m % 12)) || chord;
      const root = 48 + chord[0] - (chord[0] > 7 ? 12 : 0);
      voice(songGain, hz(root), t0 + bt * beat, beat * 0.8, INSTRUMENTS[2], 0.07);
      if (bt + 1 < total) voice(songGain, hz(root + ((chord[2] - chord[0] + 12) % 12)), t0 + (bt + 1) * beat, beat * 0.7, INSTRUMENTS[2], 0.05);
    }
    nowPlaying = `${song.name} (${inst.name})`;
    syncMusic();
    songTimer = setTimeout(() => musicOn && playSong(pickSong()), (total * beat + 2.2) * 1000);
  }
  function stopSong() {
    clearTimeout(songTimer);
    if (songGain && actx) { const g = songGain; g.gain.setTargetAtTime(0, actx.currentTime, 0.05); setTimeout(() => g.disconnect(), 400); }
    songGain = null;
  }
  function pickSong() {
    let i; do i = (Math.random() * SONGS.length) | 0; while (i === lastSong && SONGS.length > 1);
    return (lastSong = i);
  }
  function syncMusic() {
    const b = $('music');
    b.setAttribute('aria-pressed', musicOn);
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>' + (musicOn ? '' : '<path d="M3 3l18 18"/>') + '</svg>' + (musicOn ? 'Music on' : 'Music off');
    b.title = musicOn && nowPlaying ? 'Now playing: ' + nowPlaying : 'Turn music on or off';
    $('skip').hidden = !musicOn;
    $('song').textContent = musicOn && nowPlaying ? '♪ ' + nowPlaying.replace(/ \(.*/, '') : '';
  }
  $('music').onclick = () => { musicOn = !musicOn; store.set('music', musicOn); musicOn ? playSong(pickSong()) : stopSong(); if (!musicOn) nowPlaying = null; syncMusic(); };
  $('skip').onclick = () => { playSong(pickSong()); sfx.tick(); };
  // Browsers only allow sound after a tap, so music starts on the first one.
  const firstTap = (e) => {
    removeEventListener('pointerdown', firstTap, true);
    if (musicOn && !songGain && !(e.target.closest && e.target.closest('#music'))) playSong(pickSong());
  };
  addEventListener('pointerdown', firstTap, true);
  syncMusic();

  // ---------- toast & confetti ----------
  let toastT;
  function toast(msg, ms = 3200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('confetti'), ctx = cv.getContext('2d');
    cv.hidden = false; cv.width = innerWidth; cv.height = innerHeight;
    const cols = ['#FF5A5F', '#FF9F1C', '#FFD23F', '#3DD17B', '#3A86FF', '#8338EC', '#FF6FB5'];
    const bits = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 16, vy: -8 - Math.random() * 12, r: Math.random() * 6, s: 6 + Math.random() * 8, c: cols[(Math.random() * cols.length) | 0], star: Math.random() < 0.3 }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const b of bits) {
        b.vy += 0.4; b.x += b.vx; b.y += b.vy; b.r += 0.1;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
        if (b.star) { ctx.font = `${b.s * 2}px serif`; ctx.fillText('★', 0, 0); } else ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
        ctx.restore();
      }
      if (t - t0 < 2200) requestAnimationFrame(frame); else cv.hidden = true;
    })(t0);
  }

  // ---------- rendering pages ----------
  const fontsReady = (async () => { try { await document.fonts.load(`60px ${DISPLAY}`); } catch {} })();
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

  function bubble(ctx, text, cx, cy, maxW, size) {
    let lines = [text], sz = size;
    ctx.font = `${sz}px ${DISPLAY}`;
    if (ctx.measureText(text).width > maxW && text.includes(' ')) {
      const words = text.split(' '); let best = null;
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
        const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (!best || w < best.w) best = { w, l: [a, b] };
      }
      lines = best.l; sz = size * 0.85;
    }
    ctx.font = `${sz}px ${DISPLAY}`;
    while (Math.max(...lines.map((t) => ctx.measureText(t).width)) > maxW && sz > 30) { sz -= 4; ctx.font = `${sz}px ${DISPLAY}`; }
    ctx.lineWidth = Math.max(6, sz * 0.08); ctx.strokeStyle = '#222'; ctx.fillStyle = '#fff'; ctx.lineJoin = 'round';
    const lh = sz * 1.02, y0 = cy - ((lines.length - 1) * lh) / 2;
    lines.forEach((t, j) => { ctx.strokeText(t, cx, y0 + j * lh); ctx.fillText(t, cx, y0 + j * lh); });
  }

  // Returns a canvas holding the page's line art as dark ink on transparent.
  async function renderInk(book, i, w, h, win = null) {
    await fontsReady;
    const svg = A.pageSVG(book, i, w, win);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    try { const img = await loadImg(url); ctx.drawImage(img, 0, 0, w, h); } finally { URL.revokeObjectURL(url); }
    const pg = A.compose(book, i), k = w / (win ? win.w : A.W);
    ctx.save(); ctx.scale(k, k); if (win) ctx.translate(-win.x, -win.y); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (pg.title) i === 0 ? bubble(ctx, pg.title, 425, 190, 700, 124) : bubble(ctx, pg.title, 425, 520, 640, 170);
    if (pg.caption) {
      let sz = 46; ctx.font = `${sz}px ${DISPLAY}`;
      while (ctx.measureText(pg.caption).width > 740 && sz > 24) { sz -= 2; ctx.font = `${sz}px ${DISPLAY}`; }
      ctx.fillStyle = '#222'; ctx.fillText(pg.caption, 425, 1030);
    }
    ctx.restore();
    const d = ctx.getImageData(0, 0, w, h), px = d.data;
    for (let j = 0; j < px.length; j += 4) {
      const lum = px[j] * 0.3 + px[j + 1] * 0.59 + px[j + 2] * 0.11;
      px[j] = 35; px[j + 1] = 32; px[j + 2] = 59; px[j + 3] = Math.min(255, (255 - lum) * 1.35);
    }
    ctx.putImageData(d, 0, 0);
    return cv;
  }
  const wallsOf = (ctx, w, h) => { const a = ctx.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let j = 0; j < m.length; j++) m[j] = a[j * 4 + 3] > 110 ? 1 : 0; return m; };

  // Scanline flood fill over non-wall pixels, then grow 2px under the lines.
  function region(walls, w, h, sx, sy) {
    const mark = new Uint8Array(w * h), stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      let i = y * w + x;
      if (mark[i] || walls[i]) continue;
      let lx = x; while (lx > 0 && !walls[i - 1] && !mark[i - 1]) { lx--; i--; }
      let up = false, dn = false;
      for (let cx = lx; cx < w; cx++) {
        const j = y * w + cx;
        if (walls[j] || mark[j]) break;
        mark[j] = 1;
        if (y > 0) { const u = j - w; if (!walls[u] && !mark[u]) { if (!up) { stack.push(cx, y - 1); up = true; } } else up = false; }
        if (y < h - 1) { const v = j + w; if (!walls[v] && !mark[v]) { if (!dn) { stack.push(cx, y + 1); dn = true; } } else dn = false; }
      }
    }
    return mark;
  }
  function grow(mark, walls, w, h, passes) {
    for (let p = 1; p <= passes; p++) {
      for (let j = 0; j < mark.length; j++) {
        if (mark[j] !== p) continue;
        const x = j % w;
        if (x > 0 && walls[j - 1] && !mark[j - 1]) mark[j - 1] = p + 1;
        if (x < w - 1 && walls[j + 1] && !mark[j + 1]) mark[j + 1] = p + 1;
        if (j >= w && walls[j - w] && !mark[j - w]) mark[j - w] = p + 1;
        if (j < mark.length - w && walls[j + w] && !mark[j + w]) mark[j + w] = p + 1;
      }
    }
  }

  // Colors every closed area at random: used for bookshelf covers.
  const AUTO = ['#FFD23F', '#FF9F1C', '#FF6FB5', '#3DD17B', '#3EC1F3', '#B388FF', '#FF8A8D', '#9BD13D', '#6FE3F5', '#FFB86B'];
  function autoColor(ink, seed) {
    const w = ink.width, h = ink.height, ctx = ink.getContext('2d');
    const walls = wallsOf(ctx, w, h), seen = new Uint8Array(w * h), R = A.rng(seed);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const octx = out.getContext('2d'); octx.fillStyle = '#fff'; octx.fillRect(0, 0, w, h);
    const img = octx.getImageData(0, 0, w, h), px = img.data;
    for (let j = 0; j < w * h; j++) {
      if (seen[j] || walls[j]) continue;
      const m = region(walls, w, h, j % w, (j / w) | 0);
      let n = 0, edge = false;
      for (let q = 0; q < m.length; q++) if (m[q]) { seen[q] = 1; n++; const x = q % w, y = (q / w) | 0; if (x < 3 || y < 3 || x > w - 4 || y > h - 4) edge = true; }
      if (edge || n < 25) continue;
      const hex = AUTO[(R() * AUTO.length) | 0], cr = parseInt(hex.slice(1, 3), 16), cg = parseInt(hex.slice(3, 5), 16), cb = parseInt(hex.slice(5, 7), 16);
      grow(m, walls, w, h, 1);
      for (let q = 0; q < m.length; q++) if (m[q]) { px[q * 4] = cr; px[q * 4 + 1] = cg; px[q * 4 + 2] = cb; }
    }
    octx.putImageData(img, 0, 0); octx.drawImage(ink, 0, 0);
    return out;
  }
  async function composite(book, i, w, h, auto) {
    const ink = await renderInk(book, i, w, h);
    const blob = await idb.get(key(book, i));
    if (!blob && auto) return autoColor(ink, book.id);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    if (blob) { try { const u = URL.createObjectURL(blob); const im = await loadImg(u); ctx.drawImage(im, 0, 0, w, h); URL.revokeObjectURL(u); } catch {} }
    ctx.drawImage(ink, 0, 0);
    return cv;
  }
  const key = (book, i) => `${book.id}:${i}`;

  // ---------- shelf ----------
  let mine = store.get('mine', []);
  let done = store.get('done', {});
  const IDEAS = ['a dragon who loves pizza', 'cat astronaut', 'monster trucks', 'mermaid princess', 'robot dinosaur', 'puppies at the beach', 'unicorn birthday party', 'a friendly octopus chef'];
  const starSvg = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.5 5.7 21l1.5-7L2 9.3l7-.8z" fill="#FFD23F" stroke="#23203B" stroke-width="2" stroke-linejoin="round"/></svg>';

  function ideaChips() {
    const box = $('ideas');
    for (const t of IDEAS.slice(0, 6)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'idea'; b.textContent = t;
      b.onclick = () => { $('idea').value = t; makeBook(t); };
      box.appendChild(b);
    }
  }
  function bookCard(book, deletable) {
    const b = document.createElement('button');
    b.className = 'book'; b.style.setProperty('--bc', book.color);
    const n = (done[book.id] || []).length;
    b.innerHTML = `<img class="cov" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><span class="t"></span><span class="meta"><span class="stars">${starSvg}${n}/12</span><span>${n === 12 ? 'All done!' : n ? 'Keep going' : 'Open'}</span></span>`;
    b.querySelector('.t').textContent = book.title;
    b.onclick = () => openBook(book);
    if (deletable) {
      const d = document.createElement('span');
      d.className = 'del'; d.role = 'button'; d.tabIndex = 0; d.textContent = '×'; d.title = 'Delete this book'; d.setAttribute('aria-label', 'Delete ' + book.title);
      let armed = false;
      const act = async (ev) => {
        ev.stopPropagation();
        if (!armed) { armed = true; d.classList.add('sure'); d.textContent = 'Delete?'; setTimeout(() => { armed = false; d.classList.remove('sure'); d.textContent = '×'; }, 3000); return; }
        mine = mine.filter((x) => x.id !== book.id); store.set('mine', mine);
        delete done[book.id]; store.set('done', done);
        for (let i = 0; i < 12; i++) idb.del(key(book, i));
        renderShelf();
      };
      d.onclick = act; d.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') act(ev); };
      b.appendChild(d);
    }
    composite(book, 0, 340, 440, true).then((cv) => (b.querySelector('.cov').src = cv.toDataURL())).catch(() => {});
    return b;
  }
  function renderShelf() {
    const ready = $('ready'), my = $('mine');
    ready.innerHTML = ''; my.innerHTML = '';
    for (const bk of A.BOOKS) ready.appendChild(bookCard(bk, false));
    $('mineh').hidden = my.hidden = mine.length === 0;
    for (const bk of mine.slice().reverse()) my.appendChild(bookCard(bk, true));
  }

  // ---------- making a custom book ----------
  const BOOK_COLORS = ['#FF5A5F', '#FF9F1C', '#FFD23F', '#3DD17B', '#3EC1F3', '#B388FF', '#FF6FB5', '#9BD13D'];
  const SCENE_LIST = Object.keys(A.SCENES);
  const PROP_LIST = Object.keys(A.S);
  let genCtl = null;

  function buildPrompt(text) {
    return `You draw pages for a children's coloring book app. A child typed this idea: "${text.slice(0, 80)}".

Draw 4 different black-and-white line drawings for the book: the main character or thing from the idea, plus 3 more drawings of it in other poses or doing other things, or of its friends or things from the idea. Keep it cheerful and suitable for young kids.

Reply with only JSON in this shape:
{"title":"fun book title, at most 24 characters","heroes":[{"name":"short simple noun like fire dragon, at most 18 characters, no article","svg":"<path .../>..."}],"scene":"one of: ${SCENE_LIST.join(', ')}","props":["three keys from: ${PROP_LIST.join(', ')}"]}

Rules for every svg value:
- It is the INSIDE of an svg with viewBox 0 0 200 200. Do not include the <svg> tag. Fill the box: the drawing should reach from about 12 to 188 in both directions.
- Use only path, circle, ellipse, rect, polygon, polyline, line and g.
- Every closed shape has fill="white". Lines that are only details use fill="none". Only eye pupils may use fill="black". No stroke attributes, colors, gradients, text or filters.
- Later shapes cover earlier ones, so draw back parts first (tail, back legs, body) and the face last.
- Cute kawaii style like a store-bought kids' coloring book: chubby rounded shapes, big areas to color, big eyes (a white circle, a black pupil, and a small white circle highlight on the pupil), rosy cheek ovals with fill="white", a little smile. Add one or two fun details (a bow, a sparkle, a heart, a pattern of spots). 15 to 45 elements each.
- Keep each svg under 2500 characters.`;
  }

  const GEN_MSGS = ['Sharpening the crayons', 'Sketching the first page', 'Drawing big friendly eyes', 'Adding lots of room to color', 'Stapling the pages together'];
  async function makeBook(text) {
    text = (text || '').trim();
    if (!text) { $('idea').focus(); toast('Type what your book should be about first.'); return; }
    sfx.tick();
    let book = null;
    if (sample) {
      const gen = $('gen'); gen.hidden = false; $('genT').textContent = 'Drawing your book…';
      let mi = 0; $('genM').textContent = GEN_MSGS[0];
      const iv = setInterval(() => ($('genM').textContent = GEN_MSGS[++mi % GEN_MSGS.length]), 4000);
      genCtl = new AbortController();
      try {
        const data = await sample.json(buildPrompt(text), { signal: genCtl.signal });
        book = fromAI(data, text);
        if (!book) toast("The drawings didn't come out right, so adj used its own drawing box.", 5000);
      } catch (e) {
        if (e && e.code === 'cancelled') { clearInterval(iv); gen.hidden = true; return; }
        const why = e && e.code === 'not_granted' ? 'Drawing with Claude was not allowed' : e && e.code === 'rate_limited' ? 'Too many books at once' : 'Drawing did not work this time';
        toast(`${why}, so adj used its own drawing box.`, 5000);
      } finally { clearInterval(iv); gen.hidden = true; genCtl = null; }
    }
    if (!book) {
      const b = A.bookFromWords(text);
      book = { ...b, id: 'u' + Date.now().toString(36), color: BOOK_COLORS[(Math.random() * BOOK_COLORS.length) | 0], prompt: text };
      if (!b.matched) setTimeout(() => toast(`adj doesn't have a ${text} drawing yet, so some pages let you draw it yourself.`, 6000), 400);
    }
    mine.push(book);
    if (!store.set('mine', mine)) toast('This browser is full, so this book will disappear when you close the page.');
    $('idea').value = '';
    renderShelf();
    openBook(book);
  }
  $('stop').onclick = () => genCtl && genCtl.abort();

  function fromAI(data, text) {
    if (!data || !Array.isArray(data.heroes)) return null;
    const heroes = data.heroes.slice(0, 4).map((h) => ({ name: String(h && h.name || '').replace(/[^\w '\-]/g, '').trim().slice(0, 20) || 'friend', svg: A.sanitizeSVG(h && h.svg) })).filter((h) => h.svg.length > 60);
    if (!heroes.length) return null;
    while (heroes.length < 4) heroes.push(heroes[heroes.length % Math.max(1, heroes.length)]);
    const scene = SCENE_LIST.includes(data.scene) ? data.scene : 'meadow';
    let props = (Array.isArray(data.props) ? data.props : []).filter((k) => A.S[k]).slice(0, 3);
    for (const k of A.SCENE_PROPS[scene]) if (props.length < 3 && !props.includes(k)) props.push(k);
    const title = String(data.title || '').trim().slice(0, 28) || A.titleFor(text);
    return { id: 'u' + Date.now().toString(36), title, color: BOOK_COLORS[(Math.random() * BOOK_COLORS.length) | 0], scene, alt: scene === 'space' ? 'night' : 'plain', heroes, props, prompt: text, ai: true };
  }

  $('askf').onsubmit = (e) => { e.preventDefault(); makeBook($('idea').value); };
  $('surprise').onclick = () => { const t = IDEAS[(Math.random() * IDEAS.length) | 0]; $('idea').value = t; makeBook(t); };

  // ---------- studio ----------
  const paint = $('paint'), inkC = $('ink');
  const pctx = paint.getContext('2d', { willReadFrequently: true }), ictx = inkC.getContext('2d', { willReadFrequently: true });
  let book = null, page = 0, walls = null, undo = [], redo = [], saveT = null, dirty = false, openSeq = 0;

  const TOOLS = [
    ['fill', 'Fill', '<path d="M4 12l7-7 7 7-7 7z"/><path d="M4 12h14"/><path d="M20 15c0 2 1.2 3 1.2 4a1.2 1.2 0 01-2.4 0c0-1 1.2-2 1.2-4z"/>'],
    ['magic', 'Magic', '<path d="M11 3l1.8 4.4L17 9l-4.2 1.6L11 15l-1.8-4.4L5 9l4.2-1.6z"/><path d="M18 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'],
    ['crayon', 'Crayon', '<path d="M4 20l2.5-.8L18 7.7 16.3 6 4.8 17.5z"/><path d="M14.5 7.8l1.7 1.7"/><path d="M18 7.7l1.3-1.3a1.2 1.2 0 00-1.7-1.7L16.3 6"/>'],
    ['marker', 'Marker', '<path d="M15 4l5 5-9 9H6v-5z"/><path d="M12 7l5 5"/><path d="M3 21h8"/>'],
    ['spray', 'Spray', '<rect x="7" y="10" width="8" height="11" rx="2"/><path d="M9 10V7h4v3"/><path d="M18 5h.01M20.5 7.5h.01M18 9h.01M21 4h.01"/>'],
    ['rainbow', 'Rainbow', '<path d="M2 18a10 10 0 0120 0"/><path d="M6 18a6 6 0 0112 0"/><path d="M10 18a2 2 0 014 0"/>'],
    ['glitter', 'Glitter', '<path d="M8 3l1.2 3L12 7.2 9.2 8.4 8 11.4 6.8 8.4 4 7.2l2.8-1.2z"/><path d="M16 10l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z"/><path d="M7 16l.6 1.4 1.4.6-1.4.6L7 20l-.6-1.4L5 18l1.4-.6z"/>'],
    ['eraser', 'Eraser', '<path d="M16 3l5 5-11 11H5l-3-3z"/><path d="M9 10l5 5"/><path d="M10 21h11"/>'],
    ['hand', 'Move', '<path d="M8 13V5.5a1.5 1.5 0 013 0V12"/><path d="M11 11.5V4a1.5 1.5 0 013 0v7.5"/><path d="M14 11V5.5a1.5 1.5 0 013 0V13"/><path d="M17 9.5a1.5 1.5 0 013 0V15a7 7 0 01-7 7h-1.5a6 6 0 01-4.6-2.2L4 16a1.6 1.6 0 012.4-2L8 15.5"/>'],
    ['sticker', 'Stickers', '<path d="M5 3h14v10l-8 8H5z"/><path d="M11 21v-6a2 2 0 012-2h6"/>'],
  ];
  const COLORS = [
    ['#FF5A5F', 'Cherry red'], ['#E63946', 'Fire red'], ['#FF9F1C', 'Orange'], ['#FFB86B', 'Peach'], ['#FFD23F', 'Sunny yellow'],
    ['#FFF275', 'Lemon'], ['#9BD13D', 'Lime'], ['#3DD17B', 'Grass green'], ['#1B998B', 'Teal'], ['#6FE3F5', 'Aqua'],
    ['#3EC1F3', 'Sky blue'], ['#3A86FF', 'Blue'], ['#1D3FA8', 'Navy'], ['#B388FF', 'Lavender'], ['#8338EC', 'Purple'],
    ['#FF6FB5', 'Bubblegum pink'], ['#FFC2DF', 'Light pink'], ['#8B5A2B', 'Brown'], ['#D4A373', 'Tan'], ['#F6D2B0', 'Light skin'],
    ['#C68642', 'Golden skin'], ['#7D4E2D', 'Deep skin'], ['#FFFFFF', 'White'], ['#9E9EB0', 'Gray'], ['#23203B', 'Black'],
  ];
  const SIZES = [6, 14, 26, 44];
  const PATS = [['rainbow', 'Rainbow'], ['stripes', 'Stripes'], ['dots', 'Polka dots'], ['checks', 'Checks']];
  const STICKERS = ['⭐', '❤️', '🌈', '🦋', '🌸', '✨', '🎈', '👑', '🍭', '🐞', '🍀', '💎'];
  const prefs = Object.assign({ tool: 'fill', color: '#FF5A5F', size: 1, pat: 'rainbow', stk: 0 }, store.get('prefs', {}));
  const savePrefs = () => store.set('prefs', prefs);

  function buildTools() {
    $('tools').innerHTML = '';
    for (const [id, label, icon] of TOOLS) {
      const b = document.createElement('button'); b.className = 'tool'; b.dataset.t = id;
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>${label}`;
      b.onclick = () => { prefs.tool = id; savePrefs(); sfx.tick(); syncTools(); };
      $('tools').appendChild(b);
    }
    $('sizes').innerHTML = '';
    SIZES.forEach((s, i) => {
      const b = document.createElement('button'); b.className = 'sz'; b.setAttribute('aria-label', ['Tiny', 'Small', 'Medium', 'Big'][i]);
      b.innerHTML = `<i style="width:${6 + i * 6}px;height:${6 + i * 6}px"></i>`;
      b.onclick = () => { prefs.size = i; savePrefs(); syncTools(); };
      $('sizes').appendChild(b);
    });
    $('pats').innerHTML = '';
    for (const [id, label] of PATS) {
      const b = document.createElement('button'); b.className = 'pat'; b.dataset.p = id; b.setAttribute('aria-label', label); b.title = label;
      const cv = document.createElement('canvas'); cv.width = cv.height = 28; b.appendChild(cv);
      b.onclick = () => { prefs.pat = id; savePrefs(); syncTools(); };
      $('pats').appendChild(b);
    }
    $('stks').innerHTML = '';
    STICKERS.forEach((s, i) => {
      const b = document.createElement('button'); b.className = 'stk'; b.textContent = s; b.setAttribute('aria-label', 'Sticker ' + (i + 1));
      b.onclick = () => { prefs.stk = i; savePrefs(); syncTools(); };
      $('stks').appendChild(b);
    });
    $('colors').innerHTML = '';
    for (const [hex, name] of COLORS) {
      const b = document.createElement('button'); b.className = 'sw'; b.style.background = hex; b.title = name; b.setAttribute('aria-label', name); b.dataset.c = hex;
      b.onclick = () => { setColor(hex, name); sfx.tick(); };
      $('colors').appendChild(b);
    }
  }
  function setColor(hex, name) {
    prefs.color = hex; savePrefs();
    if (['eraser', 'sticker', 'hand'].includes(prefs.tool)) prefs.tool = 'marker';
    $('mix').value = hex.length === 7 ? hex.toLowerCase() : '#ff5a5f';
    $('curName').textContent = name || 'Your color';
    syncTools();
  }
  $('mix').oninput = (e) => setColor(e.target.value, 'Your color');
  function syncTools() {
    for (const b of $('tools').children) b.setAttribute('aria-pressed', b.dataset.t === prefs.tool);
    [...$('sizes').children].forEach((b, i) => b.setAttribute('aria-pressed', i === prefs.size));
    for (const b of $('pats').children) {
      b.setAttribute('aria-pressed', b.dataset.p === prefs.pat);
      const cv = b.firstChild, c = cv.getContext('2d'), im = c.createImageData(28, 28), fn = patternFn(b.dataset.p, hexRGB(prefs.color));
      for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) { const [r, g, bb] = fn(x * 2, y * 2), j = (y * 28 + x) * 4; im.data[j] = r; im.data[j + 1] = g; im.data[j + 2] = bb; im.data[j + 3] = 255; }
      c.putImageData(im, 0, 0);
    }
    [...$('stks').children].forEach((b, i) => b.setAttribute('aria-pressed', i === prefs.stk));
    for (const b of $('colors').children) b.setAttribute('aria-pressed', b.dataset.c === prefs.color);
    $('cur').style.background = prefs.tool === 'rainbow' ? 'linear-gradient(90deg,#FF5A5F,#FFD23F,#3DD17B,#3A86FF,#8338EC)' : prefs.tool === 'eraser' ? '#fff' : prefs.color;
    const named = COLORS.find((c) => c[0] === prefs.color);
    if (named) $('curName').textContent = named[1];
    $('patRow').hidden = prefs.tool !== 'magic';
    $('stkRow').hidden = prefs.tool !== 'sticker';
    $('sizeRow').hidden = ['fill', 'magic', 'hand'].includes(prefs.tool);
    stage.classList.toggle('pan', prefs.tool === 'hand');
  }
  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const RAINBOW = Array.from({ length: 360 }, (_, i) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = `hsl(${i},90%,64%)`; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)]; });
  function patternFn(kind, rgb) {
    const light = rgb.map((v) => Math.round(v + (255 - v) * 0.68));
    if (kind === 'rainbow') return (x, y) => RAINBOW[((x + y) >> 1) % 360];
    if (kind === 'stripes') return (x, y) => (((x + y) >> 4) & 1 ? rgb : light);
    if (kind === 'dots') return (x, y) => { const dx = (x % 26) - 13, dy = (y % 26) - 13; return dx * dx + dy * dy < 49 ? rgb : light; };
    return (x, y) => (((x >> 5) + (y >> 5)) & 1 ? rgb : light);
  }

  function snapshot() { undo.push(pctx.getImageData(0, 0, W, H)); if (undo.length > 10) undo.shift(); redo = []; syncUndo(); }
  function syncUndo() { $('undo').disabled = !undo.length; $('redo').disabled = !redo.length; }
  $('undo').onclick = () => { if (!undo.length) return; redo.push(pctx.getImageData(0, 0, W, H)); pctx.putImageData(undo.pop(), 0, 0); syncUndo(); changed(); sfx.tick(); };
  $('redo').onclick = () => { if (!redo.length) return; undo.push(pctx.getImageData(0, 0, W, H)); pctx.putImageData(redo.pop(), 0, 0); syncUndo(); changed(); sfx.tick(); };
  let clearArmed = null;
  $('clear').onclick = () => {
    const b = $('clear');
    if (!clearArmed) { b.classList.add('sure'); b.textContent = 'Tap again'; clearArmed = setTimeout(() => { clearArmed = null; b.classList.remove('sure'); b.textContent = 'Start over'; }, 2500); return; }
    clearTimeout(clearArmed); clearArmed = null; b.classList.remove('sure'); b.textContent = 'Start over';
    snapshot(); pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, W, H); changed(); sfx.pop();
  };

  function changed() { dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 700); }
  async function flush() {
    clearTimeout(saveT);
    if (!dirty || !book) return;
    dirty = false;
    const k = key(book, page), i = page, bk = book;
    const blob = await new Promise((res) => paint.toBlob(res, 'image/png'));
    if (blob) await idb.put(k, blob);
    if (bk === book) refreshThumb(i);
  }

  // Fill
  function fillAt(x, y, magic) {
    if (!walls) return;
    x = Math.round(x); y = Math.round(y);
    if (walls[y * W + x]) {
      let found = false;
      for (let r = 1; r < 11 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !walls[ny * W + nx]) { x = nx; y = ny; found = true; break; }
      }
      if (!found) return;
    }
    snapshot();
    const m = region(walls, W, H, x, y);
    grow(m, walls, W, H, 3);
    const img = pctx.getImageData(0, 0, W, H), px = img.data;
    const rgb = hexRGB(prefs.color), fn = magic ? patternFn(prefs.pat, rgb) : null;
    for (let j = 0; j < m.length; j++) {
      if (!m[j]) continue;
      const c = fn ? fn(((j % W) / K) | 0, ((j / W) / K) | 0) : rgb, q = j * 4;
      px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; px[q + 3] = 255;
    }
    pctx.putImageData(img, 0, 0);
    changed(); sfx.pop();
  }

  // Brushes
  let down = false, last = null, hue = 0, sprayT = null;
  const bsize = () => SIZES[prefs.size] * K;
  function seg(a, b) {
    const t = prefs.tool, s = bsize();
    pctx.save(); pctx.lineCap = pctx.lineJoin = 'round';
    if (t === 'marker' || t === 'eraser' || t === 'rainbow' || t === 'glitter') {
      pctx.strokeStyle = t === 'eraser' ? '#fff' : t === 'rainbow' ? `hsl(${(hue += 5) % 360},90%,58%)` : prefs.color;
      pctx.lineWidth = t === 'eraser' ? s * 1.6 : s;
      pctx.beginPath(); pctx.moveTo(a.x, a.y); pctx.lineTo(b.x, b.y); pctx.stroke();
      if (t === 'glitter') {
        const n = 2 + s / 6;
        for (let k = 0; k < n; k++) {
          const ang = Math.random() * 6.28, rr = Math.random() * s * 0.9;
          pctx.fillStyle = ['#fff', '#FFE66D', '#FFF7CC', '#FFFFFF'][k % 4];
          const gx = b.x + Math.cos(ang) * rr, gy = b.y + Math.sin(ang) * rr, g = 1 + Math.random() * 2.5;
          pctx.fillRect(gx - g / 2, gy - g / 2, g, g);
        }
      }
    } else if (t === 'crayon') {
      const d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(d / Math.max(1, s * 0.3)));
      pctx.fillStyle = prefs.color;
      for (let i = 1; i <= steps; i++) {
        const x = a.x + ((b.x - a.x) * i) / steps, y = a.y + ((b.y - a.y) * i) / steps;
        for (let k = 0; k < s * 2.2; k++) {
          const ox = (Math.random() - 0.5) * s, oy = (Math.random() - 0.5) * s;
          if (ox * ox + oy * oy > (s * s) / 4) continue;
          pctx.globalAlpha = 0.35 + Math.random() * 0.5;
          pctx.fillRect(x + ox, y + oy, 2.6, 2.6);
        }
      }
    }
    pctx.restore();
  }
  function spray(p) {
    const s = bsize() * 1.5; pctx.fillStyle = prefs.color;
    for (let k = 0; k < 14 + s; k++) {
      const ang = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * s;
      pctx.fillRect(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr, 2.4, 2.4);
    }
  }
  function stamp(p) {
    snapshot();
    const s = (30 + SIZES[prefs.size] * 2.6) * K;
    pctx.save(); pctx.font = `${s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; pctx.textAlign = 'center'; pctx.textBaseline = 'middle';
    pctx.translate(p.x, p.y); pctx.rotate((Math.random() - 0.5) * 0.5); pctx.fillText(STICKERS[prefs.stk], 0, 0); pctx.restore();
    changed(); sfx.stamp();
  }
  function pos(ev) { const r = inkC.getBoundingClientRect(); return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H }; }

  // ---------- zoom & pan ----------
  // The page sits in a "sheet" moved with a CSS transform, so zooming never
  // touches the drawing itself. A second finger always means zoom/pan: it
  // takes back whatever the first finger just drew, and nothing is drawn
  // again until every finger is lifted.
  const stage = $('stage'), sheet = $('sheet');
  const view = { z: 1, x: 0, y: 0 }, ZMAX = 5;
  function applyView() {
    const w = stage.clientWidth, h = stage.clientHeight;
    view.z = Math.min(ZMAX, Math.max(1, view.z));
    view.x = Math.min(0, Math.max(w - w * view.z, view.x));
    view.y = Math.min(0, Math.max(h - h * view.z, view.y));
    sheet.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
    $('zfit').textContent = Math.round(view.z * 100) + '%';
    $('zout').disabled = view.z <= 1.001; $('zin').disabled = view.z >= ZMAX - 0.001;
    scheduleSharp();
  }
  // While zoomed, redraw just the visible lines at screen resolution once
  // the view stops moving, so they stay crisp instead of pixelated.
  const hi = $('inkHi');
  let hiT = null, hiSeq = 0;
  function scheduleSharp() {
    clearTimeout(hiT); hiSeq++;
    hi.hidden = true; inkC.style.opacity = '';
    if (view.z > 1.05 && book && walls) hiT = setTimeout(renderSharp, 150);
  }
  async function renderSharp() {
    const seq = hiSeq, sw = stage.clientWidth, sh = stage.clientHeight, dpr = Math.min(2, devicePixelRatio || 1), k = (sw / A.W) * view.z;
    const win = { x: -view.x / k, y: -view.y / k, w: sw / k, h: sh / k };
    const cv = await renderInk(book, page, Math.round(sw * dpr), Math.round(sh * dpr), win).catch(() => null);
    if (!cv || seq !== hiSeq) return;
    hi.width = cv.width; hi.height = cv.height;
    hi.getContext('2d').drawImage(cv, 0, 0);
    hi.hidden = false; inkC.style.opacity = '0';
  }
  function zoomAt(z, cx, cy) {
    const px = (cx - view.x) / view.z, py = (cy - view.y) / view.z;
    view.z = Math.min(ZMAX, Math.max(1, z));
    view.x = cx - px * view.z; view.y = cy - py * view.z;
    applyView();
  }
  const zoomCenter = (f) => zoomAt(view.z * f, stage.clientWidth / 2, stage.clientHeight / 2);
  const resetView = () => { view.z = 1; view.x = 0; view.y = 0; applyView(); };
  $('zin').onclick = () => zoomCenter(1.5);
  $('zout').onclick = () => zoomCenter(1 / 1.5);
  $('zfit').onclick = resetView;
  addEventListener('resize', applyView);
  const local = (ev) => { const r = stage.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

  const pts = new Map();
  let mode = 'idle', penSeen = false, spaceDown = false, strokeRedo = null, tap = null, pinch = null, panLast = null;
  function cancelStroke() {
    if (!down) return;
    down = false; last = null; clearInterval(sprayT);
    if (undo.length) pctx.putImageData(undo.pop(), 0, 0);
    redo = strokeRedo || []; syncUndo();
  }
  function startPinch() {
    const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, z: view.z, x: view.x, y: view.y };
  }
  const panMode = (ev) => prefs.tool === 'hand' || spaceDown || ev.button === 1 || (ev.pointerType === 'touch' && penSeen);
  stage.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('#zoombar') || !walls) return;
    ev.preventDefault();
    if (ev.pointerType === 'pen') penSeen = true;
    pts.set(ev.pointerId, local(ev));
    try { stage.setPointerCapture(ev.pointerId); } catch {}
    if (pts.size === 2) { cancelStroke(); tap = null; mode = 'pinch'; startPinch(); return; }
    if (pts.size > 2 || mode === 'pinch') return;
    if (panMode(ev)) { mode = 'pan'; panLast = local(ev); stage.classList.add('panning'); return; }
    const p = pos(ev), t = prefs.tool;
    if (t === 'fill' || t === 'magic' || t === 'sticker') {
      // A finger might be the start of a pinch, so touch waits for the lift.
      if (ev.pointerType === 'touch') { tap = { p, at: local(ev) }; mode = 'tap'; return; }
      return t === 'sticker' ? stamp(p) : fillAt(p.x, p.y, t === 'magic');
    }
    strokeRedo = redo.slice(); snapshot(); down = true; last = p; mode = 'draw';
    if (t === 'spray') { spray(p); sprayT = setInterval(() => last && spray(last), 30); }
    else seg(p, { x: p.x + 0.01, y: p.y + 0.01 });
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!pts.has(ev.pointerId)) return;
    const here = local(ev); pts.set(ev.pointerId, here);
    if (mode === 'pinch' && pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = Math.min(ZMAX, Math.max(1, pinch.z * (d / pinch.d)));
      const sx = (pinch.mx - pinch.x) / pinch.z, sy = (pinch.my - pinch.y) / pinch.z;
      view.z = z; view.x = mx - sx * z; view.y = my - sy * z; applyView();
    } else if (mode === 'pan') {
      view.x += here.x - panLast.x; view.y += here.y - panLast.y; panLast = here; applyView();
    } else if (mode === 'tap') {
      // One finger dragging with fill or stickers moves the page instead.
      if (Math.hypot(here.x - tap.at.x, here.y - tap.at.y) > 10) { mode = 'pan'; panLast = here; tap = null; }
    } else if (mode === 'draw' && down) {
      const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      for (const e of evs.length ? evs : [ev]) {
        const p = pos(e);
        if (prefs.tool === 'spray') { spray(p); last = p; continue; }
        seg(last, p); last = p;
      }
    }
  });
  function lift(ev) {
    if (!pts.delete(ev.pointerId)) return;
    if (mode === 'draw' && down) { down = false; last = null; clearInterval(sprayT); changed(); }
    if (mode === 'tap' && tap && ev.type === 'pointerup') { const t = prefs.tool; t === 'sticker' ? stamp(tap.p) : fillAt(tap.p.x, tap.p.y, t === 'magic'); }
    tap = null;
    if (mode === 'pinch' && pts.size >= 2) startPinch();
    if (pts.size === 0) { mode = 'idle'; pinch = null; stage.classList.remove('panning'); }
    else if (mode !== 'pinch') mode = 'idle';
  }
  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);
  stage.addEventListener('lostpointercapture', lift);
  stage.addEventListener('wheel', (ev) => {
    // Trackpad pinch arrives as ctrl+wheel. Plain scrolling moves a zoomed page.
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); const c = local(ev); zoomAt(view.z * Math.exp(-Math.max(-60, Math.min(60, ev.deltaY * (ev.deltaMode ? 16 : 1))) * 0.006), c.x, c.y); }
    else if (view.z > 1.001) { ev.preventDefault(); view.x -= ev.deltaX; view.y -= ev.deltaY; applyView(); }
  }, { passive: false });
  for (const g of ['gesturestart', 'gesturechange']) stage.addEventListener(g, (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (!book || /input|textarea/i.test(e.target.tagName)) return;
    if (e.code === 'Space' && !e.repeat) { spaceDown = true; stage.classList.add('pan'); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; if (prefs.tool !== 'hand') stage.classList.remove('pan'); } });

  // Pages
  const thumbs = [];
  async function refreshThumb(i) {
    const cv = await composite(book, i, 170, 220, false);
    if (thumbs[i]) thumbs[i].querySelector('img').src = cv.toDataURL();
  }
  function buildStrip() {
    const st = $('strip'); st.innerHTML = ''; thumbs.length = 0;
    for (let i = 0; i < 12; i++) {
      const b = document.createElement('button'); b.className = 'th'; b.setAttribute('aria-label', `Page ${i + 1}`);
      b.innerHTML = `<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><b>${i + 1}</b>`;
      b.onclick = () => goPage(i);
      st.appendChild(b); thumbs.push(b);
    }
    syncStrip();
    (async () => { const bk = book; for (let i = 0; i < 12 && bk === book; i++) await refreshThumb(i); })();
  }
  function syncStrip() {
    const d = done[book.id] || [];
    thumbs.forEach((t, i) => {
      t.setAttribute('aria-current', i === page);
      const has = t.querySelector('.ok');
      if (d.includes(i) && !has) t.insertAdjacentHTML('beforeend', `<span class="ok">${starSvg}</span>`);
      if (!d.includes(i) && has) has.remove();
    });
    $('pgn').textContent = `${page + 1} / 12`;
    $('prev').disabled = page === 0; $('next').disabled = page === 11;
    $('done').textContent = d.includes(page) ? 'Done! Next page' : "I'm done!";
  }
  async function goPage(i) {
    if (i < 0 || i > 11) return;
    await flush();
    const seq = ++openSeq;
    page = i; walls = null; undo = []; redo = []; syncUndo(); syncStrip(); resetView();
    $('loading').hidden = false;
    if (thumbs[i]) { const st = $('strip'); st.scrollTo({ left: thumbs[i].offsetLeft - st.clientWidth / 2 + 40, behavior: 'smooth' }); }
    const ink = await renderInk(book, i, W, H);
    const blob = await idb.get(key(book, i));
    let im = null;
    if (blob) { try { const u = URL.createObjectURL(blob); im = await loadImg(u); URL.revokeObjectURL(u); } catch {} }
    if (seq !== openSeq) return;
    ictx.clearRect(0, 0, W, H); ictx.drawImage(ink, 0, 0);
    pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, W, H);
    if (im) pctx.drawImage(im, 0, 0, W, H);
    walls = wallsOf(ictx, W, H);
    $('loading').hidden = true;
  }
  async function openBook(bk) {
    book = bk; page = 0;
    $('shelf').hidden = true; $('studio').hidden = false;
    $('btitle').textContent = bk.title;
    buildStrip();
    scrollTo(0, $('studio').offsetTop - 6);
    if (!store.get('zoomHint', false)) {
      store.set('zoomHint', true);
      setTimeout(() => toast(matchMedia('(pointer: coarse)').matches ? 'Pinch with two fingers to zoom in. Two fingers also move the page.' : 'Zoom with the + and − buttons, or Ctrl + scroll. Hold Space and drag to move around.', 6000), 800);
    }
    await goPage(0);
  }
  async function closeBook() {
    await flush();
    book = null; walls = null;
    $('studio').hidden = true; $('shelf').hidden = false;
    renderShelf();
  }
  $('back').onclick = closeBook;
  $('home').onclick = () => { if (book) closeBook(); };
  $('prev').onclick = () => goPage(page - 1);
  $('next').onclick = () => goPage(page + 1);
  $('done').onclick = () => {
    const d = (done[book.id] = done[book.id] || []);
    if (d.includes(page)) return goPage(Math.min(11, page + 1));
    d.push(page); store.set('done', done);
    syncStrip(); sfx.yay(); confetti();
    const n = d.length;
    toast(n === 12 ? `You finished the whole book! ${book.title} is complete!` : `Great coloring! ${n} of 12 pages done.`);
  };

  async function pageImage(i) {
    if (i === page) { await flush(); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.drawImage(paint, 0, 0); c.drawImage(inkC, 0, 0); return cv; }
    return composite(book, i, W, H, false);
  }
  $('save').onclick = async () => {
    const cv = await pageImage(page);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const name = `${book.title.replace(/[^\w ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'adj'}-page-${page + 1}.png`;
    if (downloads) {
      try { await downloads.save({ filename: name, data: blob }); } catch (e) { if (e && e.code !== 'cancelled' && e.code !== 'declined') toast('The picture could not be saved here.'); }
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  async function printPages(list) {
    const out = $('printout'); out.innerHTML = '';
    for (const i of list) { const cv = await pageImage(i); const im = new Image(); im.src = cv.toDataURL(); out.appendChild(im); }
    out.hidden = false;
    setTimeout(() => { window.print(); out.hidden = true; }, 150);
  }
  $('print').onclick = () => printPages([page]);
  $('printBook').onclick = () => printPages([...Array(12).keys()]);

  document.addEventListener('keydown', (e) => {
    if (!book || /input|textarea/i.test(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click(); }
    else if (e.key === '+' || e.key === '=') zoomCenter(1.5);
    else if (e.key === '-') zoomCenter(1 / 1.5);
    else if (e.key === '0') resetView();
    else if (e.key === 'ArrowRight' && view.z <= 1.001) goPage(page + 1);
    else if (e.key === 'ArrowLeft' && view.z <= 1.001) goPage(page - 1);
  });
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.hidden && flush());

  // ---------- start ----------
  buildTools(); syncTools(); ideaChips(); renderShelf();
})();
