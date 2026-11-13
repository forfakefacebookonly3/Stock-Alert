# Spec: แอป Alert — กราฟ + SL/TP + แจ้งเตือนราคา (PWA)

วันที่: 2026-11-13
สถานะ: อนุมัติ design แล้ว (brainstorming) — รอผู้ใช้รีวิว spec

## เป้าหมาย

แอปมือถือใช้คนเดียว สำหรับหุ้นสหรัฐและหุ้นไทยจำนวนน้อย (ไม่เกิน 20 ตัว):

- ดูกราฟแท่งรายวันที่บอกชัดว่าขาขึ้นหรือขาลง
- วางเส้น Stop Loss / Take Profit / alert ราคาได้จากหน้าแอป
- ขึ้น notification บนมือถือเมื่อราคาแตะ (ข้อมูลช้า ~15 นาทีรับได้)
- ฟรีตลอดไป ไม่มีบริการที่ต้องจ่ายเงิน

## การตัดสินใจที่ตกลงกับผู้ใช้แล้ว

| หัวข้อ | ตัดสินใจ |
|---|---|
| ความสัมพันธ์กับ Stock News | แอปใหม่แยก repo ใช้แนวทางดึงราคาแบบเดียวกัน (`yfinance`, `.BK` = หุ้นไทย) Stock News ไม่ถูกแก้ ยกเว้นเพิ่ม `Alert/` ใน `.gitignore` |
| รูปแบบแอป | PWA ติดตั้งจากเว็บ (Android Chrome) ไม่ทำไฟล์ APK |
| ที่มา SL/TP | ผู้ใช้ตั้งเอง แอปแสดงเส้นช่วยดูแต่ไม่เสนอตัวเลข |
| รายชื่อหุ้น | รายชื่อของแอปเอง ไม่ผูกกับ `config.yaml` ของ Stock News |
| กราฟ | แท่งรายวันย้อนหลัง 1 ปี แท่งล่าสุดใช้ราคาล่าสุด ไม่มีกราฟระหว่างวัน |
| ช่องทางแจ้งเตือน | Web Push ของแอปอย่างเดียว ไม่ส่ง Telegram |
| โครงสร้างพื้นฐาน | public GitHub repo ใหม่ทั้งโค้ดและข้อมูล (แนวทาง A1) + Vercel Hobby |
| หน้าจอหลัก | แบบ A: หน้ารายการหุ้น → แตะเข้าหน้ากราฟเต็มจอ |

## 1. สถาปัตยกรรม

```
มือถือ (PWA บน Vercel)
  ├─ GET  /api/candles   → Yahoo chart API (แท่งรายวัน + ราคาล่าสุด)
  ├─ GET  /api/data      → อ่าน alerts.json จาก branch data
  ├─ POST /api/change    → แก้ alerts.json แล้ว commit ลง branch data
  ├─ POST /api/subscribe → บันทึก push subscription ลง alerts.json
  ├─ POST /api/test-push → ส่ง noti ทดสอบ
  └─ GET  /api/status    → เวลารันล่าสุดของตัวเช็ก

GitHub Actions (public repo, cron ทุก 15 นาทีช่วงตลาดเปิด จ.–ศ.)
  └─ checker: อ่าน alerts.json → ดึงราคาหุ้นที่มี alert ค้าง
       → ราคาแตะ → ส่ง Web Push → ทำเครื่องหมาย fired → commit branch data
```

- Repo: public repo ใหม่ โฟลเดอร์ `Alert/` ในเครื่องเป็น git repo ของตัวเอง
- Branch `main` = โค้ด, branch `data` = `alerts.json` ไฟล์เดียว Vercel deploy เฉพาะ `main` (ปิด deploy ของ `data` ใน `vercel.json`) การตั้ง alert จึงไม่สั่ง deploy
- ไม่เก็บไฟล์ราคาใน repo กราฟดึงสดผ่าน `/api/candles`
- GitHub Actions ใน public repo ใช้ runner มาตรฐานฟรี ไม่หักวงเงินของบัญชี

## 2. โครงสร้างไฟล์

