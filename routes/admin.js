// ============================================================
// ไฟล์: routes/admin.js
// หน้าที่: กำหนด URL ทั้งหมดของฝั่ง Admin ว่าเมื่อเข้าหน้าไหน
//          ให้ดึงข้อมูลอะไรจาก Database และส่งไปแสดงผลอย่างไร
// ============================================================

// นำเข้า express เพื่อสร้าง Router (ตัวจัดการ URL)
const express = require('express');

// สร้าง Router object — เหมือนสมุดจดรายการ URL ทั้งหมดของ admin
const router  = express.Router();

// นำเข้า db — ตัวเชื่อมต่อกับ MySQL Database ที่เตรียมไว้ใน config/db.js
const db      = require('../config/db');

// นำเข้า middleware 2 ตัว:
//   requireRole  — ตรวจสอบว่าผู้ใช้ login แล้วและมี role ที่ถูกต้องหรือไม่
//   verifyCsrf   — ตรวจสอบ CSRF token เพื่อป้องกันการโจมตีจากเว็บอื่น
const { requireRole, verifyCsrf } = require('../middleware/auth');


// ============================================================
// SECTION: Helper Functions (ฟังก์ชันช่วยงานที่ใช้ซ้ำหลายที่)
// ============================================================

// ฟังก์ชัน getStats() — ดึงตัวเลขสถิติภาพรวมของระบบทั้งหมด
// เป็น async เพราะต้องรอผลจาก Database ก่อนจึงจะคืนค่าได้
async function getStats() {

  // นับจำนวนผู้มีสิทธิ์โหวตที่ is_enabled = 1 (บัญชีไม่ถูกปิด)
  // [[{ c: totalVoters }]] = destructuring ผลลัพธ์จาก MySQL ที่คืนมาเป็น array ซ้อน array
  // db.execute() ส่ง SQL ไปรันที่ Database และรอผล
  const [[{ c: totalVoters     }]] = await db.execute('SELECT COUNT(*) c FROM voters     WHERE is_enabled = 1');

  // นับจำนวนผู้สมัครที่ลงทะเบียนแล้ว (is_registered = 1) และบัญชีไม่ถูกปิด
  const [[{ c: totalCandidates }]] = await db.execute('SELECT COUNT(*) c FROM candidates WHERE is_registered = 1 AND is_enabled = 1');

  // นับจำนวนโหวตทั้งหมดในตาราง votes (แต่ละแถว = 1 คนที่โหวตแล้ว)
  const [[{ c: totalVotes      }]] = await db.execute('SELECT COUNT(*) c FROM votes');

  // คำนวณเปอร์เซ็นต์ผู้มาใช้สิทธิ์
  // เช่น โหวต 75 คน จากทั้งหมด 100 คน = 75%
  // ถ้า totalVoters = 0 ให้คืน 0 เพื่อป้องกัน หารด้วยศูนย์ (NaN)
  const pct = totalVoters > 0 ? Math.round((totalVotes / totalVoters) * 100) : 0;

  // คืนค่าทั้งหมดเป็น object เดียว เพื่อให้เรียกใช้ง่าย
  return { totalVoters, totalCandidates, totalVotes, pct };
}

