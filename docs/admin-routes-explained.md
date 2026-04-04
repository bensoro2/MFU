# อธิบาย routes/admin.js แบบละเอียด

> สำหรับผู้ที่เพิ่งเริ่มเรียน Node.js / Express — อ่านแล้วเข้าใจได้ทันที

---

## ภาพรวม

ไฟล์นี้คือ "สมุดจดคำสั่ง" ของหน้าจัดการระบบ (Admin Panel)
เมื่อ Admin เปิด URL ใดก็ตามที่ขึ้นต้นด้วย `/admin/...`
Node.js จะวิ่งมาดูไฟล์นี้แล้วตอบสนองตามที่กำหนดไว้

```
Browser ───► server.js ───► routes/admin.js ───► Database ───► views/admin/*.ejs
                               (ไฟล์นี้)          (MySQL)         (หน้าเว็บ)
```

---

## คำศัพท์พื้นฐานที่ต้องรู้ก่อน

| คำ | ความหมายง่ายๆ |
|---|---|
| `require()` | "นำเข้า" ไฟล์หรือ package อื่นมาใช้งาน เหมือน import ใน Python |
| `router` | ตัวจัดการ URL — รับว่า URL ไหนให้ทำอะไร |
| `async` | ฟังก์ชันที่ต้องรอผลลัพธ์ (เช่น รอ Database ตอบกลับ) |
| `await` | "รอก่อน" — หยุดรอจนกว่า async operation จะเสร็จ |
| `req` | ข้อมูลที่ Browser ส่งมา (Request) เช่น form data, query string, cookies |
| `res` | สิ่งที่เราตอบกลับไป (Response) เช่น render HTML, redirect, ส่ง JSON |
| `try/catch` | ลอง run code ถ้า error เกิดขึ้น ให้จับ error แล้วจัดการ |
| `?` ใน SQL | placeholder ป้องกัน SQL Injection — ค่าจริงส่งแยกใน array |

---

## ส่วนที่ 1: Import และเตรียมตัว (บรรทัด 1–15)

```js
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { requireRole, verifyCsrf } = require('../middleware/auth');
```

### อธิบาย

**`express`** — framework หลักที่ทำให้ Node.js สร้าง web server ได้

**`router`** — เหมือนกล่องเก็บ URL rules ทั้งหมด
ตอนท้ายไฟล์จะส่ง router ออกไปให้ `server.js` ใช้

**`db`** — ตัวเชื่อมต่อ MySQL Database
เรียก `db.execute(SQL)` เพื่อส่งคำสั่งไปที่ Database

**`requireRole`** — Middleware ตรวจสอบว่า Login แล้วและมีสิทธิ์ถูกต้อง
ถ้าไม่ใช่ Admin → redirect ไปหน้า login อัตโนมัติ

**`verifyCsrf`** — Middleware ตรวจสอบ CSRF Token
ป้องกันการโจมตีที่เว็บอื่นแอบส่ง form มาในนามผู้ใช้

---

## ส่วนที่ 2: Helper Functions (ฟังก์ชันช่วยงาน)

### `getStats()` — ดึงสถิติภาพรวม

```js
async function getStats() {
  const [[{ c: totalVoters }]] = await db.execute('SELECT COUNT(*) c FROM voters WHERE is_enabled = 1');
  ...
  const pct = totalVoters > 0 ? Math.round((totalVotes / totalVoters) * 100) : 0;
  return { totalVoters, totalCandidates, totalVotes, pct };
}
```

**ทำงานอย่างไร:**
1. ส่ง SQL `SELECT COUNT(*)` ไปนับจำนวนแถวในแต่ละตาราง
2. คำนวณ % ผู้มาใช้สิทธิ์
3. คืนค่าทั้งหมดรวมเป็น object เดียว

**การ Destructure ที่ซับซ้อน:**
```js
const [[{ c: totalVoters }]] = await db.execute(...)
//       ^                  ผลลัพธ์ MySQL = [[{c: 100}], ...]
//      ^^                  [0] = array แถวผลลัพธ์ → [{c: 100}]
//       ^{c: totalVoters}  [0] = object แถวแรก → {c: 100}
//            ^^^^^^^^^^^   ดึง key "c" มาตั้งชื่อใหม่เป็น totalVoters
```

