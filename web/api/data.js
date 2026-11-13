const { NOT_FOUND, readData, publicView } = require("./_store.js");

module.exports = async (req, res) => {
  try {
    const { data } = await readData();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(publicView(data));
  } catch (e) {
    console.error("data failed:", e && e.message);
    return res.status(502).json({ error: e && e.message === NOT_FOUND ? NOT_FOUND : "อ่านข้อมูลไม่ได้" });
  }
};
