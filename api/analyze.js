// POST /api/analyze  { image: "data:image/png;base64,..." }
// -> { task_id }  (units are only consumed when the task later succeeds)
const { startAnalysis } = require('./_youcam.js');

// Simple per-instance token bucket: demo protection for the shared free-tier quota.
const bucket = { tokens: 20, ts: Date.now() };
function allow() {
  const now = Date.now();
  bucket.tokens = Math.min(20, bucket.tokens + (now - bucket.ts) / 60000 * 5); // 5/min refill
  bucket.ts = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1; return true;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!allow()) return res.status(429).json({ error: 'rate limited - please try again in a minute (demo quota protection)' });
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { image } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(image || '');
    if (!m) return res.status(400).json({ error: 'image must be a PNG or JPEG data URL' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'image too large (max 8 MB)' });
    const taskId = await startAnalysis(buf);
    res.status(200).json({ task_id: taskId });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message, detail: e.detail || null });
  }
};