---

### `getSetting(key)` — ดึงค่าการตั้งค่า

```js
async function getSetting(key) {
  const [rows] = await db.execute('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return rows.length ? rows[0].setting_value : '0';
}
```

**ทำงานอย่างไร:**
- ค้นหาค่าจากตาราง `settings` ด้วย key ที่ส่งมา
- ถ้าเจอ → คืนค่า `setting_value` (เช่น `'1'` หรือ `'0'`)
- ถ้าไม่เจอ → คืน `'0'` (ปิดอยู่) เป็น default

---

## ส่วนที่ 3: Routes ทั้งหมด

### โครงสร้างของทุก Route

```
router.METHOD('/path', middleware1, middleware2, async (req, res) => {
  try {
    // 1. รับข้อมูลจาก req
    // 2. ตรวจสอบความถูกต้อง
    // 3. คุยกับ Database
    // 4. ตอบกลับด้วย res.render() หรือ res.redirect()
  } catch (err) {
    // จัดการ error
  }
});
```

---

### GET /admin/dashboard — หน้า Dashboard หลัก

**เมื่อไหร่ถูกเรียก:** เมื่อ Admin เปิด `http://localhost:3000/admin/dashboard`

**สิ่งที่ทำ:**
1. ดึงสถิติรวม (จำนวน voter, candidate, โหวต, %)
2. ดึงสถานะว่าเปิด/ปิดระบบโหวตและลงทะเบียนอยู่ไหม
3. ดึง Top 5 ผู้สมัครคะแนนสูงสุด
4. ส่งทั้งหมดไป render ที่ `views/admin/dashboard.ejs`

**SQL ที่น่าสนใจ:**
```sql
SELECT c.id, c.candidate_id, ..., COUNT(v.id) AS vote_count
  FROM candidates c
  LEFT JOIN votes v ON c.id = v.candidate_id
 WHERE c.is_registered = 1
 GROUP BY c.id
 ORDER BY vote_count DESC
 LIMIT 5
```
- `LEFT JOIN` = รวมตาราง votes เข้ากับ candidates โดยจับคู่ผ่าน candidate_id
- `COUNT(v.id)` = นับจำนวนโหวตของผู้สมัครแต่ละคน
- `GROUP BY c.id` = จัดกลุ่มตาม id เพื่อให้ COUNT ทำงานได้ถูกต้อง

---

### GET /admin/candidates — รายชื่อผู้สมัคร

**เมื่อไหร่ถูกเรียก:** เปิด `/admin/candidates` (ค้นหาได้ด้วย `?search=ชื่อ`)

**สิ่งที่ทำ:**
1. รับ `?search=` จาก URL (ถ้ามี)
2. สร้าง SQL query แบบ dynamic — เพิ่ม WHERE เฉพาะเมื่อมีคำค้นหา
3. ดึงรายชื่อพร้อมจำนวนโหวตของแต่ละคน

**Dynamic SQL คืออะไร:**
```js
let query = 'SELECT ... FROM candidates c LEFT JOIN votes v ...';
if (search) {
  query += ' WHERE c.full_name LIKE ? OR c.candidate_id LIKE ?';
  params.push(`%${search}%`, `%${search}%`);
}
query += ' GROUP BY c.id ORDER BY c.number ASC';
```
เหมือนต่อ string SQL — ถ้ามีการค้นหาก็แปะ WHERE เพิ่มเข้าไป

---

### POST /admin/add-candidate — เพิ่มผู้สมัครใหม่

**เมื่อไหร่ถูกเรียก:** Admin กด "เพิ่มผู้สมัคร" แล้ว submit form

**Flow การทำงาน:**
```
รับข้อมูล form
    ↓
ตรวจรูปแบบ candidate_id (C-XXXX)
    ↓
ตรวจหมายเลข (1-99)
    ↓
ตรวจซ้ำใน DB (candidate_id และ number)
    ↓
INSERT ลง DB
    ↓
redirect กลับพร้อม flash message "สำเร็จ"
```

**Regular Expression `/^C-\d{4}$/`:**
```
^       = ต้องเริ่มต้นด้วย
C-      = ตัวอักษร C ตามด้วย -
\d{4}   = ตัวเลข 0-9 จำนวน 4 ตัวพอดี
$       = ต้องจบที่นี่

ผ่าน:  C-0001, C-9999
ไม่ผ่าน: c-001, C-00001, ABCD
```

