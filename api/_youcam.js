const BASE = process.env.YOUCAM_API_BASE || 'https://yce-api-01.makeupar.com';
const KEY = process.env.YOUCAM_API_KEY;

// The 13 valid SD skin-analysis actions (verified live 2026-10-18).
// App panel keeps 8 to balance insight vs unit cost (~4.5 units/concern).
const PANEL = ['wrinkle','pore','texture','acne','moisture','oiliness','redness','radiance'];

async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) { const e = new Error(json.error || `HTTP ${r.status}`); e.detail = json; throw e; }
  return json;
}

async function startAnalysis(pngBuffer) {
  if (!KEY) { const e = new Error('YOUCAM_API_KEY not configured'); e.statusCode = 500; throw e; }
  const init = await api('POST', '/s2s/v2.0/file', {
    files: [{ content_type: 'image/png', file_name: `check_${Date.now()}.png`, file_size: pngBuffer.length }],
  });
  const f = init.data.files[0];
  const put = f.requests[0];
  const up = await fetch(put.url, { method: 'PUT', headers: put.headers, body: pngBuffer });
  if (!up.ok) { const e = new Error(`upload failed: ${up.status}`); e.statusCode = 502; throw e; }
  const task = await api('POST', '/s2s/v2.0/task/skin-analysis', {
    src_file_id: f.file_id, dst_actions: PANEL, format: 'json',
  });
  return task.data.task_id;
}

async function getTask(taskId) {
  return api('GET', `/s2s/v2.0/task/skin-analysis/${taskId}`);
}

async function getBalance() {
  return api('GET', '/s2s/v1.0/client/credit');
}

module.exports = { startAnalysis, getTask, getBalance, PANEL };
