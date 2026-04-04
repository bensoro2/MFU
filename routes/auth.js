const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs'); // ใช้ verify password ที่ hash ด้วย bcrypt
const crypto  = require('crypto');   // สร้าง CSRF token ใหม่หลัง login
const db      = require('../config/db');
const { verifyCsrf } = require('../middleware/auth');

// POST /auth/voter-login — ผู้ลงคะแนนเข้าสู่ระบบด้วยเลขบัตรประชาชน + รหัสหลังบัตร
router.post('/voter-login', verifyCsrf, async (req, res) => {
  // ลบช่องว่างออกจาก citizen_id และแปลง laser_id เป็นตัวพิมพ์ใหญ่
  const citizen_id = (req.body.citizen_id || '').replace(/\s+/g, '');
  const laser_id   = (req.body.laser_id   || '').trim().toUpperCase();

  // ตรวจสอบว่ากรอกข้อมูลครบ
  if (!citizen_id || !laser_id) {
    req.session.flash_error = 'กรุณากรอกเลขบัตรประชาชนและรหัสหลังบัตร';
    return res.redirect('/login?tab=voter');
  }

  try {
    // ค้นหาผู้ลงคะแนนที่ตรงกับทั้ง citizen_id และ laser_id
    const [rows] = await db.execute(
      'SELECT * FROM voters WHERE citizen_id = ? AND laser_id = ?',
      [citizen_id, laser_id]
    );

    if (rows.length === 0) {
      req.session.flash_error = 'เลขบัตรประชาชนหรือรหัสหลังบัตรไม่ถูกต้อง';
      return res.redirect('/login?tab=voter');
    }

    const voter = rows[0];

    // ตรวจสอบว่าบัญชีไม่ถูกปิด
    if (!voter.is_enabled) {
      req.session.flash_error = 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
      return res.redirect('/login?tab=voter');
    }

    // สร้าง session ID ใหม่เพื่อป้องกัน session fixation attack
    req.session.regenerate((err) => {
      req.session.role       = 'voter';          // กำหนด role
      req.session.voter_id   = voter.id;          // เก็บ id ของ voter
      req.session.citizen_id = voter.citizen_id;  // เก็บเลขบัตรฯ
      req.session.csrf_token = crypto.randomBytes(32).toString('hex'); // CSRF token ใหม่
      res.redirect('/voter/dashboard');
    });
  } catch (err) {
    console.error('voter-login error:', err);
    req.session.flash_error = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    res.redirect('/login?tab=voter');
  }
});

// POST /auth/candidate-login — ผู้สมัครเข้าสู่ระบบด้วย Candidate ID + Password
router.post('/candidate-login', verifyCsrf, async (req, res) => {
  // แปลง candidate_code เป็นตัวพิมพ์ใหญ่
  const candidate_code = (req.body.candidate_code || '').trim().toUpperCase();
  const password       = (req.body.password || '');

  // ตรวจสอบว่ากรอกข้อมูลครบ
  if (!candidate_code || !password) {
    req.session.flash_error = 'กรุณากรอก Candidate ID และ Password';
    return res.redirect('/login?tab=candidate');
  }

  try {
    // ค้นหาผู้สมัครจากรหัส
    const [rows] = await db.execute(
      'SELECT * FROM candidates WHERE candidate_id = ?',
      [candidate_code]
    );

    if (rows.length === 0) {
      req.session.flash_error = 'ไม่พบ Candidate ID นี้ในระบบ';
      return res.redirect('/login?tab=candidate');
    }

    const candidate = rows[0];

    // ตรวจสอบว่าลงทะเบียนแล้ว
    if (!candidate.is_registered) {
      req.session.flash_error = 'ID นี้ยังไม่ได้ลงทะเบียน กรุณาลงทะเบียนก่อน';
      return res.redirect('/login?tab=candidate');
    }

    // ตรวจสอบว่าบัญชีไม่ถูกปิด
    if (!candidate.is_enabled) {
      req.session.flash_error = 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
      return res.redirect('/login?tab=candidate');
    }

    // เปรียบเทียบ password กับ bcrypt hash ที่เก็บใน DB
    const match = await bcrypt.compare(password, candidate.password_hash);
    if (!match) {
      req.session.flash_error = 'Password ไม่ถูกต้อง';
      return res.redirect('/login?tab=candidate');
    }

    // สร้าง session ใหม่หลัง login สำเร็จ
    req.session.regenerate((err) => {
      req.session.role           = 'candidate';
      req.session.candidate_id   = candidate.id;              // primary key ใน DB
      req.session.candidate_code = candidate.candidate_id;    // เช่น C-0001
      req.session.candidate_name = candidate.full_name;       // ชื่อผู้สมัคร
      req.session.csrf_token     = crypto.randomBytes(32).toString('hex');
      res.redirect('/candidate/dashboard');
    });
  } catch (err) {
    console.error('candidate-login error:', err);
    req.session.flash_error = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    res.redirect('/login?tab=candidate');
  }
});

