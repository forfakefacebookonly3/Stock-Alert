// อ่าน/เขียน alerts.json บน branch data ผ่าน GitHub Contents API

const BRANCH = "data";
const FILE = "alerts.json";
const NOT_FOUND = "ไม่พบ alerts.json บน branch data — ตรวจ GITHUB_REPO และ branch data";

const url = () => `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${FILE}`;
const headers = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "stock-alert",
  "Content-Type": "application/json",
});

async function readData(fetchImpl = fetch) {
  const r = await fetchImpl(`${url()}?ref=${BRANCH}`, { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (r.status === 404) throw new Error(NOT_FOUND);
  if (!r.ok) throw new Error(`อ่านข้อมูลไม่ได้ (${r.status})`);
  const j = await r.json();
  const text = Buffer.from(j.content, "base64").toString("utf8").replace(/^﻿/, "");
  return { data: JSON.parse(text), sha: j.sha };
}

async function writeData(data, sha, message, fetchImpl = fetch) {
  const body = {
    message,
    branch: BRANCH,
    content: Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64"),
  };
  if (sha) body.sha = sha;
  const r = await fetchImpl(url(), { method: "PUT", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return { ok: r.ok, status: r.status };
}

async function mutate(fn, message, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, sha } = await readData(fetchImpl);
    const out = fn(data);
    if (out.error) return { error: out.error, status: 400 };
    const w = await writeData(out.data, sha, message, fetchImpl);
    if (w.ok) return { data: out.data };
    if (w.status !== 409 && w.status !== 422) return { error: "บันทึกไม่สำเร็จ ลองอีกครั้ง", status: 502 };
  }
  return { error: "บันทึกไม่สำเร็จ ลองอีกครั้ง", status: 409 };
}

function publicView(data) {
  return {
    version: data.version,
    heartbeat: data.heartbeat || null,
    symbols: data.symbols || [],
    devices: (data.push || []).filter((p) => p.ok !== false).length,
    vapid_public_key: process.env.VAPID_PUBLIC_KEY || null,
  };
}

module.exports = { NOT_FOUND, readData, writeData, mutate, publicView };
