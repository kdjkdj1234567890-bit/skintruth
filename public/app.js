/* SkinTruth - progress tracker on top of the YouCam AI Skin Analysis API.
   Data lives in localStorage: checks + products. Scores come from the API. */
const CONCERNS = [
  ['moisture','Moisture'],['oiliness','Oil balance'],['redness','Redness'],['acne','Acne'],
  ['pore','Pores'],['texture','Texture'],['wrinkle','Wrinkles'],['radiance','Radiance'],
];
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch { const w = document.querySelector('#storage-warn'); if (w) w.hidden = false; }
  },
};
let checks = store.get('st_checks', []);
let products = store.get('st_products', []);
let currentImage = null; // PNG data URL, face-cropped by the user flow
let pendingLight = null;  // rough lighting proxy for the photo being analyzed
let lastOverlays = null;  // { base_url, masks } from the most recent analysis (signed, ~2h)

/* Rough lighting proxy (mean luminance, 0-255) from a downscaled copy of the photo.
   Not a measurement - just enough to flag "these two photos were taken in
   clearly different light", because lighting moves skin scores. */
function lightStats(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w = 48, h = Math.max(1, Math.round(img.height * (w / img.width)));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h).data;
      let sum = 0, sum2 = 0, n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += l; sum2 += l * l;
      }
      const mean = sum / n;
      resolve({ mean: Math.round(mean), std: Math.round(Math.sqrt(Math.max(0, sum2 / n - mean * mean))) });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
function lightHint(l) {
  if (!l) return '';
  if (l.mean < 55) return 'This photo looks dark. Even, brighter light makes your checks more comparable.';
  if (l.mean > 205) return 'This photo looks overexposed. Softer light makes your checks more comparable.';
  return '';
}
const lightDiffers = (a, b) => a && b && a.light && b.light && Math.abs(a.light.mean - b.light.mean) > 18;
const LIGHT_NOTE = 'photos differ clearly in lighting, which can move scores';

/* ---------- tabs ---------- */
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'progress') renderProgress();
  if (b.dataset.tab === 'products') renderProducts();
  if (b.dataset.tab === 'report') renderReport();
});

/* ---------- quota ---------- */
async function refreshQuota() {
  try {
    const r = await fetch('/api/balance').then(r => r.json());
    if (r.units != null) $('#quota').textContent = `API units left: ${Math.round(r.units)}`;
  } catch {}
}
refreshQuota();

/* ---------- capture ---------- */
let stream = null;
$('#btn-cam').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = $('#cam'); v.srcObject = stream; v.hidden = false;
    $('#preview').hidden = true; $('#btn-shoot').hidden = false;
  } catch { $('#drop-hint').textContent = 'Camera unavailable - please upload a photo instead.'; }
};
$('#btn-shoot').onclick = () => {
  const v = $('#cam');
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  stopCam(); setImage(c.toDataURL('image/png'));
};
function stopCam() { if (stream) stream.getTracks().forEach(t => t.stop()); $('#cam').hidden = true; $('#btn-shoot').hidden = true; }
$('#file').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    const scale = Math.min(1, 1448 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    setImage(c.toDataURL('image/png'));
  };
  img.src = URL.createObjectURL(f);
};
async function setImage(dataUrl) {
  currentImage = dataUrl;
  const p = $('#preview'); p.src = dataUrl; p.hidden = false;
  $('#btn-analyze').disabled = true;
  $('#analyze-status').textContent = '';
  pendingLight = await lightStats(dataUrl);
  $('#analyze-status').textContent = lightHint(pendingLight);
  $('#btn-analyze').disabled = false;
}

