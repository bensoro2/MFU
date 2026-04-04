# MFU Election System

ระบบเลือกตั้งออนไลน์สำหรับมหาวิทยาลัยแม่ฟ้าหลวง (Mae Fah Luang University) พัฒนาด้วย Node.js + Express + EJS

---

## Stack และ Dependencies

| ส่วน | เทคโนโลยี |
|---|---|
| Runtime | Node.js |
| Web Framework | Express 4 |
| Template Engine | EJS |
| Database | MySQL (ผ่าน mysql2/promise) |
| Session | express-session |
| Password Hashing | bcryptjs |
| Config | dotenv |
| Dev Server | nodemon |
| CSS | Tailwind CDN + Custom CSS (`public/assets/app.css`) |
| Font | Sarabun (ภาษาไทย) |
| สีหลัก | Maroon `#8c1515`, Gold `#fec260` |

---

## โครงสร้างโปรเจค

```
mfu_election_node/
├── server.js                  # Entry point — ตั้งค่า Express, middleware, routes
├── .env                       # Environment variables (DB, Session, Admin credentials)
├── config/
│   └── db.js                  # MySQL connection pool (mysql2/promise)
├── middleware/
│   └── auth.js                # requireRole(), verifyCsrf(), isLoggedIn(), currentRole()
├── routes/
│   ├── index.js               # GET /, /login, /logout
│   ├── auth.js                # POST /auth/* (login, register)
│   ├── admin.js               # GET|POST /admin/*
│   ├── candidate.js           # GET|POST /candidate/*
│   └── voter.js               # GET|POST /voter/*
├── views/
│   ├── login.ejs              # หน้า login (3 แท็บ)
│   ├── partials/
│   │   ├── header.ejs         # Navbar + flash messages
│   │   └── footer.ejs         # Scripts closing tags
│   ├── admin/
│   │   ├── dashboard.ejs      # สถิติรวม + top 5 + toggle settings
│   │   ├── candidates.ejs     # จัดการผู้สมัคร
│   │   ├── voters.ejs         # จัดการผู้มีสิทธิ์โหวต (paginated)
│   │   └── results.ejs        # ผลการเลือกตั้ง
│   ├── candidate/
│   │   ├── dashboard.ejs      # คะแนน + อันดับของตัวเอง
│   │   ├── profile.ejs        # แก้ไขชื่อ + นโยบาย
│   │   └── results.ejs        # ผลคะแนนรวม
│   └── voter/
│       ├── dashboard.ejs      # รายชื่อผู้สมัคร + ปุ่มโหวต
│       ├── results.ejs        # ผลคะแนนรวม
│       └── history.ejs        # ประวัติการโหวตของตัวเอง
└── public/
    └── assets/
        ├── app.css            # Custom styles (สีมหาวิทยาลัย, component classes)
        └── app.js             # Client-side JS เล็กน้อย
```

---

## ตาราง Database

### `voters` — ผู้มีสิทธิ์ลงคะแนน
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | INT PK | Auto increment |
| citizen_id | VARCHAR(13) UNIQUE | เลขบัตรประชาชน |
| laser_id | VARCHAR(20) | รหัสหลังบัตร |
| is_enabled | TINYINT(1) | 1=เปิด / 0=ปิด |
| has_voted | TINYINT(1) | 1=โหวตแล้ว |
| created_at | DATETIME | วันที่เพิ่มเข้าระบบ |

### `candidates` — ผู้สมัครรับเลือกตั้ง
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | INT PK | Auto increment |
| candidate_id | VARCHAR(10) UNIQUE | รหัสผู้สมัคร เช่น `C-0001` |
| number | INT UNIQUE | หมายเลขผู้สมัคร (1–99) |
| full_name | VARCHAR | ชื่อ-นามสกุล |
| email | VARCHAR | Gmail เท่านั้น |
| password_hash | VARCHAR | bcrypt hash |
| policy | TEXT | นโยบายของผู้สมัคร |
| is_registered | TINYINT(1) | ลงทะเบียนแล้วหรือยัง |
| is_enabled | TINYINT(1) | Admin เปิด/ปิดบัญชี |
| registered_at | DATETIME | วันที่ลงทะเบียน |

### `votes` — บันทึกการโหวต
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | INT PK | Auto increment |
| voter_id | INT FK | อ้างอิง voters.id |
| candidate_id | INT FK | อ้างอิง candidates.id |
| voted_at | DATETIME | เวลาที่โหวต |

> มี UNIQUE constraint บน (voter_id, candidate_id) เพื่อป้องกันโหวตซ้ำระดับ DB

### `settings` — การตั้งค่าระบบ
| setting_key | setting_value | ความหมาย |
|---|---|---|
| voting_enabled | 0 / 1 | เปิด/ปิดรับโหวต |
| registration_enabled | 0 / 1 | เปิด/ปิดลงทะเบียนผู้สมัคร |

---

## Roles และสิทธิ์การเข้าถึง

ระบบมี 3 roles ควบคุมด้วย `req.session.role`

```
voter     → /voter/*
candidate → /candidate/*
admin     → /admin/*
```

Middleware `requireRole(role)` ใน `middleware/auth.js` ตรวจสอบทุก request
ถ้า role ไม่ตรงหรือยังไม่ได้ login → redirect ไป `/login`

---

## การรักษาความปลอดภัย

