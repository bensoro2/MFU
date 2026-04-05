# MFU Election System — คู่มือการติดตั้งและใช้งาน

> ระบบเลือกตั้งออนไลน์มหาวิทยาลัยแม่ฟ้าหลวง พัฒนาด้วย Node.js + MySQL
> อ่านคู่มือนี้จากบนลงล่างทีละขั้นตอน ทำตามได้เลยโดยไม่ต้องมีพื้นฐาน

---

## สิ่งที่ต้องมีก่อนเริ่ม

| โปรแกรม | ใช้ทำอะไร | ดาวน์โหลดที่ไหน |
|---|---|---|
| **Node.js** (v18 ขึ้นไป) | รัน JavaScript บนเครื่อง | https://nodejs.org → เลือก LTS |
| **XAMPP** | รัน MySQL Database | https://www.apachefriends.org |
| **เบราว์เซอร์** | ดูหน้าเว็บ | Chrome / Edge / Firefox |

### วิธีตรวจว่าติดตั้งแล้วหรือยัง

เปิด **Command Prompt** (กด `Win + R` พิมพ์ `cmd` กด Enter) แล้วพิมพ์:

```bash
node -v
```

ถ้าขึ้นเลขเวอร์ชัน เช่น `v20.11.0` = ติดตั้งแล้ว ✅
ถ้าขึ้น `'node' is not recognized` = ยังไม่ได้ติดตั้ง ❌

---

## ขั้นตอนที่ 1 — เปิด MySQL ใน XAMPP

1. เปิดโปรแกรม **XAMPP Control Panel**
2. กดปุ่ม **Start** ตรงแถว **MySQL**
3. รอจนสถานะเปลี่ยนเป็นสีเขียว ✅
4. (ไม่ต้องเปิด Apache ก็ได้ ระบบนี้ใช้แค่ MySQL)

> ถ้า MySQL ไม่ยอม Start ให้ดูหัวข้อ **แก้ปัญหา** ด้านล่าง

---

## ขั้นตอนที่ 2 — สร้าง Database

มี 2 วิธี เลือกวิธีที่ถนัด:

### วิธี A: ผ่าน phpMyAdmin (แนะนำสำหรับมือใหม่)

1. เปิดเบราว์เซอร์ไปที่ `http://localhost/phpmyadmin`
2. คลิก **"นำเข้า" (Import)** ในเมนูซ้าย
3. กด **"เลือกไฟล์"** → เลือกไฟล์ `database.sql` ในโฟลเดอร์โปรเจค
4. เลื่อนลงมาด้านล่าง กดปุ่ม **"ดำเนินการ" (Go)**
5. รอจนขึ้นข้อความ "Import has been successfully finished" ✅

### วิธี B: ผ่าน Command Line

```bash
mysql -u root -p < database.sql
```
พิมพ์ password MySQL (ถ้าไม่ได้ตั้งให้กด Enter เลย)

---

## ขั้นตอนที่ 3 — ตั้งค่าไฟล์ .env

ไฟล์ `.env` คือไฟล์เก็บข้อมูลสำคัญของระบบ (password, ชื่อ database ฯลฯ)

เปิดไฟล์ `.env` ในโฟลเดอร์โปรเจค แล้วแก้ให้ตรงกับเครื่องคุณ:

```env
# Port ที่เว็บจะรันอยู่ (3000 = เปิดที่ localhost:3000)
PORT=3000

# ข้อมูลเชื่อมต่อ MySQL
DB_HOST=localhost          # ไม่ต้องแก้
DB_PORT=3306               # port MySQL (ค่า default ของ XAMPP)
DB_NAME=mfu_election       # ชื่อ database ที่สร้างไว้
DB_USER=root               # username MySQL (ค่า default ของ XAMPP)
DB_PASS=                   # password MySQL (ถ้า XAMPP ไม่ได้ตั้งให้เว้นว่าง)

# Secret key สำหรับ session (พิมพ์อะไรก็ได้ยาวๆ)
SESSION_SECRET=mfu_election_super_secret_key_2024

# ข้อมูล login ของ Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> **หมายเหตุ:** ถ้าเคยตั้ง password MySQL ไว้ ให้ใส่ที่ `DB_PASS=`

---

## ขั้นตอนที่ 4 — ติดตั้ง Dependencies

เปิด **Terminal / Command Prompt** แล้ว `cd` ไปยังโฟลเดอร์โปรเจค:

```bash
cd C:\xampp\htdocs\mfu_election_node
```

จากนั้นรันคำสั่ง:

```bash
npm install
```

รอจนเสร็จ (จะโหลด packages ต่างๆ ลงใน `node_modules/`) ✅

---

## ขั้นตอนที่ 5 — รันโปรเจค

```bash
# โหมด development (แนะนำ — auto-reload เมื่อแก้ไข code)
npm run dev

