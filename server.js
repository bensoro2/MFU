// โหลด environment variables จากไฟล์ .env ก่อนอื่น
require('dotenv').config();

// นำเข้า package ที่จำเป็น
const express  = require('express');
const session  = require('express-session');
const path     = require('path');
const crypto   = require('crypto'); // โมดูลสร้าง CSRF token

const app  = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่า template engine เป็น EJS
app.set('view engine', 'ejs');
// กำหนดโฟลเดอร์สำหรับไฟล์ views
app.set('views', path.join(__dirname, 'views'));

// --- Middleware ---

// parse form data (application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));
// parse JSON body (ใช้กับ AJAX request)
app.use(express.json());

// serve ไฟล์ static (CSS, JS) จากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

// ตั้งค่า session
app.use(session({
  secret:            process.env.SESSION_SECRET, // key สำหรับ sign cookie
  resave:            false,                       // ไม่ save session ซ้ำถ้าไม่มีการเปลี่ยนแปลง
  saveUninitialized: false,                       // ไม่ save session ที่ยังไม่ได้ใช้
  cookie: {
    httpOnly: true,    // ป้องกัน JavaScript อ่าน cookie ได้โดยตรง
    sameSite: 'strict' // ป้องกัน CSRF cross-site
    // maxAge ไม่กำหนด = session cookie (หายเมื่อปิดเบราว์เซอร์)
  }
}));

// Middleware สร้าง CSRF token อัตโนมัติทุก request
app.use((req, res, next) => {
  // สร้าง token ใหม่ถ้ายังไม่มีใน session
  if (!req.session.csrf_token) {
    req.session.csrf_token = crypto.randomBytes(32).toString('hex');
  }
  // ส่ง token ไปยัง template ผ่าน res.locals
  res.locals.csrf_token = req.session.csrf_token;
  next();
});

// Middleware ส่งข้อมูล session และ flash messages ไปยัง views
app.use((req, res, next) => {
  res.locals.session       = req.session;           // ข้อมูล session ใน template
  res.locals.flash_error   = req.session.flash_error   || null;
  res.locals.flash_success = req.session.flash_success || null;
  // ลบ flash message หลังจากอ่านแล้ว (แสดงได้ครั้งเดียว)
  delete req.session.flash_error;
  delete req.session.flash_success;
  next();
});

// --- Routes ---
app.use('/',          require('./routes/index'));      // หน้าแรก + login + logout
app.use('/auth',      require('./routes/auth'));       // process login/register forms
app.use('/admin',     require('./routes/admin'));      // หน้า admin
app.use('/candidate', require('./routes/candidate')); // หน้า candidate
app.use('/voter',     require('./routes/voter'));      // หน้า voter
app.use('/api',       require('./routes/api'));        // JSON API

// เริ่มฟัง port
app.listen(PORT, () => {
  console.log(`\n🗳  MFU Election กำลังทำงานที่ http://localhost:${PORT}`);
});