```
Alert/
  web/                       ← Vercel Root Directory
    index.html  style.css  manifest.webmanifest  sw.js  icons/
    app.js                   หน้าจอ/การนำทาง/เรียก API
    chart.js                 ห่อ lightweight-charts: แท่ง, MA, เส้นราคา, แตะค้าง
    logic.js                 pure: แนวโน้ม, MA, %ห่าง, ตลาด/สกุลเงิน, ตลาดเปิดอยู่ไหม (ช่วงเวลาเดียวกับ hours.py)
    logic.test.js
    vendor/lightweight-charts.js
    api/
      candles.js  data.js  change.js  subscribe.js  test-push.js  status.js
      _store.js              อ่าน/เขียน alerts.json ผ่าน GitHub Contents API
      _changes.js            pure: applyChange(data, action) → data ใหม่ หรือ error
      _changes.test.js
  checker/
    check.py                 จุดเข้า: โหลด → ดึงราคา → ประเมิน → push → บันทึก
    rules.py                 pure: evaluate(data, prices, now) → (data ใหม่, รายการที่ยิง)
    hours.py                 pure: ตลาดไหนเปิดอยู่ ณ เวลา UTC ที่กำหนด
    prices.py                ดึงราคาล่าสุดด้วย yfinance
    push.py                  ส่ง Web Push ด้วย pywebpush
  tests/                     pytest ของ rules, hours
  .github/workflows/check.yml
  requirements.txt  README.md
  (vercel.json และ package.json อยู่ใน web/ เพราะเป็น Root Directory ของ Vercel)
```

## 3. ข้อมูล — `alerts.json` (branch `data`)

```json
{
  "version": 1,
  "heartbeat": "2026-11-13",
  "push": [
    {"endpoint": "https://fcm.googleapis.com/...", "keys": {"p256dh": "...", "auth": "..."}, "ok": true}
  ],
  "symbols": [
    {
      "symbol": "NVDA",
      "sl": {"price": 178, "status": "active"},
      "tp": {"price": 210, "status": "fired", "fired_at": "2026-11-13T15:45:00Z", "fired_price": 210.4},
      "alerts": [
        {"id": "a1", "price": 200, "dir": "above", "status": "active"}
      ]
    },
    {"symbol": "PTT.BK", "sl": null, "tp": null, "alerts": []}
  ]
}
```

- `symbol`: รูปแบบ Yahoo หุ้นไทยลงท้าย `.BK` หน้าจอแสดงโดยตัด `.BK` และมีป้าย `TH`
- `status`: `active` หรือ `fired`
- `dir` ของ alert ทั่วไป: กำหนดตอนสร้าง — ราคาที่ตั้ง > ราคาล่าสุด = `above` มิฉะนั้น `below`
- `push`: เก็บได้หลายเครื่อง `ok: false` = ปลายทางหมดอายุ
- `/api/data` ตัด `push` ออกก่อนส่งให้หน้าแอป (ส่งแค่จำนวนเครื่องที่ `ok`)

## 4. กติกา alert

- ต่อหุ้น: SL 1 เส้น, TP 1 เส้น, alert ทั่วไปไม่เกิน 5 เส้น รายชื่อไม่เกิน 20 ตัว
- SL ยิงเมื่อราคาล่าสุด ≤ ราคา SL; TP ยิงเมื่อ ≥ ราคา TP; alert ทั่วไปยิงตาม `dir`
- ยิงครั้งเดียว: เปลี่ยนเป็น `fired` พร้อม `fired_at`, `fired_price` ผู้ใช้เปิดใช้ซ้ำได้ (กลับเป็น `active`) หรือลบ
- เทียบกับราคาล่าสุด ณ เวลาที่เช็กเท่านั้น ราคาที่แตะแล้วกลับระหว่างสองรอบจะไม่แจ้ง
- ไม่ตรวจความสมเหตุสมผลของ SL/TP (เช่น SL สูงกว่าราคา) — ถ้าเงื่อนไขเป็นจริงอยู่แล้วตอนตั้ง จะยิงในรอบเช็กถัดไป หน้าแอปเตือนก่อนบันทึก
- ข้อความ noti: `NVDA แตะ SL 178.00 (ล่าสุด 177.60)` / `แตะ TP` / `ขึ้นถึง` / `ลงถึง` แตะ noti เปิดหน้ากราฟหุ้นนั้น

## 5. หน้าแอป