# โหมด production (ไม่ auto-reload)
npm start
```

ถ้าขึ้นแบบนี้ = สำเร็จ ✅

```
🗳  MFU Election กำลังทำงานที่ http://localhost:3000
```

เปิดเบราว์เซอร์ไปที่ **`http://localhost:3000`**

---

## ขั้นตอนที่ 6 — เริ่มใช้งานระบบ

### 6.1 Login ในฐานะ Admin

1. เปิด `http://localhost:3000/login`
2. คลิกแท็บ **"Admin"**
3. กรอก Username: `admin` / Password: `admin123`
4. กด **เข้าสู่ระบบ**

### 6.2 เพิ่มผู้สมัคร (ทำก่อน Candidate login ได้)

1. ไปที่เมนู **"ผู้สมัคร"**
2. กด **"+ เพิ่มผู้สมัคร"**
3. กรอก Candidate ID รูปแบบ `C-XXXX` เช่น `C-0001`
4. กรอกหมายเลขผู้สมัคร เช่น `1`
5. กด **"เพิ่ม"**

### 6.3 เพิ่มผู้มีสิทธิ์โหวต

1. ไปที่เมนู **"ผู้ลงคะแนน"**
2. กด **"+ เพิ่ม"**
3. กรอกเลขบัตรประชาชน 13 หลัก และรหัสหลังบัตร
4. กด **"เพิ่ม"**

### 6.4 ผู้สมัครลงทะเบียน (ครั้งแรก)

1. เปิด `http://localhost:3000/login`
2. คลิกแท็บ **"ผู้สมัคร"**
3. กด **"ลงทะเบียนผู้สมัคร"**
4. กรอก Candidate ID ที่ Admin สร้างไว้ เช่น `C-0001`
5. กรอกชื่อ-นามสกุล, Gmail, Password (อย่างน้อย 6 ตัว)
6. กด **"ลงทะเบียน"**

### 6.5 ผู้มีสิทธิ์โหวต Login และโหวต

1. เปิด `http://localhost:3000/login`
2. แท็บ **"ผู้ลงคะแนน"** เลือกไว้อยู่แล้ว
3. กรอกเลขบัตรประชาชน และรหัสหลังบัตร
4. เข้าสู่ระบบ → จะเห็นรายชื่อผู้สมัครทั้งหมด
5. กดปุ่ม **"โหวต"** ข้างชื่อผู้สมัครที่ต้องการ
6. กด **"ยืนยัน"** → โหวตได้ครั้งเดียว ไม่สามารถเปลี่ยนได้

---

## ข้อมูลทดสอบ (มาจาก database.sql)

หลังจาก import database.sql แล้ว จะมีข้อมูลตัวอย่างพร้อมใช้:

### Admin
| Username | Password |
|---|---|
| admin | admin123 |

### Candidate (ลงทะเบียนแล้ว)
| Candidate ID | Password | ชื่อ |
|---|---|---|
| C-0001 | password | นายกฤษณะ สุขใจ |
| C-0002 | password | นางสาวพิมพ์ใจ แก้วงาม |

> Candidate C-0003, C-0004, C-0005 ยังไม่ได้ลงทะเบียน (ต้องสมัครเองที่หน้า login)

