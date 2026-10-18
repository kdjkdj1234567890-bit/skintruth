/* SkinTruth - progress tracker on top of the YouCam AI Skin Analysis API.
   Data lives in localStorage: checks + products. Scores come from the API. */
const CONCERNS = [
  ['moisture','Moisture'],['oiliness','Oil balance'],['redness','Redness'],['acne','Acne'],
  ['pore','Pores'],['texture','Texture'],['wrinkle','Wrinkles'],['radiance','Radiance'],
];
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
let checks = store.get('st_checks', []);
let products = store.get('st_products', []);
let currentImage = null; // PNG data URL, face-cropped by the user flow

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
function setImage(dataUrl) {
  currentImage = dataUrl;
  const p = $('#preview'); p.src = dataUrl; p.hidden = false;
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
    if (res.status === 'error') throw new Error(res.error_message || res.error || 'analysis failed');
    const check = { id: 'c' + Date.now(), ts: Date.now(), scores: res.scores, skinAge: res.skin_age, thumb: currentImage };
    checks.push(check); store.set('st_checks', checks);
    st.textContent = 'Done.';
    renderScores(check); refreshQuota();
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
    if (r.status !== 'running') return r;
  }
  throw new Error('timed out waiting for analysis');
}

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

/* ---------- progress ---------- */
function renderProgress() {
  const has = checks.length > 0;
  $('#progress-empty').style.display = has ? 'none' : 'block';
  if (!has) return;
  const base = checks[0], latest = checks[checks.length - 1];
  let html = '';
  if (checks.some(c => c.sample)) html += '<p class="sample-badge">Sample data - this history is illustrative. Only your own live analyses are real measurements.</p>';
  html += `<p>${checks.length} check(s). Baseline ${new Date(base.ts).toLocaleDateString()}, latest ${new Date(latest.ts).toLocaleDateString()}.</p>`;
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
function verdictFor(concern) {
  if (checks.length < 2) return null;
  const base = checks[0], latest = checks[checks.length - 1];
  const d = latest.scores[concern] - base.scores[concern];
  const days = Math.max(1, Math.round((latest.ts - base.ts) / 86400000));
  if (d >= 5) return { cls: 'up', text: `improving (+${d} in ${days}d)` };
  if (d <= -5) return { cls: 'down', text: `getting worse (${d} in ${days}d)` };
  return { cls: 'flat', text: `no clear change (${d > 0 ? '+' : ''}${d} in ${days}d)` };
}
function renderReport() {
  const ready = checks.length >= 2;
  $('#report-empty').style.display = ready ? 'none' : 'block';
  if (!ready) return;
  let html = '';
  if (checks.some(c => c.sample)) html += '<p class="sample-badge">Sample data - the history behind these verdicts is illustrative. Only your own live analyses are real measurements.</p>';
  html += '<h3>What is working</h3>';
  if (!products.length) html += '<p class="muted">Add products first so verdicts can name them.</p>';
  html += products.map(p => {
    const vs = p.concerns.map(c => ({ c, v: verdictFor(c) })).filter(x => x.v);
    if (!vs.length) return `<div class="product"><b>${esc(p.name)}</b><p class="muted">No data yet.</p></div>`;
    const worst = vs.find(x => x.v.cls === 'down');
    const best = vs.find(x => x.v.cls === 'up');
    const head = worst ? 'Consider dropping or swapping' : best ? 'Keep using - it is working' : 'No measurable effect yet';
    const headCls = worst ? 'down' : best ? 'up' : 'flat';
    return `<div class="product verdict ${headCls}"><div class="vhead">${head}</div><b>${esc(p.name)}</b><ul>${vs.map(x => `<li><span class="delta ${x.v.cls}">${label(x.c)}</span> ${x.v.text}</li>`).join('')}</ul></div>`;
  }).join('');
  html += '<h3>Overall</h3>' + CONCERNS.map(([k, l]) => {
    const v = verdictFor(k);
    return v ? `<div class="score-row"><span>${l}</span><span class="delta ${v.cls}">${v.text}</span></div>` : '';
  }).join('');
  $('#report-content').innerHTML = html;
}
