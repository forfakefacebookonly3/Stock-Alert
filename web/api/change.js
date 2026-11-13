const { applyChange, SYM_RE } = require("./_changes.js");
const { mutate, publicView } = require("./_store.js");
const { checkPass } = require("./_auth.js");
const { fetchChart } = require("./_yahoo.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST เท่านั้น" });
  if (!checkPass(req)) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  const action = req.body && typeof req.body === "object" ? req.body : {};
  const symbol = String(action.symbol || "").toUpperCase().trim();
  try {
    if (action.action === "add_symbol") {
      if (!SYM_RE.test(symbol)) return res.status(400).json({ error: "สัญลักษณ์หุ้นไม่ถูกต้อง" });
      const chart = await fetchChart(symbol).catch(() => null);
      if (!chart) return res.status(400).json({ error: `ไม่พบข้อมูลราคาของ ${symbol}` });
    }
    const out = await mutate((d) => applyChange(d, action), `alert: ${action.action} ${symbol}`);
    if (out.error) return res.status(out.status).json({ error: out.error });
    return res.status(200).json(publicView(out.data));
  } catch (e) {
    console.error("change failed:", e && e.message);
    return res.status(502).json({ error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" });
  }
};