### Voter
| เลขบัตรประชาชน | รหัสหลังบัตร |
|---|---|
| 1234567890123 | AA0-0000001-00 |
| 9876543210987 | BB0-0000002-00 |
| 1111111111111 | CC0-0000003-00 |

---

## โครงสร้างโปรเจค

```
mfu_election_node/
│
├── server.js              ← จุดเริ่มต้นของโปรแกรม (รันไฟล์นี้)
├── .env                   ← ไฟล์ตั้งค่า (password, database ฯลฯ)
├── database.sql           ← SQL สำหรับสร้าง database ครั้งแรก
├── package.json           ← รายการ dependencies ของโปรเจค
│
├── config/
│   └── db.js              ← ตั้งค่าการเชื่อมต่อ MySQL
│
├── middleware/
│   └── auth.js            ← ตรวจสอบ login และสิทธิ์ผู้ใช้
│
├── routes/                ← กำหนด URL ทั้งหมดของระบบ
│   ├── index.js           ← / และ /login และ /logout
│   ├── auth.js            ← /auth/login, /auth/register
│   ├── admin.js           ← /admin/* (หน้าจัดการระบบ)
│   ├── candidate.js       ← /candidate/* (หน้าผู้สมัคร)
│   ├── voter.js           ← /voter/* (หน้าผู้มีสิทธิ์โหวต)
│   └── api.js             ← /api/* (JSON API สำหรับ Postman/curl)
│
├── views/                 ← ไฟล์ HTML (EJS template)
│   ├── login.ejs          ← หน้า login (3 แท็บ)
│   ├── partials/
│   │   ├── header.ejs     ← Navbar + flash messages (ใช้ซ้ำทุกหน้า)
│   │   └── footer.ejs     ← ปิด tag HTML (ใช้ซ้ำทุกหน้า)
│   ├── admin/
│   │   ├── dashboard.ejs  ← สถิติ + top 5 + เปิด/ปิดระบบ
│   │   ├── candidates.ejs ← จัดการผู้สมัคร (เพิ่ม/แก้/ลบ/เปิดปิด)
│   │   ├── voters.ejs     ← จัดการผู้มีสิทธิ์โหวต
│   │   └── results.ejs    ← ผลการเลือกตั้ง
│   ├── candidate/
│   │   ├── dashboard.ejs  ← คะแนน + อันดับของตัวเอง
│   │   ├── profile.ejs    ← แก้ไขชื่อ + นโยบาย
│   │   └── results.ejs    ← ผลคะแนนรวม
│   └── voter/
│       ├── dashboard.ejs  ← รายชื่อผู้สมัคร + ปุ่มโหวต
│       ├── results.ejs    ← ผลคะแนนรวม
│       └── history.ejs    ← ประวัติการโหวต
│
├── public/
│   └── assets/
│       ├── app.css        ← CSS ของระบบ (สีมหาวิทยาลัย)
│       └── app.js         ← JavaScript ฝั่งเบราว์เซอร์
│
└── docs/
    ├── README.md                 ← ไฟล์นี้
    └── admin-routes-explained.md ← อธิบาย routes/admin.js แบบละเอียด
```

---

## Database Schema (ตารางในฐานข้อมูล)

### ตาราง `candidates` — ผู้สมัคร
```sql
id            INT          รหัสอัตโนมัติ (PK)
candidate_id  VARCHAR(10)  รหัสผู้สมัคร เช่น C-0001 (ห้ามซ้ำ)
password_hash VARCHAR(255) password ที่เข้ารหัสแล้ว (NULL ถ้ายังไม่ลงทะเบียน)
full_name     VARCHAR(200) ชื่อ-นามสกุล
email         VARCHAR(200) Gmail
policy        TEXT         นโยบาย
number        TINYINT      หมายเลขผู้สมัคร 1-99 (ห้ามซ้ำ)
is_registered TINYINT(1)   0=ยังไม่ลงทะเบียน, 1=ลงทะเบียนแล้ว
is_enabled    TINYINT(1)   0=ปิดบัญชี, 1=เปิดบัญชี
registered_at DATETIME     วันที่ลงทะเบียน
```

