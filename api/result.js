// GET /api/result?task_id=... -> { status, scores?, skin_age?, masks?, error? }
const { getTask } = require('./_youcam.js');

module.exports = async (req, res) => {
  const taskId = (req.query && req.query.task_id) || new URL(req.url, 'http://x').searchParams.get('task_id');
  if (!taskId) return res.status(400).json({ error: 'task_id required' });
  try {
    const t = await getTask(taskId);
    const d = t.data;
    if (d.task_status !== 'success') {
      return res.status(200).json({ status: d.task_status, error: d.error || null, error_message: d.error_message || null });
    }
    const scores = {};
    let skinAge = null;
    let baseUrl = null;
    const masks = {};
    for (const o of d.results.output) {
      if (o.ui_score != null) scores[o.type] = o.ui_score;
      if (o.mask_urls && o.mask_urls.length && o.ui_score != null) masks[o.type] = o.mask_urls[0];
      if (o.type === 'skin_age' && (o.skin_age != null || o.age != null || o.value != null)) skinAge = o.skin_age ?? o.age ?? o.value;
      if (o.type === 'resize_image') baseUrl = (o.mask_urls && o.mask_urls[0]) || o.url || baseUrl;
    }
    // Overlay URLs are signed and expire ~2h after analysis: show them right away, never persist.
    res.status(200).json({ status: 'success', scores, skin_age: skinAge, masks, base_url: baseUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
