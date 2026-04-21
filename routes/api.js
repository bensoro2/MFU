const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../config/db');
const { verifyCsrf } = require('../middleware/auth');

// --- API-specific middleware ---
// คืน JSON แทน redirect เมื่อ role ไม่ตรงหรือยังไม่ได้ login
function apiRequireRole(role) {
  return (req, res, next) => {
    if (!req.session.role) {
      return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    if (req.session.role !== role) {
      return res.status(403).json({ success: false, message: `เฉพาะ ${role} เท่านั้น (role ปัจจุบัน: ${req.session.role})` });
    }
    next();
  };
}

// --- Helper ---
async function getSetting(key) {
  const [rows] = await db.execute('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return rows.length ? rows[0].setting_value : '0';
}

async function getStats() {
  const [[{ c: totalVoters     }]] = await db.execute('SELECT COUNT(*) c FROM voters     WHERE is_enabled = 1');
  const [[{ c: totalCandidates }]] = await db.execute('SELECT COUNT(*) c FROM candidates WHERE is_registered = 1 AND is_enabled = 1');
  const [[{ c: totalVotes      }]] = await db.execute('SELECT COUNT(*) c FROM votes');
  const pct = totalVoters > 0 ? Math.round((totalVotes / totalVoters) * 100) : 0;
  return { totalVoters, totalCandidates, totalVotes, pct };
}

// ============================================================
// GET /api/csrf — ดึง CSRF token (ต้องเรียกก่อนทุก POST)
// ============================================================
router.get('/csrf', (req, res) => {
  if (!req.session.csrf_token) {
    req.session.csrf_token = crypto.randomBytes(32).toString('hex');
  }
  res.json({ csrf_token: req.session.csrf_token });
});

// ============================================================
// GET /api/check-candidate/:id — เช็คว่า Candidate ID มีในระบบไหม (ไม่ต้อง login)
// ============================================================
router.get('/check-candidate/:id', async (req, res) => {
  const candidate_id = (req.params.id || '').trim().toUpperCase();

  if (!/^C-\d{4}$/.test(candidate_id)) {
    return res.json({ exists: false, registered: false, message: 'รูปแบบไม่ถูกต้อง' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT is_registered FROM candidates WHERE candidate_id = ?',
      [candidate_id]
    );

    if (rows.length === 0) {
      return res.json({ exists: false, registered: false, message: 'ไม่พบ Candidate ID นี้ในระบบ' });
    }

    if (rows[0].is_registered) {
      return res.json({ exists: true, registered: true, message: 'Candidate ID นี้ลงทะเบียนแล้ว' });
    }

    res.json({ exists: true, registered: false, message: 'พบในระบบ สามารถลงทะเบียนได้' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false, registered: false, message: 'เกิดข้อผิดพลาด' });
  }
});

// ============================================================
// AUTH
// ============================================================

// POST /api/auth/admin-login
router.post('/auth/admin-login', verifyCsrf, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });
  }

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' });
  }

  req.session.regenerate(() => {
    req.session.role       = 'admin';
    req.session.admin      = true;
    req.session.csrf_token = crypto.randomBytes(32).toString('hex');
    res.json({ success: true, role: 'admin', csrf_token: req.session.csrf_token });
  });
});