**Prepared Statement (ป้องกัน SQL Injection):**
```js
// อันตราย — อย่าทำแบบนี้!
db.execute(`INSERT INTO candidates WHERE id = ${id}`)

// ปลอดภัย — ใช้ ? แทน
db.execute('INSERT INTO candidates WHERE id = ?', [id])
// mysql2 จะ escape ค่า id ให้อัตโนมัติ ทำให้โจมตีไม่ได้
```

---

### POST /admin/edit-candidate — แก้ไขข้อมูลผู้สมัคร

**เมื่อไหร่ถูกเรียก:** Admin กดปุ่ม "แก้ไข" แล้ว submit modal form

**สิ่งพิเศษ — การตรวจซ้ำแบบยกเว้นตัวเอง:**
```sql
SELECT id FROM candidates WHERE candidate_id = ? AND id <> ?
```
- `AND id <> ?` = ยกเว้นแถวของตัวเองออก
- ถ้าไม่ใส่ส่วนนี้: แก้ไข C-0001 → C-0001 (ไม่เปลี่ยน) จะ error ว่า "ซ้ำ" ทั้งที่ไม่ได้ซ้ำ

---

### POST /admin/delete-candidate — ลบผู้สมัคร

**เมื่อไหร่ถูกเรียก:** Admin กดปุ่ม "ลบ" แล้วยืนยัน

**กฎ Data Integrity (ความสมบูรณ์ของข้อมูล):**
```
มีคนโหวตให้ผู้สมัครนี้แล้ว?
  ใช่ → ห้ามลบ (โหวตจะกลายเป็นโหวตที่ไม่ชี้ไปหาใคร)
  ไม่ใช่ → ลบได้
```

---

### POST /admin/toggle-candidate — เปิด/ปิดบัญชีผู้สมัคร

**Whitelist Validation:**
```js
if (!['enable', 'disable'].includes(action)) { ... }
```
ป้องกันไม่ให้ใครส่งค่า action แปลกๆ มาได้ เช่น `action=delete` หรือ `action=<script>`

**Ternary Operator:**
```js
const val = action === 'enable' ? 1 : 0;
// อ่านว่า: ถ้า action เท่ากับ 'enable' ให้ val = 1, ไม่งั้น val = 0
```

---

### GET /admin/voters — รายชื่อผู้มีสิทธิ์โหวต (มี Pagination)

**Pagination คืออะไร:**
การแบ่งข้อมูลออกเป็นหน้าๆ เพื่อไม่ให้โหลดข้อมูลทีเดียวหมด

```
ข้อมูล 100 แถว / หน้าละ 20 แถว = 5 หน้า

หน้า 1: แถว 1-20   (OFFSET 0,  LIMIT 20)
หน้า 2: แถว 21-40  (OFFSET 20, LIMIT 20)
หน้า 3: แถว 41-60  (OFFSET 40, LIMIT 20)
...
```

**คำนวณ offset:**
```js
const offset = (page - 1) * limit;
// หน้า 1: (1-1) * 20 = 0
// หน้า 2: (2-1) * 20 = 20
// หน้า 3: (3-1) * 20 = 40
```

**ทำไม LIMIT/OFFSET ถึงฝังโดยตรงใน SQL:**
```js
`... LIMIT ${limit} OFFSET ${offset}`
// ไม่ใช้ ? เพราะ mysql2 มี bug กับ LIMIT/OFFSET ใน prepared statements
// ปลอดภัยเพราะ limit และ offset เป็น integer ที่คำนวณจาก parseInt() แล้ว
```

---

### POST /admin/add-voter — เพิ่มผู้มีสิทธิ์โหวต

**การทำความสะอาดข้อมูล (Data Sanitization):**
```js
const citizen_id = (req.body.citizen_id || '').replace(/\s+/g, '');
// replace(/\s+/g, '') = ลบช่องว่างทุกตัวออก
// เช่น '1234 5678 9012 3' → '1234567890123'

const laser_id = (req.body.laser_id || '').trim().toUpperCase();
// .trim() = ตัดช่องว่างหัวท้าย
// .toUpperCase() = aa0-0000001-00 → AA0-0000001-00
```