### ตาราง `voters` — ผู้มีสิทธิ์โหวต
```sql
id         INT         รหัสอัตโนมัติ (PK)
citizen_id VARCHAR(20) เลขบัตรประชาชน (ห้ามซ้ำ)
laser_id   VARCHAR(20) รหัสหลังบัตร
is_enabled TINYINT(1)  0=ปิดบัญชี, 1=เปิดบัญชี
has_voted  TINYINT(1)  0=ยังไม่โหวต, 1=โหวตแล้ว
created_at DATETIME    วันที่เพิ่มเข้าระบบ
```

### ตาราง `votes` — บันทึกการโหวต
```sql
id           INT      รหัสอัตโนมัติ (PK)
voter_id     INT      FK → voters.id (ใครโหวต)
candidate_id INT      FK → candidates.id (โหวตให้ใคร)
voted_at     DATETIME เวลาที่โหวต
```
> มี UNIQUE constraint บน `voter_id` → โหวตได้ครั้งเดียว ถ้าโหวตซ้ำ DB จะ reject

### ตาราง `settings` — การตั้งค่า
```sql
setting_key   VARCHAR  ชื่อ setting (PK)
setting_value VARCHAR  ค่า ('0' หรือ '1')
```

| setting_key | ความหมาย |
|---|---|
| voting_enabled | 1 = เปิดรับโหวต, 0 = ปิด |
| registration_enabled | 1 = เปิดรับลงทะเบียนผู้สมัคร, 0 = ปิด |

---

## URL ทั้งหมดของระบบ

### หน้าเว็บ (สำหรับเบราว์เซอร์)

| URL | ใครใช้ได้ | หน้าที่ |
|---|---|---|
| `/login` | ทุกคน | หน้า login (3 แท็บ) |
| `/logout` | ทุกคน | ออกจากระบบ |
| `/admin/dashboard` | Admin | หน้าหลัก + สถิติ |
| `/admin/candidates` | Admin | จัดการผู้สมัคร |
| `/admin/voters` | Admin | จัดการผู้มีสิทธิ์โหวต |
| `/admin/results` | Admin | ผลการเลือกตั้ง |
| `/candidate/dashboard` | Candidate | หน้าหลัก + อันดับ |
| `/candidate/profile` | Candidate | แก้ไขโปรไฟล์ |
| `/candidate/results` | Candidate | ผลคะแนน |
| `/voter/dashboard` | Voter | โหวต + รายชื่อผู้สมัคร |
| `/voter/results` | Voter | ผลคะแนน |
| `/voter/history` | Voter | ประวัติการโหวต |

### JSON API (สำหรับ Postman / curl)

ดูรายละเอียดใน `mfu_election.postman_collection.json`

```
GET  /api/csrf              ← ดึง CSRF Token (ต้องทำก่อน)
POST /api/auth/admin-login
POST /api/auth/voter-login
POST /api/auth/candidate-login
POST /api/auth/candidate-register
GET  /api/auth/logout
GET  /api/admin/dashboard
GET  /api/admin/candidates
POST /api/admin/add-candidate
POST /api/admin/edit-candidate
POST /api/admin/delete-candidate
POST /api/admin/toggle-candidate
GET  /api/admin/voters
POST /api/admin/add-voter
POST /api/admin/edit-voter
POST /api/admin/delete-voter
POST /api/admin/toggle-voter
POST /api/admin/toggle-settings
GET  /api/admin/results
GET  /api/candidate/dashboard
GET  /api/candidate/profile
POST /api/candidate/update-profile
GET  /api/candidate/results
GET  /api/voter/dashboard
POST /api/voter/cast-vote
GET  /api/voter/results
GET  /api/voter/history
```

---

## ความปลอดภัยของระบบ

