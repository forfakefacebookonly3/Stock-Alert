const { readData, publicView } = require("./_store.js");

module.exports = async (req, res) => {
  try {
    const { data } = await readData();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(publicView(data));
  } catch (e) {
    return res.status(502).json({ error: "อ่านข้อมูลไม่ได้" });
  }
};
