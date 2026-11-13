const crypto = require("crypto");
const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();

// เทียบแบบ constant-time; ไม่ตั้ง APP_PASSCODE = ปฏิเสธทุกคำขอ
function checkPass(req) {
  const expected = process.env.APP_PASSCODE;
  const given = req.headers && req.headers["x-app-pass"];
  if (!expected || !given) return false;
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

module.exports = { checkPass };
