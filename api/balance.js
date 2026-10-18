// GET /api/balance -> { units } (free endpoint, lets the UI show remaining demo quota)
const { getBalance } = require('./_youcam.js');

module.exports = async (req, res) => {
  try {
    const b = await getBalance();
    const units = (b.results || []).reduce((s, r) => s + (r.amount_dec || 0), 0);
    res.status(200).json({ units });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