// POST /auth/candidate-register — ลงทะเบียนผู้สมัครครั้งแรก
router.post('/candidate-register', verifyCsrf, async (req, res) => {
  const candidate_code    = (req.body.candidate_code    || '').trim().toUpperCase();
  const full_name         = (req.body.full_name         || '').trim();
  const password          = (req.body.password          || '');
  const password_confirm  = (req.body.password_confirm  || '');
  const email             = (req.body.email             || '').trim().toLowerCase();

  try {
    // ตรวจสอบว่าเปิดรับลงทะเบียนอยู่
    const [settings] = await db.execute(
      "SELECT setting_value FROM settings WHERE setting_key = 'registration_enabled'"
    );
    if (!settings.length || settings[0].setting_value !== '1') {
      req.session.flash_error = 'ปิดรับลงทะเบียนผู้สมัครแล้ว';
      return res.redirect('/login?tab=candidate');
    }

    // ตรวจสอบว่ากรอกข้อมูลครบ
    if (!candidate_code || !full_name || !password || !password_confirm || !email) {
      req.session.flash_error = 'กรุณากรอกข้อมูลให้ครบถ้วน';
      return res.redirect('/login?tab=candidate');
    }

    // ค้นหา candidate ID ในระบบ
    const [rows] = await db.execute(
      'SELECT * FROM candidates WHERE candidate_id = ?',
      [candidate_code]
    );

    if (rows.length === 0) {
      req.session.flash_error = 'ไม่พบ Candidate ID นี้ในระบบ กรุณาติดต่อ Admin';
      return res.redirect('/login?tab=candidate');
    }

    // ต้องยังไม่ได้ลงทะเบียน
    if (rows[0].is_registered) {
      req.session.flash_error = 'Candidate ID นี้ลงทะเบียนแล้ว';
      return res.redirect('/login?tab=candidate');
    }

    // ตรวจสอบความยาว password อย่างน้อย 6 ตัวอักษร
    if (password.length < 6) {
      req.session.flash_error = 'Password ต้องมีอย่างน้อย 6 ตัวอักษร';
      return res.redirect('/login?tab=candidate');
    }

    // ตรวจสอบว่า password และ password_confirm ตรงกัน
    if (password !== password_confirm) {
      req.session.flash_error = 'Password ไม่ตรงกัน';
      return res.redirect('/login?tab=candidate');
    }

    // ตรวจสอบ email ต้องเป็น @gmail.com
    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
      req.session.flash_error = 'กรุณากรอก Gmail ที่ถูกต้อง (@gmail.com)';
      return res.redirect('/login?tab=candidate');
    }

    // เข้ารหัส password ด้วย bcrypt (cost factor 10)
    const hash = await bcrypt.hash(password, 10);

    // อัปเดตข้อมูลผู้สมัคร: ตั้ง is_registered = 1
    await db.execute(
      `UPDATE candidates
         SET password_hash = ?, full_name = ?, email = ?,
             is_registered = 1, registered_at = NOW()
       WHERE candidate_id = ?`,
      [hash, full_name, email, candidate_code]
    );

    req.session.flash_success = 'ลงทะเบียนสำเร็จ กรุณาเข้าสู่ระบบ';
    res.redirect('/login?tab=candidate');
  } catch (err) {
    console.error('candidate-register error:', err);
    req.session.flash_error = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    res.redirect('/login?tab=candidate');
  }
});

// POST /auth/admin-login — Admin เข้าสู่ระบบ (credentials เก็บใน .env)
router.post('/admin-login', verifyCsrf, (req, res) => {
  const { username, password } = req.body;

  // ตรวจสอบว่ากรอกข้อมูลครบ
  if (!username || !password) {
    req.session.flash_error = 'กรุณากรอก Username และ Password';
    return res.redirect('/login?tab=admin');
  }

  // เปรียบเทียบกับค่าใน environment variable (ไม่ได้เก็บใน DB)
  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    req.session.flash_error = 'Username หรือ Password ไม่ถูกต้อง';
    return res.redirect('/login?tab=admin');
  }

  // สร้าง session ใหม่สำหรับ admin
  req.session.regenerate((err) => {
    req.session.role       = 'admin';
    req.session.admin      = true;
    req.session.csrf_token = crypto.randomBytes(32).toString('hex');
    res.redirect('/admin/dashboard');
  });
});

module.exports = router;
