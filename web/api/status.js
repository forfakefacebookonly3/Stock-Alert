// เวลารันสำเร็จล่าสุดของ workflow check.yml
module.exports = async (req, res) => {
  const repo = process.env.GITHUB_REPO;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "stock-alert" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let last_run = null;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/check.yml/runs?status=success&per_page=1`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const j = await r.json();
      const run = j.workflow_runs && j.workflow_runs[0];
      last_run = run ? run.updated_at : null;
    }
  } catch (e) {
    last_run = null;
  }
  res.setHeader("Cache-Control", "s-maxage=120");
  return res.status(200).json({ last_run });
};
