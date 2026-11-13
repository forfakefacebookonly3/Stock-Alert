# 🔔 Stock Alert

แอปมือถือ (PWA) สำหรับดูกราฟแท่งรายวัน วางเส้น Stop Loss / Take Profit / alert ราคา
และรับ notification เมื่อราคาแตะ — หุ้นสหรัฐและหุ้นไทย ไม่เกิน 20 ตัว

> เป็นเครื่องมือเฝ้าราคาตามเส้นที่คุณตั้งเอง **ไม่ใช่คำแนะนำการลงทุน** และไม่ส่งคำสั่งซื้อขาย

## ทำงานอย่างไร

```
มือถือ (PWA บน Vercel)  ──►  /api/*  ──►  alerts.json บน branch "data"
GitHub Actions ทุก 15 นาทีช่วงตลาดเปิด  ──►  ดึงราคา (Yahoo) ──►  Web Push
```

- ราคามาจาก Yahoo Finance ช้าประมาณ 15 นาที และ cron ของ GitHub มักช้าอีก 5–15 นาที
- ตัวเช็กเทียบกับราคาล่าสุดเท่านั้น ราคาที่แตะแล้วกลับระหว่างสองรอบจะไม่แจ้ง
- repo นี้เป็น public: รายชื่อหุ้นและราคา SL/TP ใน `alerts.json` เปิดเผย

## สถานะการติดตั้งของ repo นี้ (13 พ.ย. 2026)

ติดตั้งแล้วด้วยวิธีที่ต่างจากหัวข้อ "ติดตั้ง" ด้านล่างหนึ่งจุด: **Vercel ไม่ได้ผูกกับ repo**
หน้าแอป deploy จากโฟลเดอร์ `web/` ในเครื่องด้วย Vercel CLI (โปรเจกต์ `stock-alert`)

- หน้าแอป: https://stock-alert-plum.vercel.app
- Vercel จะ **ไม่** deploy เองเมื่อมี commit ใหม่ หลังแก้โค้ดใน `web/` ต้องสั่งเองจากโฟลเดอร์ `web/`:
  ```bash
  npx vercel deploy --prod
  ```
- เพิ่มหรือแก้ตัวแปรใน Vercel แล้วต้อง deploy ใหม่ด้วยคำสั่งเดียวกัน (หรือกด Redeploy ในหน้าเว็บ Vercel) ค่าใหม่จึงจะมีผล
- กุญแจ VAPID เก็บอยู่ในไฟล์ `.env` ของโฟลเดอร์นี้ในเครื่อง (git ไม่ติดตาม) ถ้าไฟล์นี้หาย ให้สร้างกุญแจใหม่ตามข้อ 1 แล้วใส่ค่าใหม่ทั้งใน Vercel และ GitHub Actions จากนั้นเปิด noti บนมือถือใหม่
- `VAPID_SUBJECT` ใช้ลิงก์ของ repo แทนอีเมล

## สิ่งที่ต้องมีก่อน

- **Git for Windows** (มี Git Bash มาด้วย), **Node.js LTS**, บัญชี **GitHub** และบัญชี **Vercel**
- **ทุกบล็อกคำสั่งใน README นี้ต้องรันใน Git Bash** โดยอยู่ในโฟลเดอร์ Alert — ไม่ใช่ PowerShell หรือ cmd
  (ใน PowerShell `&&` ใช้ไม่ได้ และ `echo ... > file` จะเขียนไฟล์ด้วย encoding ที่ทำให้แอปอ่านไม่ได้)

## ติดตั้ง (ทำครั้งเดียว)

### 1. สร้างกุญแจ VAPID
```bash
cd web && npm install && npx web-push generate-vapid-keys
```
เก็บ `Public Key` และ `Private Key` ไว้ใช้ในข้อ 4 และ 5