// POST /api/auth/voter-login
router.post('/auth/voter-login', verifyCsrf, async (req, res) => {
  const citizen_id = (req.body.citizen_id || '').replace(/\s+/g, '');
  const laser_id   = (req.body.laser_id   || '').trim().toUpperCase();

  if (!citizen_id || !laser_id) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกเลขบัตรประชาชนและรหัสหลังบัตร' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT * FROM voters WHERE citizen_id = ? AND laser_id = ?',
      [citizen_id, laser_id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'เลขบัตรประชาชนหรือรหัสหลังบัตรไม่ถูกต้อง' });
    }

    const voter = rows[0];
    if (!voter.is_enabled) {
      return res.status(403).json({ success: false, message: 'บัญชีนี้ถูกปิดการใช้งาน' });
    }

    req.session.regenerate(() => {
      req.session.role       = 'voter';
      req.session.voter_id   = voter.id;
      req.session.citizen_id = voter.citizen_id;
      req.session.csrf_token = crypto.randomBytes(32).toString('hex');
      res.json({ success: true, role: 'voter', csrf_token: req.session.csrf_token });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/auth/candidate-login
router.post('/auth/candidate-login', verifyCsrf, async (req, res) => {
  const candidate_code = (req.body.candidate_code || '').trim().toUpperCase();
  const password       = (req.body.password || '');

  if (!candidate_code || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอก Candidate ID และ Password' });
  }

  try {
    const [rows] = await db.execute('SELECT * FROM candidates WHERE candidate_id = ?', [candidate_code]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'ไม่พบ Candidate ID นี้ในระบบ' });
    }

    const candidate = rows[0];

    if (!candidate.is_registered) {
      return res.status(401).json({ success: false, message: 'ID นี้ยังไม่ได้ลงทะเบียน' });
    }
    if (!candidate.is_enabled) {
      return res.status(403).json({ success: false, message: 'บัญชีนี้ถูกปิดการใช้งาน' });
    }

    const match = await bcrypt.compare(password, candidate.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Password ไม่ถูกต้อง' });
    }

    req.session.regenerate(() => {
      req.session.role           = 'candidate';
      req.session.candidate_id   = candidate.id;
      req.session.candidate_code = candidate.candidate_id;
      req.session.candidate_name = candidate.full_name;
      req.session.csrf_token     = crypto.randomBytes(32).toString('hex');
      res.json({ success: true, role: 'candidate', csrf_token: req.session.csrf_token });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/auth/candidate-register
router.post('/auth/candidate-register', verifyCsrf, async (req, res) => {
  const candidate_code   = (req.body.candidate_code   || '').trim().toUpperCase();
  const full_name        = (req.body.full_name        || '').trim();
  const password         = (req.body.password         || '');
  const password_confirm = (req.body.password_confirm || '');
  const email            = (req.body.email            || '').trim().toLowerCase();

  try {
    const [settings] = await db.execute(
      "SELECT setting_value FROM settings WHERE setting_key = 'registration_enabled'"
    );
    if (!settings.length || settings[0].setting_value !== '1') {
      return res.status(403).json({ success: false, message: 'ปิดรับลงทะเบียนผู้สมัครแล้ว' });
    }

    if (!candidate_code || !full_name || !password || !password_confirm || !email) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    }

    if (password !== password_confirm) {
      return res.status(400).json({ success: false, message: 'Password ไม่ตรงกัน' });
    }

    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก Gmail ที่ถูกต้อง (@gmail.com)' });
    }

    const [rows] = await db.execute('SELECT * FROM candidates WHERE candidate_id = ?', [candidate_code]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบ Candidate ID นี้ในระบบ' });
    }

    if (rows[0].is_registered) {
      return res.status(409).json({ success: false, message: 'Candidate ID นี้ลงทะเบียนแล้ว' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [[{ nextNum }]] = await db.execute(
      'SELECT COALESCE(MAX(number), 0) + 1 AS nextNum FROM candidates'
    );

    await db.execute(
      `UPDATE candidates SET password_hash = ?, full_name = ?, email = ?,
       number = ?, is_registered = 1, registered_at = NOW() WHERE candidate_id = ?`,
      [hash, full_name, email, nextNum, candidate_code]
    );

    res.json({ success: true, message: 'ลงทะเบียนสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/auth/logout
router.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
  });
});

// ============================================================
// ADMIN
// ============================================================

// GET /api/admin/dashboard
router.get('/admin/dashboard', apiRequireRole('admin'), async (req, res) => {
  try {
    const stats               = await getStats();
    const votingEnabled       = await getSetting('voting_enabled');
    const registrationEnabled = await getSetting('registration_enabled');

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

    res.json({ success: true, data: { stats, votingEnabled, registrationEnabled, topCandidates } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/candidates?search=
router.get('/admin/candidates', apiRequireRole('admin'), async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    let   query  = `
      SELECT c.id, c.candidate_id, c.full_name, c.email, c.number,
             c.is_registered, c.is_enabled, c.registered_at,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
    `;
    const params = [];

    if (search) {
      query += ' WHERE c.full_name LIKE ? OR c.candidate_id LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' GROUP BY c.id ORDER BY c.number ASC';

    const [candidates] = await db.execute(query, params);
    res.json({ success: true, data: { candidates, search } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/admin/add-candidate
router.post('/admin/add-candidate', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const candidate_id = (req.body.candidate_id || '').trim().toUpperCase();

  if (!/^C-\d{4}$/.test(candidate_id)) {
    return res.status(400).json({ success: false, message: 'รูปแบบ Candidate ID ไม่ถูกต้อง (ตัวอย่าง: C-0001)' });
  }

  try {
    const [[exist]] = await db.execute('SELECT id FROM candidates WHERE candidate_id = ?', [candidate_id]);
    if (exist) {
      return res.status(409).json({ success: false, message: 'Candidate ID นี้มีอยู่แล้ว' });
    }

    await db.execute('INSERT INTO candidates (candidate_id) VALUES (?)', [candidate_id]);

    res.status(201).json({ success: true, message: `เพิ่มผู้สมัคร ${candidate_id} สำเร็จ (หมายเลขจะได้รับเมื่อผู้สมัคร register)`, data: { candidate_id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// PUT /api/admin/candidates/:id
router.put('/admin/candidates/:id', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const id     = parseInt(req.params.id);
  const number = parseInt(req.body.number);

  if (!id || isNaN(number) || number < 1 || number > 99) {
    return res.status(400).json({ success: false, message: 'หมายเลขผู้สมัครต้องอยู่ระหว่าง 1–99' });
  }

  try {
    const [[dupNum]] = await db.execute(
      'SELECT id FROM candidates WHERE number = ? AND id <> ?', [number, id]
    );
    if (dupNum) return res.status(409).json({ success: false, message: 'หมายเลขผู้สมัครนี้ถูกใช้แล้ว' });

    await db.execute('UPDATE candidates SET number = ? WHERE id = ?', [number, id]);
    res.json({ success: true, message: 'แก้ไขหมายเลขผู้สมัครสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// DELETE /api/admin/candidates/:id
router.delete('/admin/candidates/:id', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });

  try {
    const [[{ vote_count }]] = await db.execute(
      'SELECT COUNT(*) vote_count FROM votes WHERE candidate_id = ?', [id]
    );
    if (vote_count > 0) {
      return res.status(409).json({ success: false, message: 'ไม่สามารถลบได้ เนื่องจากมีการโหวตให้ผู้สมัครนี้แล้ว' });
    }
    await db.execute('DELETE FROM candidates WHERE id = ?', [id]);
    res.json({ success: true, message: 'ลบผู้สมัครสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// PATCH /api/admin/candidates/:id/toggle
router.patch('/admin/candidates/:id/toggle', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const id     = parseInt(req.params.id);
  const action = req.body.action;

  if (!id || !['enable', 'disable'].includes(action)) {
    return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง (action: enable|disable)' });
  }

  try {
    await db.execute('UPDATE candidates SET is_enabled = ? WHERE id = ?', [action === 'enable' ? 1 : 0, id]);
    res.json({ success: true, message: action === 'enable' ? 'เปิดใช้งานสำเร็จ' : 'ปิดการใช้งานสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/voters?search=&page=1
router.get('/admin/voters', apiRequireRole('admin'), async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 20;
    const offset = (page - 1) * limit;

    const countParams = [];
    const dataParams  = [];
    let   whereClause = '';

    if (search) {
      whereClause = 'WHERE citizen_id LIKE ? OR laser_id LIKE ?';
      countParams.push(`%${search}%`, `%${search}%`);
      dataParams.push(`%${search}%`, `%${search}%`);
    }

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) total FROM voters ${whereClause}`, countParams
    );
    const totalPages = Math.ceil(total / limit);

    const [voters] = await db.execute(
      `SELECT * FROM voters ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      dataParams
    );

    const [[{ active }]] = await db.execute('SELECT COUNT(*) active FROM voters WHERE is_enabled = 1');
    const [[{ voted  }]] = await db.execute('SELECT COUNT(*) voted  FROM voters WHERE has_voted  = 1');

    res.json({ success: true, data: { voters, total, active, voted, page, totalPages, search } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/admin/add-voter
router.post('/admin/add-voter', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const citizen_id = (req.body.citizen_id || '').replace(/\s+/g, '');
  const laser_id   = (req.body.laser_id   || '').trim().toUpperCase();

  if (!citizen_id || !laser_id) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกเลขบัตรประชาชนและรหัสหลังบัตร' });
  }

  if (!/^\d{13}$/.test(citizen_id)) {
    return res.status(400).json({ success: false, message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' });
  }

  try {
    const [[exist]] = await db.execute('SELECT id FROM voters WHERE citizen_id = ?', [citizen_id]);
    if (exist) {
      return res.status(409).json({ success: false, message: 'เลขบัตรประชาชนนี้มีอยู่แล้ว' });
    }

    await db.execute('INSERT INTO voters (citizen_id, laser_id) VALUES (?, ?)', [citizen_id, laser_id]);
    res.status(201).json({ success: true, message: 'เพิ่มผู้มีสิทธิ์โหวตสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// PUT /api/admin/voters/:id
router.put('/admin/voters/:id', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const id         = parseInt(req.params.id);
  const citizen_id = (req.body.citizen_id || '').replace(/\s+/g, '');
  const laser_id   = (req.body.laser_id   || '').trim().toUpperCase();

  if (!id || !citizen_id || !laser_id) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
  }
  if (!/^\d{13}$/.test(citizen_id)) {
    return res.status(400).json({ success: false, message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' });
  }

  try {
    const [[dup]] = await db.execute(
      'SELECT id FROM voters WHERE citizen_id = ? AND id <> ?', [citizen_id, id]
    );
    if (dup) return res.status(409).json({ success: false, message: 'เลขบัตรประชาชนนี้มีอยู่แล้ว' });

    await db.execute('UPDATE voters SET citizen_id = ?, laser_id = ? WHERE id = ?', [citizen_id, laser_id, id]);
    res.json({ success: true, message: 'แก้ไขข้อมูลผู้มีสิทธิ์โหวตสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// DELETE /api/admin/voters/:id
router.delete('/admin/voters/:id', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });

  try {
    const [[voter]] = await db.execute('SELECT has_voted FROM voters WHERE id = ?', [id]);
    if (!voter) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });
    if (voter.has_voted) {
      return res.status(409).json({ success: false, message: 'ไม่สามารถลบได้ เนื่องจากผู้นี้โหวตไปแล้ว' });
    }
    await db.execute('DELETE FROM voters WHERE id = ?', [id]);
    res.json({ success: true, message: 'ลบผู้มีสิทธิ์โหวตสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// PATCH /api/admin/voters/:id/toggle
router.patch('/admin/voters/:id/toggle', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const id     = parseInt(req.params.id);
  const action = req.body.action;

  if (!id || !['enable', 'disable'].includes(action)) {
    return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง (action: enable|disable)' });
  }

  try {
    await db.execute('UPDATE voters SET is_enabled = ? WHERE id = ?', [action === 'enable' ? 1 : 0, id]);
    res.json({ success: true, message: action === 'enable' ? 'เปิดใช้งานสำเร็จ' : 'ปิดการใช้งานสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/admin/toggle-settings
router.post('/admin/toggle-settings', apiRequireRole('admin'), verifyCsrf, async (req, res) => {
  const setting = req.body.setting;
  const value   = req.body.value;

  if (!['voting_enabled', 'registration_enabled'].includes(setting)) {
    return res.status(400).json({ success: false, message: 'setting ต้องเป็น voting_enabled หรือ registration_enabled' });
  }

  try {
    await db.execute('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [value ? '1' : '0', setting]);
    res.json({ success: true, message: 'อัปเดตการตั้งค่าสำเร็จ', setting, value: value ? '1' : '0' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/admin/results?search=
router.get('/admin/results', apiRequireRole('admin'), async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const stats  = await getStats();

    let   query  = `
      SELECT c.id, c.candidate_id, c.full_name, c.number,
             c.is_registered, c.is_enabled,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
    `;
    const params = [];

    if (search) {
      query += ' WHERE c.full_name LIKE ? OR c.candidate_id LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' GROUP BY c.id ORDER BY vote_count DESC, c.number ASC';

    const [candidates] = await db.execute(query, params);
    res.json({ success: true, data: { candidates, stats, search } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ============================================================
// CANDIDATE
// ============================================================

// GET /api/candidate/dashboard
router.get('/candidate/dashboard', apiRequireRole('candidate'), async (req, res) => {
  try {
    const candidateId = req.session.candidate_id;

    const [[me]] = await db.execute(`
      SELECT c.*, COUNT(v.id) AS my_votes
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
       WHERE c.id = ?
       GROUP BY c.id
    `, [candidateId]);

    const [[{ totalVoters     }]] = await db.execute('SELECT COUNT(*) totalVoters     FROM voters     WHERE is_enabled = 1');
    const [[{ totalVotes      }]] = await db.execute('SELECT COUNT(*) totalVotes      FROM votes');
    const [[{ totalCandidates }]] = await db.execute('SELECT COUNT(*) totalCandidates FROM candidates WHERE is_registered = 1 AND is_enabled = 1');

    const [top5] = await db.execute(`
      SELECT c.id, c.candidate_id, c.full_name, c.number,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
       WHERE c.is_registered = 1 AND c.is_enabled = 1
       GROUP BY c.id
       ORDER BY vote_count DESC, c.number ASC
       LIMIT 5
    `);

    const [[{ ahead }]] = await db.execute(`
      SELECT COUNT(DISTINCT c2.id) AS ahead
        FROM candidates c2
        LEFT JOIN votes v2 ON c2.id = v2.candidate_id
       WHERE c2.is_registered = 1 AND c2.is_enabled = 1
       GROUP BY c2.id
      HAVING COUNT(v2.id) > (SELECT COUNT(*) FROM votes WHERE candidate_id = ?)
    `, [candidateId]).catch(() => [[{ ahead: 0 }]]);

    const myVotes    = parseInt(me.my_votes) || 0;
    const myRank     = (ahead || 0) + 1;
    const myPct      = totalVotes > 0 ? ((myVotes / totalVotes) * 100).toFixed(1) : '0.0';
    const overallPct = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      data: { candidate: me, myVotes, myRank, myPct, totalVoters, totalCandidates, totalVotes, overallPct, top5 }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/candidate/profile
router.get('/candidate/profile', apiRequireRole('candidate'), async (req, res) => {
  try {
    const [[candidate]] = await db.execute(
      'SELECT id, candidate_id, full_name, email, number, policy, registered_at FROM candidates WHERE id = ?',
      [req.session.candidate_id]
    );
    res.json({ success: true, data: { candidate } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// PUT /api/candidate/profile
router.put('/candidate/profile', apiRequireRole('candidate'), verifyCsrf, async (req, res) => {
  const full_name = (req.body.full_name || '').trim();
  const policy    = (req.body.policy    || '').trim();

  if (!full_name) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อ-นามสกุล' });
  }

  try {
    await db.execute(
      'UPDATE candidates SET full_name = ?, policy = ? WHERE id = ?',
      [full_name, policy, req.session.candidate_id]
    );
    req.session.candidate_name = full_name;
    res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/candidate/results?search=
router.get('/candidate/results', apiRequireRole('candidate'), async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    let   query  = `
      SELECT c.id, c.candidate_id, c.full_name, c.number,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
       WHERE c.is_registered = 1 AND c.is_enabled = 1
    `;
    const params = [];

    if (search) {
      query += ' AND (c.full_name LIKE ? OR c.candidate_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' GROUP BY c.id ORDER BY vote_count DESC, c.number ASC';

    const [candidates]       = await db.execute(query, params);
    const [[{ totalVotes }]] = await db.execute('SELECT COUNT(*) totalVotes FROM votes');

    res.json({ success: true, data: { candidates, totalVotes: parseInt(totalVotes), myCandidateId: req.session.candidate_id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// ============================================================
// VOTER
// ============================================================

// GET /api/voter/dashboard?search=
router.get('/voter/dashboard', apiRequireRole('voter'), async (req, res) => {
  try {
    const voterId = req.session.voter_id;
    const search  = (req.query.search || '').trim();

    const [[voter]] = await db.execute('SELECT * FROM voters WHERE id = ?', [voterId]);

    const [[{ setting_value: votingVal }]] = await db.execute(
      "SELECT setting_value FROM settings WHERE setting_key = 'voting_enabled'"
    );
    const votingEnabled = votingVal === '1';

    const [[{ totalVoters     }]] = await db.execute('SELECT COUNT(*) totalVoters     FROM voters     WHERE is_enabled = 1');
    const [[{ totalVotes      }]] = await db.execute('SELECT COUNT(*) totalVotes      FROM votes');
    const [[{ totalCandidates }]] = await db.execute('SELECT COUNT(*) totalCandidates FROM candidates WHERE is_registered = 1 AND is_enabled = 1');
    const pct = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(1) : '0.0';

    let   query  = `
      SELECT c.id, c.candidate_id, c.full_name, c.number, c.policy,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
       WHERE c.is_registered = 1 AND c.is_enabled = 1
    `;
    const params = [];

    if (search) {
      query += ' AND (c.full_name LIKE ? OR c.candidate_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' GROUP BY c.id ORDER BY vote_count DESC, c.number ASC';

    const [candidates] = await db.execute(query, params);

    res.json({
      success: true,
      data: { voter, votingEnabled, totalVoters, totalVotes, totalCandidates, pct, candidates }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// POST /api/voter/cast-vote
router.post('/voter/cast-vote', apiRequireRole('voter'), verifyCsrf, async (req, res) => {
  const voterId     = req.session.voter_id;
  const candidateId = parseInt(req.body.candidate_id);

  const conn = await db.getConnection();
  try {
    const [[{ setting_value }]] = await conn.execute(
      "SELECT setting_value FROM settings WHERE setting_key = 'voting_enabled'"
    );
    if (setting_value !== '1') {
      return res.status(403).json({ success: false, message: 'ขณะนี้ปิดรับโหวตแล้ว' });
    }

    const [[voter]] = await conn.execute('SELECT * FROM voters WHERE id = ?', [voterId]);
    if (!voter || !voter.is_enabled) {
      return res.status(403).json({ success: false, message: 'บัญชีถูกปิดการใช้งาน' });
    }

    if (voter.has_voted) {
      return res.status(409).json({ success: false, message: 'คุณโหวตไปแล้ว ไม่สามารถโหวตซ้ำได้' });
    }

    const [[candidate]] = await conn.execute(
      'SELECT id FROM candidates WHERE id = ? AND is_registered = 1 AND is_enabled = 1',
      [candidateId]
    );
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้สมัครที่เลือก' });
    }

    await conn.beginTransaction();
    await conn.execute('INSERT INTO votes (voter_id, candidate_id) VALUES (?, ?)', [voterId, candidateId]);
    await conn.execute('UPDATE voters SET has_voted = 1 WHERE id = ?', [voterId]);
    await conn.commit();

    res.json({ success: true, message: 'ลงคะแนนเสียงเรียบร้อยแล้ว' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'คุณโหวตไปแล้ว' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  } finally {
    conn.release();
  }
});

// GET /api/voter/results?search=
router.get('/voter/results', apiRequireRole('voter'), async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    let   query  = `
      SELECT c.id, c.candidate_id, c.full_name, c.number,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
       WHERE c.is_registered = 1 AND c.is_enabled = 1
    `;
    const params = [];

    if (search) {
      query += ' AND (c.full_name LIKE ? OR c.candidate_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' GROUP BY c.id ORDER BY vote_count DESC, c.number ASC';

    const [candidates]        = await db.execute(query, params);
    const [[{ totalVotes }]]  = await db.execute('SELECT COUNT(*) totalVotes  FROM votes');
    const [[{ totalVoters }]] = await db.execute('SELECT COUNT(*) totalVoters FROM voters WHERE is_enabled = 1');
    const pct = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(1) : '0.0';

    res.json({ success: true, data: { candidates, totalVotes: parseInt(totalVotes), totalVoters: parseInt(totalVoters), pct } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

// GET /api/voter/history
router.get('/voter/history', apiRequireRole('voter'), async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT v.voted_at, c.candidate_id, c.full_name, c.number, c.policy
        FROM votes v
        JOIN candidates c ON v.candidate_id = c.id
       WHERE v.voter_id = ?
    `, [req.session.voter_id]);

    res.json({ success: true, data: { vote: rows.length ? rows[0] : null } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

module.exports = router;