---

### POST /admin/edit-voter และ POST /admin/delete-voter

ทำงานเหมือน edit/delete candidate แต่กับตาราง voters

**กฎ delete voter:**
```
has_voted = 1? → ห้ามลบ (ข้อมูลโหวตยังอยู่ในตาราง votes)
has_voted = 0? → ลบได้
```

---

### POST /admin/toggle-settings — เปิด/ปิดระบบโหวต/ลงทะเบียน

**HTML Checkbox กับ value ที่ขาดหาย:**
```html
<input type="checkbox" name="value" value="1" checked />
```
- ถ้าติ๊ก checkbox → browser ส่ง `value=1` มาใน body
- ถ้าไม่ติ๊ก → browser **ไม่ส่ง** key `value` มาเลย → `req.body.value = undefined`

```js
const value = req.body.value; // '1' หรือ undefined
await db.execute('UPDATE settings SET setting_value = ?', [value ? '1' : '0']);
// value มีค่า (truthy) → '1'
// value ไม่มีค่า (undefined = falsy) → '0'
```

---

### GET /admin/results — ผลการเลือกตั้ง

เหมือน `/admin/candidates` แต่เรียงตามคะแนน:
```sql
ORDER BY vote_count DESC, c.number ASC
-- เรียงคะแนนมากสุดก่อน
-- ถ้าคะแนนเท่ากัน ให้เรียงตามหมายเลขผู้สมัคร (น้อยก่อน)
```

---

## ส่วนที่ 4: ท้ายไฟล์

```js
module.exports = router;
```

ส่ง router ออกไปให้ `server.js` ใช้งาน:
```js
// ใน server.js
app.use('/admin', require('./routes/admin'));
// ทุก URL ใน router นี้จะถูก prefix ด้วย /admin
// '/dashboard' → '/admin/dashboard'
// '/candidates' → '/admin/candidates'
```

---

## ภาพรวม Request Flow ทั้งหมด

```
1. Browser ส่ง request มา
        ↓
2. server.js รับ → ส่งต่อให้ routes/admin.js
        ↓
3. requireRole() ตรวจสอบ session
   ✗ ไม่ผ่าน → redirect /login
   ✓ ผ่าน ↓
4. (POST เท่านั้น) verifyCsrf() ตรวจ token
   ✗ ไม่ผ่าน → redirect กลับพร้อม error
   ✓ ผ่าน ↓
5. Handler function รัน
   - รับข้อมูลจาก req.body / req.query
   - ตรวจสอบความถูกต้อง
   - await db.execute() คุยกับ MySQL
        ↓
6. ตอบกลับ
   - res.render() → แสดงหน้า EJS
   - res.redirect() → พาไปหน้าอื่น
   - res.status(500) → แจ้ง error
```

---

## สรุป Routes ทั้งหมด

| Method | Path | หน้าที่ |
|--------|------|---------|
| GET | `/admin/dashboard` | หน้าหลัก + สถิติ + top 5 |
| GET | `/admin/candidates` | รายชื่อผู้สมัคร (ค้นหาได้) |
| POST | `/admin/add-candidate` | เพิ่มผู้สมัครใหม่ |
| POST | `/admin/edit-candidate` | แก้ไข candidate_id และหมายเลข |
| POST | `/admin/delete-candidate` | ลบผู้สมัคร (บล็อกถ้ามีโหวต) |
| POST | `/admin/toggle-candidate` | เปิด/ปิดบัญชีผู้สมัคร |
| GET | `/admin/voters` | รายชื่อผู้มีสิทธิ์โหวต (pagination) |
| POST | `/admin/add-voter` | เพิ่มผู้มีสิทธิ์โหวตใหม่ |
| POST | `/admin/edit-voter` | แก้ไขเลขบัตร + laser ID |
| POST | `/admin/delete-voter` | ลบผู้มีสิทธิ์โหวต (บล็อกถ้าโหวตแล้ว) |
| POST | `/admin/toggle-voter` | เปิด/ปิดบัญชีผู้มีสิทธิ์โหวต |
| POST | `/admin/toggle-settings` | เปิด/ปิดระบบโหวต/ลงทะเบียน |
| GET | `/admin/results` | ผลการเลือกตั้งพร้อมสถิติ |
