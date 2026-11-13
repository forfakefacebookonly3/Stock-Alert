const { applySubscription } = require("./_changes.js");
const { mutate, publicView } = require("./_store.js");
const { checkPass } = require("./_auth.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST เท่านั้น" });
  if (!checkPass(req)) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  try {
    const out = await mutate((d) => applySubscription(d, req.body), "alert: push subscription");
    if (out.error) return res.status(out.status).json({ error: out.error });
    return res.status(200).json(publicView(out.data));
  } catch (e) {
    console.error("subscribe failed:", e && e.message);
    return res.status(502).json({ error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" });
  }
};