| กลไก | อธิบาย |
|---|---|
| **CSRF Token** | ทุก form POST จะมี token ลับซ่อนอยู่ ป้องกันเว็บอื่นแอบส่ง form แทนผู้ใช้ |
| **Session Fixation** | หลัง login จะสร้าง session ID ใหม่ทุกครั้ง ป้องกันการโจมตีแบบ fixation |
| **Password Hashing** | password ไม่ได้เก็บตรงๆ ใน DB — เข้ารหัสด้วย bcrypt (ถอดรหัสกลับไม่ได้) |
| **Admin Credentials** | username/password admin เก็บใน `.env` ไม่ได้เก็บใน DB |
| **httpOnly Cookie** | JavaScript ในเบราว์เซอร์อ่าน session cookie ไม่ได้ |
| **Double-Vote Guard** | ตรวจโหวตซ้ำ 2 ชั้น: application code + UNIQUE constraint ใน DB |
| **Transaction** | การโหวตเป็น atomic — INSERT + UPDATE ต้องสำเร็จพร้อมกัน ไม่สำเร็จก็ rollback ทั้งคู่ |
| **SQL Injection** | ใช้ Prepared Statements (`?`) ทุกที่ ค่าจากผู้ใช้ไม่ถูกฝังใน SQL ตรงๆ |

---

## แก้ปัญหาที่พบบ่อย

### ❌ MySQL ไม่ยอม Start ใน XAMPP

**สาเหตุ:** Port 3306 ถูกโปรแกรมอื่นใช้อยู่ (เช่น MySQL ที่ติดตั้งแยก)

**วิธีแก้:**
1. เปิด Task Manager (`Ctrl+Shift+Esc`) → ค้นหา `mysqld.exe` → End Task
2. ลองกด Start อีกครั้ง
3. หรือเปลี่ยน port MySQL ใน XAMPP Config → แก้ `DB_PORT` ใน `.env` ด้วย

---

### ❌ เปิดหน้าเว็บแล้วขึ้น "เกิดข้อผิดพลาด"

**ดูข้อความ error ใน Terminal** ที่รัน `npm run dev` อยู่:

| Error ที่เจอ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `ECONNREFUSED` | MySQL ไม่ได้เปิด | เปิด XAMPP → Start MySQL |
| `Unknown database 'mfu_election'` | ยังไม่ได้ import SQL | ทำขั้นตอนที่ 2 ใหม่ |
| `Table 'voters' doesn't exist` | import SQL ไม่สมบูรณ์ | import `database.sql` ใหม่ |
| `Access denied for user 'root'` | password MySQL ผิด | แก้ `DB_PASS=` ใน `.env` |

---

### ❌ `npm install` error

**ตรวจ Node.js version:**
```bash
node -v   # ต้องเป็น v18 ขึ้นไป
npm -v    # ต้องเป็น v9 ขึ้นไป
```

ถ้าเวอร์ชันเก่า ให้ดาวน์โหลด Node.js ใหม่จาก https://nodejs.org

---

### ❌ Login แล้ว redirect วนไม่หยุด

**สาเหตุ:** `SESSION_SECRET` ใน `.env` ว่างเปล่า

**วิธีแก้:** เปิด `.env` แล้วใส่ค่าที่ `SESSION_SECRET`:
```env
SESSION_SECRET=ใส่ข้อความอะไรก็ได้ยาวๆ
```

---

### ❌ Session หายหลังปิดเบราว์เซอร์

พฤติกรรมปกติ — ระบบใช้ Session Cookie ที่ไม่มี `maxAge`
ปิดเบราว์เซอร์ = session หาย = ต้อง login ใหม่

---

## Tech Stack รายละเอียด

| ชื่อ | เวอร์ชัน | หน้าที่ |
|---|---|---|
| Node.js | v18+ | JavaScript runtime |
| Express | 4.18 | Web framework |
| EJS | 3.1 | Template engine (HTML + JS) |
| mysql2 | 3.6 | เชื่อมต่อ MySQL แบบ Promise |
| express-session | 1.17 | จัดการ session ผู้ใช้ |
| bcryptjs | 2.4 | เข้ารหัส password |
| dotenv | 16.3 | โหลด .env เข้า process.env |
| nodemon | 3.0 | auto-restart เมื่อแก้ code (dev) |
| Tailwind CSS | CDN | utility-first CSS framework |
| Font: Sarabun | Google Fonts | รองรับภาษาไทย |