### 2. สร้าง public repo บน GitHub แล้ว push โค้ด
repo ต้องสร้างเป็น **public** และ **ว่างเปล่าทั้งหมด** (ไม่ติ๊กสร้าง README, .gitignore หรือ licence)
และโค้ดต้องอยู่บน branch `main` ก่อน push:
```bash
git branch --show-current     # ต้องพิมพ์ main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### 3. สร้าง branch `data` พร้อมไฟล์เปล่า
```bash
git switch --orphan data
printf '%s
' '{"version":1,"heartbeat":null,"push":[],"symbols":[]}' > alerts.json
mkdir web
printf '%s
' '{"git":{"deploymentEnabled":false}}' > web/vercel.json
git add alerts.json web/vercel.json && git commit -m "data: init"
git push -u origin data
git switch main
```
`web/vercel.json` บน branch `data` ทำให้ Vercel ไม่พยายาม deploy branch นี้ทุกครั้งที่แอปหรือตัวเช็กบันทึกข้อมูล

### 4. GitHub → Settings → Secrets and variables → Actions
| Secret | ค่า |
|---|---|
| `VAPID_PRIVATE_KEY` | Private Key จากข้อ 1 |
| `VAPID_SUBJECT` | `mailto:<อีเมลของคุณ>` |

`VAPID_PRIVATE_KEY` ใน GitHub Actions ต้องเป็นค่า **เดียวกันเป๊ะ** กับที่ใส่ใน Vercel — ถ้าต่างกัน
"ทดสอบ noti" จะส่งได้ แต่ alert จริงจะส่งไม่สำเร็จ และ log ของ Actions จะขึ้น "ส่งไม่สำเร็จ (HTTP 403)"

### 5. Vercel
1. Import repo → **Root Directory = `web`** · Framework = *Other* · ไม่มี build command
2. สร้าง GitHub fine-grained PAT เฉพาะ repo นี้: **Contents: Read and write**, **Actions: Read**
   ตอนสร้างต้องเลือก **Expiration แบบ Custom ที่ยาว** (ฟอร์มตั้งต้นไว้ที่ 30 วัน) และจดวันหมดอายุไว้
   เมื่อ token หมดอายุ แอปจะขึ้น "โหลดข้อมูลไม่ได้" และโหลดไม่ขึ้น ทั้งที่ตัวเช็กยังรันต่อ (ดู "ต่ออายุ token" ด้านล่าง)
3. Settings → Environment Variables:

| ตัวแปร | ค่า |
|---|---|
| `APP_PASSCODE` | รหัสผ่านของแอป ตั้งเอง |
| `GITHUB_TOKEN` | PAT จากข้อ 2 |
| `GITHUB_REPO` | `<user>/<repo>` |
| `VAPID_PUBLIC_KEY` | Public Key จากข้อ 1 |
| `VAPID_PRIVATE_KEY` | Private Key จากข้อ 1 |
| `VAPID_SUBJECT` | `mailto:<อีเมลของคุณ>` |

4. Redeploy

#### ต่ออายุ token
สร้าง PAT ใหม่ด้วยสิทธิ์เดียวกัน → ใส่ค่าใหม่ใน Vercel env `GITHUB_TOKEN` → **Redeploy**

### 6. บนมือถือ Android (Chrome)
1. เปิดลิงก์ Vercel → เมนู ⋮ → **เพิ่มลงในหน้าจอหลัก**
2. เปิดแอปจากไอคอน → ⚙︎ → ใส่รหัสผ่าน → **บันทึกรหัสผ่าน**
3. กด **เปิด noti บนเครื่องนี้** → อนุญาต
4. กด **ทดสอบ noti** → ต้องมี notification ขึ้น
5. ถ้า noti ไม่ขึ้นตอนปิดจอ: การตั้งค่า Android → แอป → Chrome → แบตเตอรี่ → ไม่จำกัด

### 7. ตรวจตัวเช็ก
GitHub → Actions → **check** → Run workflow → ต้องเป็นสีเขียว และหน้าแอปแสดง "เช็กล่าสุด"

จากนั้นลองตั้ง alert สักเส้นในแอป แล้วเปิด Vercel → Deployments: **ต้องไม่มี deployment ใหม่ของ branch `data`**
ถ้ามี ให้ปิด deployment ของ branch นั้นที่ Vercel → Settings → Git (ทางสำรอง — ยังไม่ได้ทดสอบว่าจำเป็น)

## ใช้งาน

- **เพิ่มหุ้น:** พิมพ์ชื่อในหน้ารายการ หุ้นไทยเติม `.BK` เช่น `PTT.BK`
- **จัดลำดับ:** กด "จัดลำดับ" → ▲ ▼ → "เสร็จ"
- **ตั้งเส้น:** กดปุ่ม SL / TP / ＋ Alert หรือแตะค้างบนกราฟ
- **หลังแจ้งเตือน:** เส้นเป็นสีเทา กด "เปิดใช้ซ้ำ" หรือ "ลบ"
- **ป้ายแนวโน้ม:** ขาขึ้น = ราคา > MA50 > MA200 · ขาลง = ราคา < MA50 < MA200 · นอกนั้นไซด์เวย์
- **RSI 14:** ช่วงล่างของกราฟ เส้น 70 (แดง) และ 30 (เขียว) — แสดงผลอย่างเดียว ไม่มีการแจ้งเตือน
- **ข้อมูลย้อนหลัง:** ราว 3 ปี เปิดมาเห็น 1 ปี ลากกราฟไปทางซ้ายเพื่อดูย้อนหลัง
- **Fibo:** กด `Fibo` บนแถบบน → ลากนิ้วอิสระจากจุดเริ่มไปจุดจบ (ราคาตรงตำแหน่งนิ้ว ไม่ดูดเข้าไส้เทียน) → "บันทึก" หรือ "วาดใหม่"
  จุดเริ่ม = 100%, จุดจบ = 0% · สูงสุด 3 ชุดต่อหุ้น · ลบได้จากรายการใต้ปุ่ม
- **Mark + บันทึก:** กด `Mark` → แตะแท่งเทียน → เลือก ▲ ซื้อ / ▼ ขาย / ● ข่าว / ■ อื่นๆ และพิมพ์บันทึก (≤ 200 ตัวอักษร)
  รายการบันทึกใต้กราฟเรียงใหม่→เก่า แตะแถวเพื่ออ่านเต็มและเลื่อนกราฟไปที่จุดนั้น · สูงสุด 30 อันต่อหุ้น
- Fibo และบันทึกเก็บใน `alerts.json` บน repo public — ใครเปิดดู repo ก็อ่านได้

## ข้อควรรู้

- **Cron ถูกปิดเอง:** GitHub ปิด scheduled workflow ของ public repo ที่ไม่มีความเคลื่อนไหว 60 วัน
  ตัวเช็กเขียนวันที่รันล่าสุดลงฟิลด์ `heartbeat` ของ `alerts.json` และ commit ลง branch `data` เมื่อวันที่เปลี่ยน (ยังไม่ได้ยืนยันว่า commit นี้นับเป็นความเคลื่อนไหวตามกฎ 60 วัน)
  ถ้าแอปขึ้นคำเตือน "ตัวเช็กราคาไม่ทำงาน"
  ให้เข้า Actions → check → **Enable workflow**
- **เวลาเช็ก:** ตลาดไทย 10:00–16:59 น. · ตลาดสหรัฐ 20:00–04:59 น. (เวลาไทย, จ.–ศ. ตามเวลา UTC)
- **Yahoo ดึงไม่ได้:** กราฟจะแสดงข้อมูลชุดล่าสุดพร้อมป้าย "ข้อมูลเก่า"
- **ลืมใส่ secret:** ถ้า `VAPID_PRIVATE_KEY` ใน GitHub Actions ไม่ได้ตั้งหรือสะกดผิด ตัวเช็กจะส่ง noti ไม่ได้ และ log ของ Actions จะมีบรรทัด "ไม่ได้ตั้ง VAPID_PRIVATE_KEY" โดย alert ยังค้างอยู่ ไม่หาย
- **Run สีแดงหลังเพิ่งแก้ alert:** ถ้า `check` ล้มด้วย error ของ rebase/push ทันทีหลังคุณแก้ alert ในแอป
  noti เดิมอาจถูกส่งซ้ำอีกครั้งในรอบถัดไป
- **ตั้ง `GITHUB_REPO` ผิดหรือไม่มี branch `data`:** แอปจะขึ้นข้อความ "ไม่พบ alerts.json บน branch data" แทนที่จะเป็นรายการว่าง
- **รหัสผ่านของแอป:** ไม่มีการจำกัดจำนวนครั้งที่ลองผิด ให้ตั้ง `APP_PASSCODE` ยาวและเดายาก
- **ใครเปิดลิงก์ได้ก็เห็นรายการ:** หน้าแอปและ `/api/data` อ่านได้โดยไม่ต้องใส่รหัส รหัสผ่านใช้กันเฉพาะการแก้ไข

## พัฒนา

```bash
cd web && npm install && node --test        # test ฝั่ง JS
pip install -r requirements.txt && python -m pytest tests -q   # test ฝั่ง Python
DRY_RUN=1 DATA_FILE=path/to/alerts.json python -m checker.check          # รันตัวเช็กแบบไม่ส่ง noti จริง
```
