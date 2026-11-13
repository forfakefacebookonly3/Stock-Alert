const test = require("node:test");
const assert = require("node:assert/strict");

process.env.GITHUB_REPO = "me/stock-alert";
process.env.GITHUB_TOKEN = "t0ken";
process.env.VAPID_PUBLIC_KEY = "PUBKEY";
const S = require("./_store.js");
const { emptyData, applyChange } = require("./_changes.js");

const b64 = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// GitHub ปลอม: เก็บไฟล์เดียวและ sha; putStatuses กำหนดผลของ PUT ตามลำดับ
function fakeGitHub(initial, putStatuses = []) {
  const state = { data: initial, sha: initial ? "sha1" : null, puts: [], gets: 0 };
  const fetchImpl = async (url, opts = {}) => {
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/me\/stock-alert\/contents\/alerts\.json/);
    assert.equal(opts.headers.Authorization, "Bearer t0ken");
    if (!opts.method || opts.method === "GET") {
      state.gets++;
      assert.match(url, /\?ref=data$/);
      if (!state.data) return res(404, {});
      return res(200, { content: b64(state.data), sha: state.sha });
    }
    const body = JSON.parse(opts.body);
    state.puts.push(body);
    const status = putStatuses.shift() || 200;
    if (status === 200) {
      state.data = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
      state.sha = "sha" + (state.puts.length + 1);
    }
    return res(status, {});
  };
  return { state, fetchImpl };
}

test("readData decodes the file; missing file gives empty data", async () => {
  const d = emptyData();
  d.symbols.push({ symbol: "ปตท", sl: null, tp: null, alerts: [] }); // ตรวจ UTF-8
  const gh = fakeGitHub(d);
  assert.deepEqual(await S.readData(gh.fetchImpl), { data: d, sha: "sha1" });
  const none = fakeGitHub(null);
  assert.deepEqual(await S.readData(none.fetchImpl), { data: emptyData(), sha: null });
});

test("writeData sends branch, sha, message and base64 content", async () => {
  const gh = fakeGitHub(emptyData());
  const d = emptyData();
  d.heartbeat = "2026-11-13";
  const out = await S.writeData(d, "sha1", "msg", gh.fetchImpl);
  assert.deepEqual(out, { ok: true, status: 200 });
  assert.equal(gh.state.puts[0].branch, "data");
  assert.equal(gh.state.puts[0].sha, "sha1");
  assert.equal(gh.state.puts[0].message, "msg");
  assert.deepEqual(gh.state.data, d);
});

test("mutate applies fn and writes", async () => {
  const gh = fakeGitHub(emptyData());
  const out = await S.mutate((d) => applyChange(d, { action: "add_symbol", symbol: "NVDA" }), "m", gh.fetchImpl);
  assert.equal(out.data.symbols[0].symbol, "NVDA");
  assert.equal(gh.state.data.symbols[0].symbol, "NVDA");
});

test("mutate returns fn's error without writing", async () => {
  const gh = fakeGitHub(emptyData());
  const out = await S.mutate((d) => applyChange(d, { action: "set_sl", symbol: "NVDA", price: 1 }), "m", gh.fetchImpl);
  assert.equal(out.status, 400);
  assert.match(out.error, /ไม่พบ/);
  assert.equal(gh.state.puts.length, 0);
});

test("mutate retries once on conflict, then gives up", async () => {
  const once = fakeGitHub(emptyData(), [409]);
  const ok = await S.mutate((d) => applyChange(d, { action: "add_symbol", symbol: "NVDA" }), "m", once.fetchImpl);
  assert.equal(ok.data.symbols.length, 1);
  assert.equal(once.state.gets, 2);
  assert.equal(once.state.puts.length, 2);

  const twice = fakeGitHub(emptyData(), [409, 409]);
  const bad = await S.mutate((d) => applyChange(d, { action: "add_symbol", symbol: "NVDA" }), "m", twice.fetchImpl);
  assert.equal(bad.status, 409);
  assert.match(bad.error, /ลองอีกครั้ง/);
  assert.equal(twice.state.puts.length, 2);
});

test("publicView hides push subscriptions", () => {
  const d = emptyData();
  d.push = [{ endpoint: "https://a", keys: {}, ok: true }, { endpoint: "https://b", keys: {}, ok: false }];
  const v = S.publicView(d);
  assert.equal(v.push, undefined);
  assert.equal(v.devices, 1);
  assert.equal(v.vapid_public_key, "PUBKEY");
  assert.deepEqual(v.symbols, []);
});
