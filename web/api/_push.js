// ส่ง Web Push ให้ทุกเครื่องที่ยังใช้ได้ — webpush ถูกส่งเข้ามาเพื่อให้ test ได้
async function sendAll(data, payload, webpush) {
  const out = JSON.parse(JSON.stringify(data));
  out.push = out.push || [];
  const body = JSON.stringify(payload);
  let sent = 0, failed = 0, changed = false;
  for (const sub of out.push) {
    if (sub.ok === false) continue;
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      sent++;
    } catch (e) {
      failed++;
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        sub.ok = false;
        changed = true;
      }
    }
  }
  return { sent, failed, data: out, changed };
}

module.exports = { sendAll };
