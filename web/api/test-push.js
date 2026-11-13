const webpush = require("web-push");
const { readData, writeData } = require("./_store.js");
const { checkPass } = require("./_auth.js");
const { sendAll } = require("./_push.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST เท่านั้น" });
  if (!checkPass(req)) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const { data, sha } = await readData();
    const out = await sendAll(data, { title: "Stock Alert", body: "ทดสอบ noti สำเร็จ ✅", url: "/" }, webpush);
    if (out.changed) await writeData(out.data, sha, "alert: mark expired push devices");
    if (out.sent + out.failed === 0) return res.status(400).json({ error: "ยังไม่มีเครื่องที่เปิด noti" });
    return res.status(200).json({ sent: out.sent, failed: out.failed });
  } catch (e) {
    console.error("test-push failed:", e && e.message);
    return res.status(502).json({ error: "ส่ง noti ไม่สำเร็จ" });
  }
};