### 5.1 หน้าจอ
1. **รายการหุ้น** — ต่อแถว: ชื่อ, ป้าย `TH`, ราคา, % เปลี่ยนจากวันก่อน, ป้ายแนวโน้ม, สรุป SL/TP/จำนวน alert; ปุ่ม "＋ เพิ่มหุ้น"; มุมบนแสดง "เช็กล่าสุด HH:MM"
2. **กราฟ** — แท่งรายวัน 1 ปี, MA50 (ทึบ), MA200 (ประ), เส้น high/low 52 สัปดาห์ (จาง), เส้น SL แดง / TP เขียว / alert เหลือง / fired เทา, ป้ายแนวโน้มมุมบน, ปุ่มล่าง 3 ปุ่ม: SL, TP, ＋Alert; รายการเส้นที่ตั้งไว้ใต้ปุ่ม พร้อมแก้/ลบ/เปิดใช้ซ้ำ; ปุ่มลบหุ้น
3. **แผ่นตั้งราคา** (bottom sheet) — ช่องราคา, ปุ่ม +/−, % ห่างจากราคาล่าสุด, บันทึก/ยกเลิก
4. **ตั้งค่า** — ช่องรหัสผ่านของแอป, ปุ่มเปิด noti, ปุ่ม "ทดสอบ noti", จำนวนเครื่องที่รับ noti

### 5.2 การตั้ง alert
- ปุ่ม SL/TP/＋Alert → แผ่นตั้งราคา เติมราคาเดิม (ถ้ามี) หรือราคาล่าสุด
- แตะค้างบนกราฟ → แผ่นตั้งราคา เติมราคา ณ จุดที่แตะ พร้อมตัวเลือก SL / TP / Alert
- ไม่มีการลากเส้นบนกราฟ

### 5.3 แนวโน้ม (`logic.js`)
- **ขาขึ้น**: ราคา > MA50 และ MA50 > MA200
- **ขาลง**: ราคา < MA50 และ MA50 < MA200
- **ไซด์เวย์**: กรณีอื่น
- ข้อมูลไม่พอคำนวณ MA200: ไม่แสดงป้าย
- `/api/candles` ดึงย้อนหลัง 2 ปีเพื่อให้ MA200 ครบตลอดช่วง 1 ปีที่แสดง

### 5.4 PWA
- `manifest.webmanifest` + ไอคอน + `sw.js` (รับ `push`, แสดง notification, `notificationclick` เปิด `/#/s/<symbol>`)
- Service worker cache เฉพาะไฟล์หน้าแอป ไม่ cache คำตอบ API
- หน้าแอปเก็บ candles ล่าสุดต่อหุ้นและรหัสผ่านใน `localStorage`

## 6. API (Vercel serverless, Node)

| Endpoint | ต้องมีรหัสผ่าน | หน้าที่ |
|---|---|---|
| `GET /api/candles?symbol=` | ไม่ | เรียก Yahoo `v8/finance/chart` (`range=2y`, `interval=1d`) คืน `{candles:[{t,o,h,l,c}], price, prevClose, currency}`; `Cache-Control: s-maxage=300` |
| `GET /api/data` | ไม่ | คืน `alerts.json` ที่ตัด `push` ออก |
| `POST /api/change` | ใช่ | body `{action, ...}` → `applyChange` → commit |
| `POST /api/subscribe` | ใช่ | เพิ่ม/แทนที่ subscription ตาม `endpoint` |
| `POST /api/test-push` | ใช่ | ส่ง noti ทดสอบไปทุกเครื่องที่ `ok` |
| `GET /api/status` | ไม่ | เวลารันสำเร็จล่าสุดของ workflow `check` จาก GitHub Actions API; `s-maxage=120` |

- รหัสผ่าน: header `x-app-pass` เทียบกับ env `APP_PASSCODE` แบบ constant-time ผิด = 401
- `action` ของ `/api/change`: `add_symbol`, `remove_symbol`, `set_sl`, `set_tp`, `clear_sl`, `clear_tp`, `add_alert`, `update_alert`, `remove_alert`, `rearm` (ระบุ `sl`/`tp`/alert id)
- `add_symbol`: ตรวจรูปแบบ (`^[A-Z0-9.\-]{1,12}$`) และเรียก candles ยืนยันว่ามีข้อมูลก่อนเพิ่ม
- ราคา: ตัวเลข > 0
- `_store.js` เขียนด้วย GitHub Contents API พร้อม `sha` ถ้าได้ 409 ให้อ่านใหม่ → `applyChange` ซ้ำ → เขียนอีก 1 ครั้ง แล้วจึงคืน error