| กลไก | รายละเอียด |
|---|---|
| **CSRF Protection** | ทุก POST ต้องส่ง `csrf_token` ที่ตรงกับ session token ซึ่ง generate ด้วย `crypto.randomBytes(32)` |
| **Session Fixation** | เรียก `req.session.regenerate()` หลัง login ทุกครั้ง |
| **Password Hashing** | bcrypt cost factor 10 |
| **Admin Credentials** | เก็บใน `.env` ไม่ได้อยู่ใน database |
| **Cookie Security** | `httpOnly: true`, `sameSite: 'strict'` |
| **Double-Vote Guard** | ตรวจสอบทั้ง `has_voted` (application layer) และ UNIQUE constraint (database layer) |
| **Transaction** | การโหวตใช้ MySQL transaction — INSERT votes + UPDATE has_voted ต้องสำเร็จพร้อมกัน |

---

## Flow การทำงาน

### 1. Voter Login และโหวต
```
เปิด /login (tab: voter)
  → กรอก citizen_id + laser_id
  → POST /auth/voter-login
  → ตรวจสอบ DB + is_enabled
  → session.regenerate() → role = 'voter'
  → redirect /voter/dashboard

/voter/dashboard
  → แสดงรายชื่อผู้สมัคร + ปุ่มโหวต (ถ้า votingEnabled = 1)
  → POST /voter/cast-vote (candidate_id)
  → Transaction: INSERT votes + UPDATE has_voted
  → redirect กลับ dashboard พร้อม flash_success
```

### 2. Candidate Register และ Login
```
Admin เพิ่ม candidate_id (C-XXXX) และหมายเลขก่อน
  → POST /admin/add-candidate

ผู้สมัครเปิด /login (tab: candidate)
  → กรอก candidate_code + ข้อมูลส่วนตัว
  → POST /auth/candidate-register
  → ตรวจ registration_enabled = 1
  → bcrypt.hash(password) + UPDATE candidates SET is_registered=1
  → redirect กลับ login

Login → POST /auth/candidate-login
  → bcrypt.compare() ตรวจ password
  → session.regenerate() → role = 'candidate'
  → redirect /candidate/dashboard
```

### 3. Admin
```
POST /auth/admin-login
  → ตรวจสอบกับ process.env.ADMIN_USERNAME / ADMIN_PASSWORD
  → ไม่ผ่าน DB เลย
  → session.regenerate() → role = 'admin'
  → redirect /admin/dashboard

/admin/dashboard  → สถิติรวม, top 5, toggle voting/registration
/admin/voters     → เพิ่ม/เปิด/ปิด voter (paginated 20 รายการ/หน้า)
/admin/candidates → เพิ่ม/เปิด/ปิด candidate
/admin/results    → ผลคะแนนทั้งหมด
```

---

## Environment Variables (.env)

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=mfu_election
DB_USER=root
DB_PASS=your_password

SESSION_SECRET=your_secret_key

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

---

## วิธีรัน

```bash
# ติดตั้ง dependencies
npm install

# รัน development (auto-reload)
npm run dev

# รัน production
npm start
```

เปิดเบราว์เซอร์ที่ `http://localhost:3000`

> ต้องเปิด XAMPP MySQL ก่อน และสร้าง database `mfu_election` พร้อม schema ให้ครบ

---

## API Endpoints สรุป

ดูรายละเอียด body ทั้งหมดได้ที่ `mfu_election.postman_collection.json`

| Method | Path | Role | คำอธิบาย |
|---|---|---|---|
| GET | `/login` | - | หน้า login (?tab=voter\|candidate\|admin) |
| GET | `/logout` | ทุก role | ออกจากระบบ |
| POST | `/auth/voter-login` | - | Voter เข้าสู่ระบบ |
| POST | `/auth/candidate-login` | - | Candidate เข้าสู่ระบบ |
| POST | `/auth/candidate-register` | - | Candidate ลงทะเบียนครั้งแรก |
| POST | `/auth/admin-login` | - | Admin เข้าสู่ระบบ |
| GET | `/admin/dashboard` | admin | สถิติและตั้งค่าระบบ |
| GET | `/admin/voters` | admin | รายชื่อผู้มีสิทธิ์โหวต |
| POST | `/admin/add-voter` | admin | เพิ่มผู้มีสิทธิ์โหวต |
| POST | `/admin/toggle-voter` | admin | เปิด/ปิดบัญชี voter |
| GET | `/admin/candidates` | admin | รายชื่อผู้สมัคร |
| POST | `/admin/add-candidate` | admin | เพิ่มผู้สมัคร |
| POST | `/admin/toggle-candidate` | admin | เปิด/ปิดบัญชี candidate |
| POST | `/admin/toggle-settings` | admin | เปิด/ปิดระบบโหวตหรือลงทะเบียน |
| GET | `/admin/results` | admin | ผลการเลือกตั้ง |
| GET | `/candidate/dashboard` | candidate | หน้าหลัก + คะแนน + อันดับ |
| GET | `/candidate/profile` | candidate | ดูโปรไฟล์ |
| POST | `/candidate/update-profile` | candidate | แก้ชื่อและนโยบาย |
| GET | `/candidate/results` | candidate | ผลคะแนนรวม |
| GET | `/voter/dashboard` | voter | รายชื่อผู้สมัคร + ปุ่มโหวต |
| POST | `/voter/cast-vote` | voter | ลงคะแนนเสียง |
| GET | `/voter/results` | voter | ผลคะแนนรวม |
| GET | `/voter/history` | voter | ประวัติการโหวตของตัวเอง |