/* ---------- analysis ---------- */
$('#btn-analyze').onclick = async () => {
  if (!currentImage) return;
  const st = $('#analyze-status');
  $('#btn-analyze').disabled = true;
  st.textContent = 'Uploading and starting analysis...';
  try {
    const a = await fetch('/api/analyze', { method: 'POST', body: JSON.stringify({ image: currentImage }) }).then(r => r.json());
    if (a.error) throw new Error(a.error + (a.detail?.error ? `: ${a.detail.error}` : ''));
    st.textContent = 'Analyzing (usually 10-30s)...';
    const res = await poll(a.task_id);
    if (res.status !== 'success') throw new Error(res.error_message || res.error || 'analysis did not succeed');
    const keys = CONCERNS.map(c => c[0]);
    if (!res.scores || !keys.every(k => Number.isFinite(res.scores[k]) && res.scores[k] >= 0 && res.scores[k] <= 100))
      throw new Error('analysis returned incomplete scores - nothing saved');
    const thumb = await makeThumb(currentImage);
    const check = { id: 'c' + Date.now(), ts: Date.now(), scores: res.scores, skinAge: res.skin_age, thumb, light: pendingLight };
    checks.push(check); store.set('st_checks', checks);
    st.textContent = 'Done.';
    lastOverlays = (res.masks && Object.keys(res.masks).length && res.base_url) ? { base_url: res.base_url, masks: res.masks } : null;
    renderScores(check); renderOverlays(); refreshQuota();
  } catch (e) {
    st.textContent = 'Failed: ' + e.message;
  } finally {
    $('#btn-analyze').disabled = false;
  }
};
async function poll(taskId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await fetch('/api/result?task_id=' + encodeURIComponent(taskId)).then(r => r.json());
    if (r.status === 'success' || r.status === 'error') return r;
  }
  throw new Error('timed out waiting for analysis');
}
function makeThumb(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w = 120, h = Math.round(img.height * (w / img.width));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
/* Sample journey: clearly-labeled illustrative data, loaded only on explicit click,
   flagged sample:true so it never feeds verdict math. */
const SAMPLE_SCORES = [
  { d: 28, s: { moisture: 62, oiliness: 71, radiance: 74, texture: 81, redness: 82, wrinkle: 88, acne: 78, pore: 76 } },
  { d: 21, s: { moisture: 66, oiliness: 73, radiance: 77, texture: 83, redness: 85, wrinkle: 89, acne: 82, pore: 78 } },
  { d: 14, s: { moisture: 70, oiliness: 76, radiance: 81, texture: 87, redness: 87, wrinkle: 91, acne: 86, pore: 81 } },
  { d: 7,  s: { moisture: 73, oiliness: 77, radiance: 83, texture: 89, redness: 89, wrinkle: 92, acne: 88, pore: 83 } }
];
function loadSample() {
  const day = 86400000, now = Date.now();
  const sample = SAMPLE_SCORES.map((h, i) => ({ id: 'sample' + i, ts: now - h.d * day, scores: h.s, skinAge: null, thumb: null, sample: true }));
  checks = [...sample, ...checks]; store.set('st_checks', checks);
  if (!products.length) {
    products = [
      { id: 'sp1', name: 'Hydrating serum (sample)', concerns: ['moisture', 'radiance'], startedTs: now - 28 * day },
      { id: 'sp2', name: '10% niacinamide serum (sample)', concerns: ['redness', 'oiliness', 'acne'], startedTs: now - 14 * day }
    ];
    store.set('st_products', products);
  }
  renderProgress(); renderReport(); renderProducts();
}
function clearSample() {
  checks = checks.filter(c => !c.sample); store.set('st_checks', checks);
  products = products.filter(p => !String(p.id).startsWith('sp')); store.set('st_products', products);
  renderProgress(); renderReport(); renderProducts();
}
document.addEventListener('click', e => {
  if (e.target.id === 'btn-load-sample') loadSample();
  if (e.target.id === 'btn-clear-sample') clearSample();
});

/* ---------- rendering: latest scores ---------- */
function scoreClass(v) { return v >= 80 ? 'good' : v >= 60 ? 'mid' : 'low'; }
function renderScores(check) {
  const rows = CONCERNS.map(([k, label]) => {
    const v = check.scores[k];
    return `<div class="score-row"><span>${label}</span><div class="bar"><div class="fill ${scoreClass(v)}" style="width:${v}%"></div></div><b>${v}</b></div>`;
  }).join('');
  $('#last-scores').innerHTML = `<h3>Latest check - ${new Date(check.ts).toLocaleString()}</h3>${rows}` +
    (check.skinAge ? `<p>Estimated skin age: <b>${check.skinAge}</b></p>` : '');
}

/* ---------- concern overlays (YouCam heatmaps, shown right after analysis) ---------- */
let overlayOn = null;
function renderOverlays() {
  const box = $('#overlay-view');
  if (!lastOverlays) { box.innerHTML = ''; return; }
  const chips = CONCERNS.filter(([k]) => lastOverlays.masks[k]).map(([k, label]) =>
    `<button class="chip ochip${overlayOn === k ? ' on' : ''}" data-k="${k}">${label}</button>`).join('');
  box.innerHTML = `<h3>AI-generated concern maps</h3>
    <p class="muted small">Maps from the YouCam analysis, overlaid on your photo. They highlight image regions associated with each score - they are not an explanation of the model's reasoning. Available right after each analysis.</p>
    <div class="ochips">${chips}</div>
    <div class="overlay-wrap"><img class="base" src="${lastOverlays.base_url}" alt="analyzed photo">${overlayOn && lastOverlays.masks[overlayOn] ? `<img class="mask" src="${lastOverlays.masks[overlayOn]}" alt="${overlayOn} heatmap">` : ''}</div>`;
  box.querySelectorAll('.ochip').forEach(b => b.onclick = () => { overlayOn = overlayOn === b.dataset.k ? null : b.dataset.k; renderOverlays(); });
}

/* ---------- progress ---------- */
function renderProgress() {
  const has = checks.length > 0;
  $('#progress-empty').style.display = has ? 'none' : 'block';
  if (!has) return;
  const base = checks[0], latest = checks[checks.length - 1];
  let html = '';
  if (checks.some(c => c.sample)) html += '<p class="sample-badge">Sample journey shown for illustration (sample points below). It never feeds the Verdict tab. <button id="btn-clear-sample" class="linkbtn">Remove sample data</button></p>';
  html += `<p>${checks.length} check(s). Baseline ${new Date(base.ts).toLocaleDateString()}, latest ${new Date(latest.ts).toLocaleDateString()}.</p>`;
  if (lightDiffers(base, latest)) html += `<p class="sample-badge light-badge">Caution: your baseline and latest ${LIGHT_NOTE}.</p>`;
  html += CONCERNS.map(([k, label]) => {
    const series = checks.map(c => c.scores[k]);
    const delta = latest.scores[k] - base.scores[k];
    const cls = delta >= 5 ? 'up' : delta <= -5 ? 'down' : 'flat';
    const arrow = delta >= 5 ? '▲' : delta <= -5 ? '▼' : '•';
    return `<div class="concern-card"><div class="concern-head"><b>${label}</b><span class="delta ${cls}">${arrow} ${delta > 0 ? '+' : ''}${delta} vs baseline</span></div>${spark(series)}<div class="series">${series.map(v => `<span>${v}</span>`).join('')}</div></div>`;
  }).join('');
  $('#progress-content').innerHTML = html;
}
function spark(series) {
  const w = 260, h = 48, max = 100;
  const pts = series.map((v, i) => `${series.length === 1 ? w / 2 : (i / (series.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="spark"><polyline points="${pts}" fill="none" stroke="#6c5ce7" stroke-width="2"/>${series.map((v, i) => `<circle cx="${series.length === 1 ? w / 2 : (i / (series.length - 1)) * w}" cy="${h - (v / max) * h}" r="3" fill="#6c5ce7"/>`).join('')}</svg>`;
}

/* ---------- products ---------- */
function renderProductForm() {
  $('#p-concerns').innerHTML = CONCERNS.map(([k, label]) =>
    `<label class="chip"><input type="checkbox" value="${k}">${label}</label>`).join('');
}
renderProductForm();
$('#product-form').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#p-name').value.trim(); if (!name) return;
  const concerns = [...document.querySelectorAll('#p-concerns input:checked')].map(i => i.value);
  products.push({ id: 'p' + Date.now(), name, concerns, startedTs: Date.now() });
  store.set('st_products', products);
  $('#p-name').value = ''; document.querySelectorAll('#p-concerns input:checked').forEach(i => i.checked = false);
  renderProducts();
};
function renderProducts() {
  $('#product-list').innerHTML = products.length
    ? products.map(p => `<div class="product"><b>${esc(p.name)}</b><span class="muted">Using since ${new Date(p.startedTs).toLocaleDateString()}</span><div>${p.concerns.map(c => `<span class="chip on">${label(c)}</span>`).join('')}</div><button class="del" data-id="${p.id}">Remove</button></div>`).join('')
    : '<div class="empty">No products yet. Add what you are using so the verdict can say what works.</div>';
  document.querySelectorAll('.del').forEach(b => b.onclick = () => {
    products = products.filter(p => p.id !== b.dataset.id); store.set('st_products', products); renderProducts();
  });
}
const label = (k) => (CONCERNS.find(c => c[0] === k) || [k, k])[1];
const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- verdict ---------- */
/* Honest attribution engine. Rules:
   - sample-flagged checks never feed verdict math (disclosure is not isolation)
   - a product verdict needs a check at/before its start AND a follow-up after
   - structural concerns need ~14 days; surface concerns ~3 days
   - wording states association, never proven efficacy                      */
const SURFACE = ['moisture', 'oiliness', 'redness'];
const MIN_DAYS = c => SURFACE.includes(c) ? 3 : 14;
const realChecks = () => checks.filter(c => !c.sample);
function overlapWarn(p, concern) {
  const others = products.filter(q => q.id !== p.id && q.concerns.includes(concern)
    && q.startedTs <= Date.now() && !(q.endedTs && q.endedTs < p.startedTs));
  return others.length ? ` - attribution unclear: ${others.length} product(s) target the same concern` : '';
}
function productVerdict(p, concern) {
  const real = realChecks();
  const pre = real.filter(c => c.ts <= p.startedTs);
  const post = real.filter(c => c.ts > p.startedTs);
  if (!pre.length) return { cls: 'flat', text: 'no check from before you started it - verdict impossible' };
  if (!post.length) return { cls: 'flat', text: 'no follow-up check yet' };
  const latest = post[post.length - 1];
  const days = Math.round((latest.ts - p.startedTs) / 86400000);
  if (days < MIN_DAYS(concern)) return { cls: 'flat', text: `too early to tell (${days}d in; needs ~${MIN_DAYS(concern)}d)` };
  const d = latest.scores[concern] - pre[pre.length - 1].scores[concern];
  const ow = overlapWarn(p, concern) + (lightDiffers(pre[pre.length - 1], latest) ? ` - ${LIGHT_NOTE}` : '');
  if (d >= 5) return { cls: 'up', text: `scores up +${d} since you started (${days}d) - an association, not proof${ow}` };
  if (d <= -5) return { cls: 'down', text: `scores down ${d} since you started (${days}d) - worth reviewing your routine${ow}` };
  return { cls: 'flat', text: `no clear score change since you started (${d > 0 ? '+' : ''}${d} in ${days}d)${ow}` };
}
const PIVOT = {
  moisture: 'hyaluronic acid or ceramides', oiliness: 'niacinamide or salicylic acid',
  redness: 'azelaic acid or centella asiatica', acne: 'benzoyl peroxide or adapalene',
  pore: 'niacinamide or retinoids', texture: 'AHA/BHA exfoliants or retinoids',
  wrinkle: 'retinoids or peptides', radiance: 'vitamin C or gentle exfoliation'
};
function verdictFor(concern) {
  const real = realChecks();
  if (real.length < 2) return null;
  const base = real[0], latest = real[real.length - 1];
  const d = latest.scores[concern] - base.scores[concern];
  const days = Math.max(1, Math.round((latest.ts - base.ts) / 86400000));
  if (d >= 5) return { cls: 'up', text: `improving (+${d} in ${days}d)` };
  if (d <= -5) return { cls: 'down', text: `getting worse (${d} in ${days}d)` };
  return { cls: 'flat', text: `no clear change (${d > 0 ? '+' : ''}${d} in ${days}d)` };
}
function renderReport() {
  const ready = realChecks().length >= 2;
  $('#report-empty').style.display = ready ? 'none' : 'block';
  $('#report-content').innerHTML = '';
  if (!ready) return;
  let html = '';
  if (checks.some(c => c.sample)) html += '<p class="sample-badge">Sample data - the sample journey shows in Progress but never feeds these verdicts. Only your own live analyses count.</p>';
  html += '<h3>What your checks say about your products</h3>';
  if (!products.length) html += '<p class="muted">Add products first so verdicts can name them.</p>';
  html += products.map(p => {
    const vs = p.concerns.map(c => ({ c, v: productVerdict(p, c) }));
    const worst = vs.find(x => x.v.cls === 'down');
    const best = vs.find(x => x.v.cls === 'up');
    const head = worst ? 'Worth reviewing' : best ? 'Trending the right way' : 'No verdict yet';
    const headCls = worst ? 'down' : best ? 'up' : 'flat';
    const pivots = vs.filter(x => x.v.cls === 'down' || (x.v.cls === 'flat' && /no clear/.test(x.v.text)))
      .map(x => `<li class="muted">Not moving on ${label(x.c)}? Ingredients often used for it: ${PIVOT[x.c]}.</li>`).join('');
    return `<div class="product verdict ${headCls}"><div class="vhead">${head}</div><b>${esc(p.name)}</b><ul>${vs.map(x => `<li><span class="delta ${x.v.cls}">${label(x.c)}</span> ${x.v.text}</li>`).join('')}${pivots}</ul></div>`;
  }).join('');
  html += '<p class="muted small">SkinTruth reports score trends during product use. It cannot prove a product caused a change - lighting, weather, hormones and other products all move scores. The 5-point cutoff is an unvalidated heuristic, not statistical or clinical significance. The lighting caution is a rough proxy - an unflagged pair of photos can still differ in light.</p>';
  html += '<h3>Overall</h3>' + CONCERNS.map(([k, l]) => {
    const v = verdictFor(k);
    return v ? `<div class="score-row"><span>${l}</span><span class="delta ${v.cls}">${v.text}</span></div>` : '';
  }).join('');
  $('#report-content').innerHTML = html;
}