// ฟังก์ชัน getSetting(key) — ดึงค่าการตั้งค่าจากตาราง settings
// รับ key เป็น string เช่น 'voting_enabled' หรือ 'registration_enabled'
async function getSetting(key) {

  // ค้นหาแถวใน settings ที่ setting_key ตรงกับ key ที่ส่งมา
  // [rows] = ผลลัพธ์เป็น array ของแถวที่เจอ
  const [rows] = await db.execute('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);

  // ถ้าเจอข้อมูล (rows.length > 0) ให้คืนค่า setting_value ของแถวแรก
  // ถ้าไม่เจอ ให้คืน '0' เป็นค่า default (ปิดอยู่)
  return rows.length ? rows[0].setting_value : '0';
}


// ============================================================
// SECTION: Routes (URL ต่างๆ ของ Admin)
// ============================================================

// ------------------------------------------------------------
// GET /admin/dashboard — หน้าหลัก Dashboard ของ Admin
// ------------------------------------------------------------
// router.get = รับ HTTP GET request (การเปิด URL ในเบราว์เซอร์)
// '/dashboard' = เส้นทาง URL (ใช้ร่วมกับ prefix /admin ใน server.js)
// requireRole('admin') = middleware กรองคนที่ไม่ใช่ admin ออก
// async (req, res) => {} = ฟังก์ชันที่รันเมื่อมีคนเข้า URL นี้
//   req = ข้อมูลที่ browser ส่งมา (query string, session, cookies, ฯลฯ)
//   res = ตัวที่ใช้ตอบกลับ (render HTML, redirect, ส่ง JSON ฯลฯ)
router.get('/dashboard', requireRole('admin'), async (req, res) => {
  try {
    // ดึงสถิติรวมทั้งหมดโดยเรียกฟังก์ชัน getStats() ที่นิยามไว้ด้านบน
    const stats               = await getStats();

    // ดึงว่าเปิดรับโหวตอยู่ไหม ('1' = เปิด, '0' = ปิด)
    const votingEnabled       = await getSetting('voting_enabled');

    // ดึงว่าเปิดรับลงทะเบียนผู้สมัครอยู่ไหม
    const registrationEnabled = await getSetting('registration_enabled');

    // ดึง 5 อันดับผู้สมัครที่ได้คะแนนโหวตสูงสุด
    const [topCandidates] = await db.execute(`
      SELECT c.id, c.candidate_id, c.full_name, c.number, c.is_enabled,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
       WHERE c.is_registered = 1
       GROUP BY c.id
       ORDER BY vote_count DESC
       LIMIT 5
    `);
    // อธิบาย SQL ด้านบน:
    //   SELECT ... FROM candidates c  = เลือกข้อมูลจากตาราง candidates (ตั้งชื่อย่อเป็น c)
    //   LEFT JOIN votes v ON c.id = v.candidate_id
    //     = รวมข้อมูลกับตาราง votes (ย่อ v) โดยจับคู่กัน
    //       LEFT JOIN = แม้ผู้สมัครไม่มีโหวตเลย ก็ยังดึงข้อมูลออกมา (vote_count = 0)
    //   WHERE c.is_registered = 1 = เฉพาะผู้สมัครที่ลงทะเบียนแล้วเท่านั้น
    //   GROUP BY c.id = จัดกลุ่มตาม id ของผู้สมัคร เพื่อให้ COUNT(v.id) นับต่อคน
    //   ORDER BY vote_count DESC = เรียงจากคะแนนมากไปน้อย
    //   LIMIT 5 = เอาแค่ 5 อันดับแรก

    // ส่งข้อมูลทั้งหมดไปแสดงที่ไฟล์ views/admin/dashboard.ejs
    // title = ชื่อหัวข้อหน้าเว็บ
    // stats, votingEnabled, registrationEnabled, topCandidates = ตัวแปรที่ template จะใช้
    res.render('admin/dashboard', {
      title: 'Admin Dashboard', stats,
      votingEnabled, registrationEnabled, topCandidates
    });
  } catch (err) {
    // ถ้าเกิด error อะไรก็ตาม ให้พิมพ์ใน terminal เพื่อ debug
    console.error(err);
    // ส่ง HTTP status 500 (Internal Server Error) พร้อมข้อความแจ้งผู้ใช้
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});


// ------------------------------------------------------------
// GET /admin/candidates — หน้าจัดการรายชื่อผู้สมัคร
// ------------------------------------------------------------
router.get('/candidates', requireRole('admin'), async (req, res) => {
  try {
    // รับคำค้นหาจาก URL เช่น /admin/candidates?search=สมชาย
    // ถ้าไม่มี search ให้เป็น string ว่าง แล้วตัดช่องว่างหัวท้ายด้วย .trim()
    const search = (req.query.search || '').trim();

    // เตรียม SQL query สำหรับดึงรายชื่อผู้สมัคร
    // ยังไม่ใส่ WHERE เพราะจะเพิ่มแบบมีเงื่อนไขด้านล่าง
    let query = `
      SELECT c.id, c.candidate_id, c.full_name, c.email, c.number,
             c.is_registered, c.is_enabled, c.registered_at,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
    `;

    // เตรียม array สำหรับเก็บค่าที่จะแทน ? ใน SQL (ป้องกัน SQL Injection)
    const params = [];

    // ถ้าผู้ใช้พิมพ์ค้นหา ให้เพิ่มเงื่อนไข WHERE เข้าไปใน query
    if (search) {
      // LIKE '%คำค้นหา%' = หาแบบมี keyword อยู่ตรงไหนก็ได้ในชื่อหรือรหัส
      query += ' WHERE c.full_name LIKE ? OR c.candidate_id LIKE ?';
      // push ค่า search ลง params 2 ครั้ง เพราะมี ? อยู่ 2 ตัว
      params.push(`%${search}%`, `%${search}%`);
    }

    // เพิ่ม GROUP BY และ ORDER BY ต่อท้าย query เสมอ
    // GROUP BY c.id = จัดกลุ่มให้ COUNT(v.id) นับโหวตต่อผู้สมัคร 1 คน
    // ORDER BY c.number ASC = เรียงตามหมายเลขผู้สมัคร น้อยไปมาก
    query += ' GROUP BY c.id ORDER BY c.number ASC';

    // รัน SQL และเก็บผลลัพธ์ใน candidates (array ของ object ข้อมูลผู้สมัคร)
    const [candidates] = await db.execute(query, params);

    // ส่ง candidates และ search (เพื่อแสดงในช่อง search) ไปที่ template
    res.render('admin/candidates', { title: 'จัดการผู้สมัคร', candidates, search });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});


// ------------------------------------------------------------
// POST /admin/add-candidate — เพิ่มผู้สมัครใหม่เข้าระบบ
// ------------------------------------------------------------
// router.post = รับ HTTP POST request (การ submit form จากเบราว์เซอร์)
router.post('/add-candidate', requireRole('admin'), verifyCsrf, async (req, res) => {

  // ดึงค่า candidate_id จาก form ที่ submit มา
  // req.body = ข้อมูลที่ส่งมาใน form (ต้องมี express.urlencoded() ใน server.js)
  // .trim() = ตัดช่องว่างหัวท้าย
  // .toUpperCase() = แปลงเป็นตัวใหญ่ทั้งหมด เช่น c-0001 → C-0001
  const candidate_id = (req.body.candidate_id || '').trim().toUpperCase();

  // แปลงหมายเลขผู้สมัครจาก string เป็น integer
  // parseInt('5') = 5, parseInt('abc') = NaN (ไม่ใช่ตัวเลข)
  const number = parseInt(req.body.number);

  // ตรวจสอบรูปแบบ candidate_id ด้วย Regular Expression
  // /^C-\d{4}$/ หมายความว่า:
  //   ^ = ต้องเริ่มต้นด้วย
  //   C- = ตัวอักษร C ตามด้วยขีด
  //   \d{4} = ตัวเลข 4 หลักพอดี
  //   $ = จบที่นี่
  // .test() = คืน true/false ว่า string ตรงกับ pattern หรือไม่
  // ! ข้างหน้า = ถ้าไม่ตรงกัน
  if (!/^C-\d{4}$/.test(candidate_id)) {
    // เก็บข้อความ error ไว้ใน session เพื่อแสดงในหน้าถัดไป (flash message)
    req.session.flash_error = 'รูปแบบ Candidate ID ไม่ถูกต้อง (ตัวอย่าง: C-0001)';
    // redirect กลับหน้า candidates แล้วหยุดฟังก์ชัน (return)
    return res.redirect('/admin/candidates');
  }

  // ตรวจสอบหมายเลขผู้สมัคร:
  //   isNaN(number) = ถ้า parseInt ไม่สำเร็จ จะได้ NaN
  //   number < 1 หรือ > 99 = อยู่นอกช่วงที่กำหนด
  if (isNaN(number) || number < 1 || number > 99) {
    req.session.flash_error = 'หมายเลขผู้สมัครต้องอยู่ระหว่าง 1–99';
    return res.redirect('/admin/candidates');
  }

  try {
    // ตรวจสอบว่า candidate_id ซ้ำกับที่มีอยู่ในฐานข้อมูลไหม
    // [[existId]] = ดึงแถวแรกของผลลัพธ์แรก (nested destructuring)
    // ถ้าไม่เจอ existId จะเป็น undefined (falsy)
    const [[existId]] = await db.execute(
      'SELECT id FROM candidates WHERE candidate_id = ?',
      [candidate_id]
    );
    if (existId) {
      req.session.flash_error = 'Candidate ID นี้มีอยู่แล้ว';
      return res.redirect('/admin/candidates');
    }

    // ตรวจสอบว่าหมายเลขผู้สมัครซ้ำกับที่มีอยู่ไหม
    const [[existNum]] = await db.execute(
      'SELECT id FROM candidates WHERE number = ?',
      [number]
    );
    if (existNum) {
      req.session.flash_error = 'หมายเลขผู้สมัครนี้ถูกใช้แล้ว';
      return res.redirect('/admin/candidates');
    }

    // เพิ่มผู้สมัครใหม่ลงฐานข้อมูล
    // ตอนนี้ยังไม่มีชื่อ/password — รอให้ผู้สมัครมาลงทะเบียนเองที่หน้า login
    // INSERT INTO ... VALUES (?, ?) = ใส่ค่าตาม ? ด้วย array ด้านหลัง (ปลอดภัยจาก SQL Injection)
    await db.execute(
      'INSERT INTO candidates (candidate_id, number) VALUES (?, ?)',
      [candidate_id, number]
    );

    // แสดงข้อความสำเร็จในหน้าถัดไป (flash success message)
    req.session.flash_success = `เพิ่มผู้สมัคร ${candidate_id} สำเร็จ`;
    res.redirect('/admin/candidates');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    res.redirect('/admin/candidates');
  }
});


// ------------------------------------------------------------
// POST /admin/edit-candidate — แก้ไขข้อมูลผู้สมัครที่มีอยู่แล้ว
// ------------------------------------------------------------
router.post('/edit-candidate', requireRole('admin'), verifyCsrf, async (req, res) => {

  // รับ id ของผู้สมัครที่ต้องการแก้ไข (ส่งมาจาก hidden input ใน form)
  const id = parseInt(req.body.id);

  // รับ candidate_id และ number ใหม่ที่ต้องการแก้เป็น
  const candidate_id = (req.body.candidate_id || '').trim().toUpperCase();
  const number       = parseInt(req.body.number);

  // ถ้า id เป็น 0 หรือ NaN (parseInt ล้มเหลว) แสดงว่าข้อมูลเสีย
  if (!id) {
    req.session.flash_error = 'ข้อมูลไม่ถูกต้อง';
    return res.redirect('/admin/candidates');
  }

  // ตรวจรูปแบบ candidate_id ต้องเป็น C-XXXX เช่นเดียวกับตอน add
  if (!/^C-\d{4}$/.test(candidate_id)) {
    req.session.flash_error = 'รูปแบบ Candidate ID ไม่ถูกต้อง (เช่น C-0001)';
    return res.redirect('/admin/candidates');
  }

  // ตรวจว่าหมายเลขผู้สมัครอยู่ในช่วง 1–99
  if (isNaN(number) || number < 1 || number > 99) {
    req.session.flash_error = 'หมายเลขผู้สมัครต้องอยู่ระหว่าง 1–99';
    return res.redirect('/admin/candidates');
  }

  try {
    // ตรวจว่า candidate_id ใหม่ไปซ้ำกับ คนอื่น หรือเปล่า
    // AND id <> ? = ยกเว้นแถวของตัวเอง (ถ้าไม่ยกเว้น จะ error ว่าซ้ำตัวเอง)
    const [[dupId]] = await db.execute(
      'SELECT id FROM candidates WHERE candidate_id = ? AND id <> ?',
      [candidate_id, id]
    );
    if (dupId) {
      req.session.flash_error = 'Candidate ID นี้ถูกใช้แล้ว';
      return res.redirect('/admin/candidates');
    }

    // ตรวจว่าหมายเลขผู้สมัครใหม่ไปซ้ำกับ คนอื่น หรือเปล่า
    const [[dupNum]] = await db.execute(
      'SELECT id FROM candidates WHERE number = ? AND id <> ?',
      [number, id]
    );
    if (dupNum) {
      req.session.flash_error = 'หมายเลขผู้สมัครนี้ถูกใช้แล้ว';
      return res.redirect('/admin/candidates');
    }

    // อัปเดตข้อมูลในฐานข้อมูล
    // UPDATE ... SET ... WHERE id = ? = แก้เฉพาะแถวที่ id ตรงกัน
    await db.execute(
      'UPDATE candidates SET candidate_id = ?, number = ? WHERE id = ?',
      [candidate_id, number, id]
    );
    req.session.flash_success = 'แก้ไขข้อมูลผู้สมัครสำเร็จ';
    res.redirect('/admin/candidates');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด';
    res.redirect('/admin/candidates');
  }
});


// ------------------------------------------------------------
// POST /admin/delete-candidate — ลบผู้สมัครออกจากระบบ
// ------------------------------------------------------------
router.post('/delete-candidate', requireRole('admin'), verifyCsrf, async (req, res) => {

  // รับ id ของผู้สมัครที่ต้องการลบ
  const id = parseInt(req.body.id);

  if (!id) {
    req.session.flash_error = 'ข้อมูลไม่ถูกต้อง';
    return res.redirect('/admin/candidates');
  }

  try {
    // ก่อนลบ ต้องตรวจก่อนว่ามีคนโหวตให้ผู้สมัครคนนี้แล้วไหม
    // ถ้ามี จะลบไม่ได้ เพราะข้อมูลโหวตจะขาดหาย (data integrity)
    const [[{ vote_count }]] = await db.execute(
      'SELECT COUNT(*) vote_count FROM votes WHERE candidate_id = ?',
      [id]
    );

    // ถ้า vote_count > 0 หมายความว่ามีโหวตแล้ว ห้ามลบ
    if (vote_count > 0) {
      req.session.flash_error = 'ไม่สามารถลบได้ เนื่องจากมีการโหวตให้ผู้สมัครนี้แล้ว';
      return res.redirect('/admin/candidates');
    }

    // ไม่มีโหวต → ลบได้อย่างปลอดภัย
    await db.execute('DELETE FROM candidates WHERE id = ?', [id]);
    req.session.flash_success = 'ลบผู้สมัครสำเร็จ';
    res.redirect('/admin/candidates');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด';
    res.redirect('/admin/candidates');
  }
});


// ------------------------------------------------------------
// POST /admin/toggle-candidate — เปิด/ปิดการใช้งานบัญชีผู้สมัคร
// ------------------------------------------------------------
router.post('/toggle-candidate', requireRole('admin'), verifyCsrf, async (req, res) => {

  // id ของผู้สมัครที่ต้องการเปลี่ยนสถานะ
  const id = parseInt(req.body.id);

  // action = 'enable' (เปิด) หรือ 'disable' (ปิด) ส่งมาจาก hidden input ใน form
  const action = req.body.action;

  // .includes() = ตรวจว่าค่าอยู่ใน array ที่กำหนดไหม
  // ป้องกันค่าแปลกๆ เช่น action = 'delete' หรือ '<script>'
  if (!id || !['enable', 'disable'].includes(action)) {
    req.session.flash_error = 'ข้อมูลไม่ถูกต้อง';
    return res.redirect('/admin/candidates');
  }

  try {
    // แปลง action เป็น 1 หรือ 0 ด้วย ternary operator (? :)
    // 'enable' → 1 (เปิดใช้งาน), อื่นๆ → 0 (ปิด)
    const val = action === 'enable' ? 1 : 0;

    // อัปเดต is_enabled ของผู้สมัครคนนั้น
    await db.execute(
      'UPDATE candidates SET is_enabled = ? WHERE id = ?',
      [val, id]
    );
    req.session.flash_success = action === 'enable' ? 'เปิดใช้งานสำเร็จ' : 'ปิดการใช้งานสำเร็จ';
    res.redirect('/admin/candidates');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด';
    res.redirect('/admin/candidates');
  }
});


// ------------------------------------------------------------
// GET /admin/voters — หน้าจัดการรายชื่อผู้มีสิทธิ์โหวต (มี Pagination)
// ------------------------------------------------------------
router.get('/voters', requireRole('admin'), async (req, res) => {
  try {
    // รับคำค้นหาจาก query string
    const search = (req.query.search || '').trim();

    // รับเลขหน้าจาก URL เช่น ?page=2
    // Math.max(1, ...) = ป้องกันหน้าที่ติดลบหรือ 0
    // parseInt(...) || 1 = ถ้า parseInt ล้มเหลวให้ใช้ 1 แทน
    const page  = Math.max(1, parseInt(req.query.page) || 1);

    // แสดงสูงสุด 20 รายการต่อหน้า
    const limit  = 20;

    // คำนวณ offset (ข้ามกี่แถว)
    // หน้า 1 = offset 0, หน้า 2 = offset 20, หน้า 3 = offset 40 ...
    const offset = (page - 1) * limit;

    // เตรียม params แยกสำหรับ query นับจำนวน และ query ดึงข้อมูล
    const countParams = [];
    const dataParams  = [];
    let   whereClause = '';

    // ถ้ามีคำค้นหา ให้สร้าง WHERE clause และใส่ค่าลง params
    if (search) {
      // ค้นหาจากเลขบัตรประชาชน หรือรหัสหลังบัตร
      whereClause = 'WHERE citizen_id LIKE ? OR laser_id LIKE ?';
      // เพิ่มค่าใส่ทั้ง 2 params (นับจำนวน และดึงข้อมูล ต้องใส่แยกกัน)
      countParams.push(`%${search}%`, `%${search}%`);
      dataParams.push(`%${search}%`, `%${search}%`);
    }

    // นับจำนวน voter ทั้งหมด (รวม filter ด้วยถ้ามี) เพื่อคำนวณจำนวนหน้า
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) total FROM voters ${whereClause}`,
      countParams
    );

    // คำนวณจำนวนหน้าทั้งหมด (ปัดขึ้น เช่น 21 รายการ / 20 = 1.05 → 2 หน้า)
    const totalPages = Math.ceil(total / limit);

    // ดึงข้อมูล voter ตามหน้าที่เลือก
    // LIMIT ${limit} = เอาแค่ 20 แถว
    // OFFSET ${offset} = ข้ามแถวตาม page (ฝังโดยตรงแทน ? เพราะ mysql2 ไม่รองรับ LIMIT/OFFSET เป็น prepared param)
    const [voters] = await db.execute(
      `SELECT * FROM voters ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      dataParams
    );

    // นับจำนวน voter ที่บัญชีเปิดอยู่
    const [[{ active }]] = await db.execute(
      'SELECT COUNT(*) active FROM voters WHERE is_enabled = 1'
    );

    // นับจำนวน voter ที่โหวตไปแล้ว
    const [[{ voted }]] = await db.execute(
      'SELECT COUNT(*) voted FROM voters WHERE has_voted = 1'
    );

    // ส่งข้อมูลทั้งหมดไปแสดงที่ views/admin/voters.ejs
    res.render('admin/voters', {
      title: 'จัดการผู้ลงคะแนน',
      voters,      // รายชื่อ voter ในหน้านี้
      search,      // คำค้นหา (เพื่อแสดงในช่อง input)
      page,        // หน้าปัจจุบัน
      totalPages,  // จำนวนหน้าทั้งหมด
      total,       // จำนวน voter ทั้งหมด
      active,      // จำนวนที่บัญชีเปิด
      voted        // จำนวนที่โหวตแล้ว
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});


// ------------------------------------------------------------
// POST /admin/add-voter — เพิ่มผู้มีสิทธิ์โหวตใหม่
// ------------------------------------------------------------
router.post('/add-voter', requireRole('admin'), verifyCsrf, async (req, res) => {

  // รับเลขบัตรประชาชน แล้วลบช่องว่างทั้งหมดออก (กรณีผู้ใช้พิมพ์เว้นวรรค)
  // replace(/\s+/g, '') = regex แทนที่ช่องว่างทุกตัวด้วย '' (ว่างเปล่า)
  const citizen_id = (req.body.citizen_id || '').replace(/\s+/g, '');

  // รับรหัสหลังบัตร ตัดช่องว่าง และแปลงเป็นตัวพิมพ์ใหญ่
  const laser_id = (req.body.laser_id || '').trim().toUpperCase();

  // ถ้าไม่ได้กรอกข้อมูลมา (!citizen_id หรือ !laser_id = string ว่าง = falsy)
  if (!citizen_id || !laser_id) {
    req.session.flash_error = 'กรุณากรอกเลขบัตรประชาชนและรหัสหลังบัตร';
    return res.redirect('/admin/voters');
  }

  // ตรวจว่าเป็นตัวเลข 13 หลักพอดี
  // /^\d{13}$/ = ตัวเลข (\d) จำนวน 13 ตัวพอดี ไม่มากไม่น้อย
  if (!/^\d{13}$/.test(citizen_id)) {
    req.session.flash_error = 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก';
    return res.redirect('/admin/voters');
  }

  try {
    // ตรวจว่า citizen_id ซ้ำกับที่มีอยู่ในฐานข้อมูลไหม
    const [[exist]] = await db.execute(
      'SELECT id FROM voters WHERE citizen_id = ?',
      [citizen_id]
    );
    if (exist) {
      req.session.flash_error = 'เลขบัตรประชาชนนี้มีอยู่แล้ว';
      return res.redirect('/admin/voters');
    }

    // เพิ่ม voter ใหม่ลงฐานข้อมูล
    // is_enabled และ has_voted จะเป็น default ค่าจาก schema (1 และ 0 ตามลำดับ)
    await db.execute(
      'INSERT INTO voters (citizen_id, laser_id) VALUES (?, ?)',
      [citizen_id, laser_id]
    );
    req.session.flash_success = 'เพิ่มผู้มีสิทธิ์โหวตสำเร็จ';
    res.redirect('/admin/voters');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    res.redirect('/admin/voters');
  }
});


// ------------------------------------------------------------
// POST /admin/edit-voter — แก้ไขข้อมูลผู้มีสิทธิ์โหวต
// ------------------------------------------------------------
router.post('/edit-voter', requireRole('admin'), verifyCsrf, async (req, res) => {

  // รับ id, citizen_id ใหม่, และ laser_id ใหม่
  const id         = parseInt(req.body.id);
  const citizen_id = (req.body.citizen_id || '').replace(/\s+/g, '');
  const laser_id   = (req.body.laser_id   || '').trim().toUpperCase();

  // ตรวจว่าข้อมูลครบ
  if (!id || !citizen_id || !laser_id) {
    req.session.flash_error = 'กรุณากรอกข้อมูลให้ครบ';
    return res.redirect('/admin/voters');
  }

  // ตรวจรูปแบบเลขบัตรประชาชน
  if (!/^\d{13}$/.test(citizen_id)) {
    req.session.flash_error = 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก';
    return res.redirect('/admin/voters');
  }

  try {
    // ตรวจว่า citizen_id ใหม่ซ้ำกับ คนอื่น ไหม (ยกเว้นตัวเอง)
    const [[dup]] = await db.execute(
      'SELECT id FROM voters WHERE citizen_id = ? AND id <> ?',
      [citizen_id, id]
    );
    if (dup) {
      req.session.flash_error = 'เลขบัตรประชาชนนี้มีอยู่แล้ว';
      return res.redirect('/admin/voters');
    }

    // อัปเดตข้อมูลในฐานข้อมูล
    await db.execute(
      'UPDATE voters SET citizen_id = ?, laser_id = ? WHERE id = ?',
      [citizen_id, laser_id, id]
    );
    req.session.flash_success = 'แก้ไขข้อมูลผู้มีสิทธิ์โหวตสำเร็จ';
    res.redirect('/admin/voters');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด';
    res.redirect('/admin/voters');
  }
});


// ------------------------------------------------------------
// POST /admin/delete-voter — ลบผู้มีสิทธิ์โหวตออกจากระบบ
// ------------------------------------------------------------
router.post('/delete-voter', requireRole('admin'), verifyCsrf, async (req, res) => {

  const id = parseInt(req.body.id);

  if (!id) {
    req.session.flash_error = 'ข้อมูลไม่ถูกต้อง';
    return res.redirect('/admin/voters');
  }

  try {
    // ดึงสถานะ has_voted ของ voter คนนี้ก่อน
    const [[voter]] = await db.execute(
      'SELECT has_voted FROM voters WHERE id = ?',
      [id]
    );

    // ถ้าไม่เจอแถว (voter undefined) แสดงว่า id ผิด
    if (!voter) {
      req.session.flash_error = 'ไม่พบข้อมูล';
      return res.redirect('/admin/voters');
    }

    // ถ้าโหวตไปแล้ว ห้ามลบ (มีข้อมูลในตาราง votes อยู่)
    if (voter.has_voted) {
      req.session.flash_error = 'ไม่สามารถลบได้ เนื่องจากผู้นี้โหวตไปแล้ว';
      return res.redirect('/admin/voters');
    }

    // ยังไม่ได้โหวต → ลบได้
    await db.execute('DELETE FROM voters WHERE id = ?', [id]);
    req.session.flash_success = 'ลบผู้มีสิทธิ์โหวตสำเร็จ';
    res.redirect('/admin/voters');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด';
    res.redirect('/admin/voters');
  }
});


// ------------------------------------------------------------
// POST /admin/toggle-voter — เปิด/ปิดบัญชีผู้มีสิทธิ์โหวต
// ------------------------------------------------------------
router.post('/toggle-voter', requireRole('admin'), verifyCsrf, async (req, res) => {

  const id     = parseInt(req.body.id);
  const action = req.body.action; // 'enable' หรือ 'disable'

  if (!id || !['enable', 'disable'].includes(action)) {
    req.session.flash_error = 'ข้อมูลไม่ถูกต้อง';
    return res.redirect('/admin/voters');
  }

  try {
    // action === 'enable' ? 1 : 0 = ถ้า enable → 1, ถ้า disable → 0
    await db.execute(
      'UPDATE voters SET is_enabled = ? WHERE id = ?',
      [action === 'enable' ? 1 : 0, id]
    );
    req.session.flash_success = action === 'enable' ? 'เปิดใช้งานสำเร็จ' : 'ปิดการใช้งานสำเร็จ';
    res.redirect('/admin/voters');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด';
    res.redirect('/admin/voters');
  }
});


// ------------------------------------------------------------
// POST /admin/toggle-settings — เปิด/ปิดการโหวตหรือการลงทะเบียน
// ------------------------------------------------------------
router.post('/toggle-settings', requireRole('admin'), verifyCsrf, async (req, res) => {

  // ชื่อ setting ที่ต้องการเปลี่ยน เช่น 'voting_enabled'
  const setting = req.body.setting;

  // value มาจาก checkbox ของ HTML:
  //   ถ้าติ๊ก checkbox → value = '1' (string)
  //   ถ้าไม่ติ๊ก → browser ไม่ส่งมาเลย → value = undefined (falsy)
  const value = req.body.value;

  // ตรวจว่าเป็น key ที่อนุญาตเท่านั้น (whitelist) เพื่อความปลอดภัย
  if (!['voting_enabled', 'registration_enabled'].includes(setting)) {
    req.session.flash_error = 'ข้อมูลไม่ถูกต้อง';
    return res.redirect('/admin/dashboard');
  }

  try {
    // value ? '1' : '0' = ถ้า value มีค่า (truthy) → '1' ถ้าไม่มี → '0'
    await db.execute(
      'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
      [value ? '1' : '0', setting]
    );
    req.session.flash_success = 'อัปเดตการตั้งค่าสำเร็จ';
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด';
    res.redirect('/admin/dashboard');
  }
});


// ------------------------------------------------------------
// GET /admin/results — หน้าดูผลการเลือกตั้ง
// ------------------------------------------------------------
router.get('/results', requireRole('admin'), async (req, res) => {
  try {
    // รับคำค้นหา
    const search = (req.query.search || '').trim();

    // ดึงสถิติรวม (ใช้ helper function)
    const stats = await getStats();

    // เตรียม SQL สำหรับดึงคะแนนผู้สมัครทุกคน
    let query = `
      SELECT c.id, c.candidate_id, c.full_name, c.number,
             c.is_registered, c.is_enabled,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
    `;
    const params = [];

    // เพิ่ม WHERE ถ้ามีการค้นหา
    if (search) {
      query += ' WHERE c.full_name LIKE ? OR c.candidate_id LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    // เรียงตามคะแนนมากสุดก่อน ถ้าคะแนนเท่ากันให้เรียงตามหมายเลขผู้สมัคร
    query += ' GROUP BY c.id ORDER BY vote_count DESC, c.number ASC';

    // รันคำสั่ง SQL
    const [candidates] = await db.execute(query, params);

    // ส่งข้อมูลทั้งหมดไปแสดงที่ views/admin/results.ejs
    res.render('admin/results', {
      title: 'ผลการเลือกตั้ง',
      candidates, // รายชื่อพร้อมคะแนน
      stats,      // สถิติรวม
      search      // คำค้นหา
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});


// ส่งออก router ไปให้ server.js ใช้งาน
// server.js จะ mount router นี้ที่ prefix '/admin'
// ทำให้ route '/dashboard' กลายเป็น '/admin/dashboard' จริงๆ
module.exports = router;
