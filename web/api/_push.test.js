const test = require("node:test");
const assert = require("node:assert/strict");
const { sendAll } = require("./_push.js");

const sub = (n, ok = true) => ({ endpoint: "https://push.example/" + n, keys: { p256dh: "p", auth: "a" }, ok });
const payload = { title: "t", body: "b", url: "/" };

// webpush ปลอม: results[endpoint] = statusCode ที่จะ throw (ไม่ระบุ = สำเร็จ)
function fakeWebpush(results = {}) {
  const calls = [];
  return {
    calls,
    sendNotification: async (s, body) => {
      calls.push({ endpoint: s.endpoint, keys: s.keys, body });
      const code = results[s.endpoint];
      if (code) { const e = new Error("push failed"); e.statusCode = code; throw e; }
    },
  };
}

test("sends the JSON payload to every ok device only", async () => {
  const wp = fakeWebpush();
  const data = { push: [sub(1), sub(2, false), sub(3)] };
  const out = await sendAll(data, payload, wp);
  assert.deepEqual(wp.calls.map((c) => c.endpoint), ["https://push.example/1", "https://push.example/3"]);
  assert.deepEqual(JSON.parse(wp.calls[0].body), payload);
  assert.deepEqual(wp.calls[0].keys, { p256dh: "p", auth: "a" });
  assert.equal(out.sent, 2);
  assert.equal(out.failed, 0);
  assert.equal(out.changed, false);
});

test("404/410 mark the device as gone without touching the input", async () => {
  const wp = fakeWebpush({ "https://push.example/1": 410, "https://push.example/2": 404 });
  const data = { push: [sub(1), sub(2), sub(3)] };
  const out = await sendAll(data, payload, wp);
  assert.deepEqual(out.data.push.map((p) => p.ok), [false, false, true]);
  assert.deepEqual(data.push.map((p) => p.ok), [true, true, true]);
  assert.equal(out.sent, 1);
  assert.equal(out.failed, 2);
  assert.equal(out.changed, true);
});

test("other errors count as failed but keep the device", async () => {
  const wp = fakeWebpush({ "https://push.example/1": 500 });
  const out = await sendAll({ push: [sub(1)] }, payload, wp);
  assert.equal(out.sent, 0);
  assert.equal(out.failed, 1);
  assert.equal(out.changed, false);
  assert.equal(out.data.push[0].ok, true);
});

test("no devices", async () => {
  const out = await sendAll({ push: [] }, payload, fakeWebpush());
  assert.deepEqual({ sent: out.sent, failed: out.failed, changed: out.changed }, { sent: 0, failed: 0, changed: false });
});