## 7. ตัวเช็ก (`checker/`, GitHub Actions)

### 7.1 ตารางเวลา (`check.yml`)
- `*/15 3-9 * * 1-5` — ตลาดไทย (10:00–16:59 น. ไทย)
- `*/15 13-21 * * 1-5` — ตลาดสหรัฐ ครอบทั้งเวลาออมแสงและเวลาปกติ (20:00–04:59 น. ไทย)
- `workflow_dispatch` สำหรับกดรันเอง
- `concurrency` กลุ่มเดียว ไม่ยกเลิกรอบที่กำลังรัน

### 7.2 ขั้นตอนต่อรอบ
1. checkout branch `data` อ่าน `alerts.json`
2. `hours.py` บอกว่าตลาดไหนอยู่ในช่วงเวลา → เลือกหุ้นของตลาดนั้นที่มีเส้น `active` อย่างน้อย 1 เส้น ถ้าไม่มี ข้ามไปข้อ 6 (เหลือแค่ตรวจ `heartbeat`)
3. `prices.py` ดึงราคาล่าสุดของหุ้นที่เลือก (ตัวที่ดึงไม่ได้ = ข้าม)
4. `rules.evaluate` คืนข้อมูลใหม่และรายการที่ยิง
5. ส่ง Web Push ทุกเครื่องที่ `ok`; ได้ 404/410 → ตั้ง `ok: false`
6. ถ้าข้อมูลเปลี่ยน หรือ `heartbeat` ไม่ใช่วันนี้ → เขียนไฟล์ commit และ push (`git pull --rebase` ก่อน push)

- Log ไม่พิมพ์ endpoint ของ push
- ทำเครื่องหมาย `fired` เฉพาะเมื่อส่ง push สำเร็จอย่างน้อย 1 เครื่อง มิฉะนั้นเส้นยัง `active` เพื่อให้รอบถัดไปลองใหม่ (รวมกรณียังไม่มีเครื่องที่เปิด noti)

### 7.3 กฎ 60 วัน
Scheduled workflow ใน public repo ถูกปิดอัตโนมัติถ้า repo ไม่มีความเคลื่อนไหว 60 วัน ตัวเช็ก commit `heartbeat` วันละครั้ง (รอบแรกของวัน แม้ไม่มี alert ค้าง) ยังไม่ยืนยันว่า commit บน branch `data` นับเป็นความเคลื่อนไหว — ต้องตรวจตอนติดตั้ง ถ้าไม่นับ ให้ย้าย heartbeat ไปเป็นไฟล์บน `main` (และให้ Vercel ข้าม deploy ของ commit นั้น) ไม่ว่ากรณีใด หน้าแอปมีคำเตือน "ตัวเช็กไม่ทำงาน" (ข้อ 8) เป็นตัวจับ

## 8. การรับมือข้อผิดพลาด

| เหตุการณ์ | พฤติกรรม |
|---|---|
| `/api/candles` ล้มเหลว | แสดง candles จาก `localStorage` พร้อมป้าย "ข้อมูลเก่า"; ไม่มีของเก่า = ข้อความ "ดึงกราฟไม่ได้" + ปุ่มลองใหม่ |
| ตัวเช็กดึงราคาบางตัวไม่ได้ | ข้ามตัวนั้น ตัวอื่นทำต่อ |
| `/api/status` บอกว่ารันล่าสุดเกิน 45 นาที ขณะตลาดของหุ้นในรายการเปิด | แถบเตือนสีเหลืองบนหน้ารายการ |
| ไม่มีเครื่องที่ `ok` | แถบ "ยังไม่ได้เปิด noti" พร้อมปุ่มไปหน้าตั้งค่า |
| รหัสผ่านผิด (401) | ไม่บันทึก เปิดหน้าตั้งค่าให้ใส่ใหม่ |
| เขียนไฟล์ชนกัน | ลองใหม่ 1 ครั้งตามข้อ 6 แล้วแจ้ง "บันทึกไม่สำเร็จ ลองอีกครั้ง" |
| ผู้ใช้ปฏิเสธสิทธิ์ notification | อธิบายวิธีเปิดในการตั้งค่าของ Chrome |

