const { SYM_RE } = require("./_changes.js");
const { fetchChart } = require("./_yahoo.js");

module.exports = async (req, res) => {
  const symbol = String((req.query && req.query.symbol) || "").toUpperCase().trim();
  if (!SYM_RE.test(symbol)) return res.status(400).json({ error: "สัญลักษณ์หุ้นไม่ถูกต้อง" });
  try {
    const out = await fetchChart(symbol);
    if (!out) return res.status(502).json({ error: "ดึงข้อมูลราคาไม่ได้" });
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: "ดึงข้อมูลราคาไม่ได้" });
  }
};