## 9. Secrets และการตั้งค่า (ผู้ใช้ทำเอง ตาม README)

- **Vercel env:** `APP_PASSCODE`, `GITHUB_TOKEN` (fine-grained PAT เฉพาะ repo นี้ สิทธิ์ Contents: Read and write, Actions: Read), `GITHUB_REPO`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **GitHub Actions secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (การ commit ใช้ `GITHUB_TOKEN` ในตัวของ Actions กับ `permissions: contents: write`)
- คู่กุญแจ VAPID สร้างครั้งเดียวด้วยคำสั่งใน README
- ขั้นตอน: สร้าง public repo → push โค้ด → สร้าง branch `data` พร้อม `alerts.json` เปล่า → สร้างโปรเจกต์ Vercel (Root Directory `web`) → ใส่ env/secrets → เปิดลิงก์บนมือถือ → "เพิ่มลงหน้าจอหลัก" → ใส่รหัสผ่าน → เปิด noti → กดทดสอบ

## 10. ข้อจำกัดที่แจ้งผู้ใช้แล้ว

- รายชื่อหุ้นและราคา SL/TP เปิดเผยใน public repo; push subscription ก็อยู่ในไฟล์นั้น แต่ส่ง noti ไม่ได้หากไม่มี VAPID private key ซึ่งอยู่ใน Secrets
- Yahoo Finance ไม่ใช่ช่องทางทางการ ข้อมูลช้า ~15 นาที และอาจดึงไม่ได้เป็นช่วง ๆ
- Cron ของ GitHub Actions ไม่ตรงเวลา มักช้า 5–15 นาที บางรอบถูกข้าม noti จึงอาจช้ากว่าราคาจริงรวม 20–30 นาที
- แอปเป็นเครื่องมือเฝ้าราคาตามเส้นที่ผู้ใช้ตั้งเอง ไม่ให้คำแนะนำซื้อขาย และไม่ส่งคำสั่งซื้อขาย

## 11. การทดสอบ

Python (`pytest`):
- `rules.evaluate`: SL/TP/alert `above`/`below` ยิงเมื่อถึงขอบพอดีและเมื่อเลย, ไม่ยิงเมื่อยังไม่ถึง, `fired` ไม่ยิงซ้ำ, หุ้นไม่มีราคา = ไม่เปลี่ยน, บันทึก `fired_at`/`fired_price`
- `hours`: ช่วงเวลาตลาดไทย/สหรัฐ, วันเสาร์–อาทิตย์, การเลือกหุ้นตามตลาดที่เปิด

JavaScript (`node --test`):
- `logic`: MA, แนวโน้มทั้ง 3 แบบ + ข้อมูลไม่พอ, % ห่าง, `marketOf`/`displaySymbol`/สกุลเงิน
- `_changes.applyChange`: ทุก action, เพดาน 20 หุ้น / 5 alert, ราคาไม่ถูกต้อง, หุ้นซ้ำ, หุ้นไม่มีในรายการ, `rearm`, กำหนด `dir` อัตโนมัติ

ตรวจด้วยมือ:
- รัน checker ในเครื่องกับ `alerts.json` ตัวอย่างโดยไม่ตั้ง VAPID (พิมพ์ผลแทนการส่ง)
- เปิดหน้าแอปที่ 375px: รายการ, กราฟ, เส้นทุกสี, แผ่นตั้งราคา, ไม่มี console error
- บนมือถือจริงหลัง deploy: ติดตั้ง PWA, ปุ่ม "ทดสอบ noti", ตั้ง alert ที่ราคาใกล้ราคาปัจจุบันแล้วรอรอบเช็ก

## นอกขอบเขต

- กราฟระหว่างวัน, indicator อื่นนอกจาก MA50/MA200
- แจ้งเตือนทาง Telegram, การเชื่อมกับ watchlist/ต้นทุนของ Stock News
- ลากเส้นบนกราฟ, alert แบบ % หรือ trailing stop
- หลายผู้ใช้, ระบบบัญชี
- ไฟล์ APK, iOS (ไม่ทดสอบ)
- ส่งคำสั่งซื้อขาย
