const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { requireRole, verifyCsrf } = require('../middleware/auth');

// GET /voter/dashboard — หน้าหลักของผู้มีสิทธิ์โหวต
router.get('/dashboard', requireRole('voter'), async (req, res) => {
  try {
    const voterId = req.session.voter_id;
    const search  = (req.query.search || '').trim();

    // ดึงข้อมูลของผู้ลงคะแนนปัจจุบัน
    const [[voter]] = await db.execute('SELECT * FROM voters WHERE id = ?', [voterId]);

    // ตรวจสอบว่าเปิดรับโหวตอยู่หรือไม่
    const [[{ setting_value: votingVal }]] = await db.execute(
      "SELECT setting_value FROM settings WHERE setting_key = 'voting_enabled'"
    );
    const votingEnabled = votingVal === '1';

    // ดึงสถิติรวม
    const [[{ totalVoters     }]] = await db.execute('SELECT COUNT(*) totalVoters     FROM voters     WHERE is_enabled = 1');
    const [[{ totalVotes      }]] = await db.execute('SELECT COUNT(*) totalVotes      FROM votes');
    const [[{ totalCandidates }]] = await db.execute('SELECT COUNT(*) totalCandidates FROM candidates WHERE is_registered = 1 AND is_enabled = 1');
    const pct = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(1) : '0.0';

    // ดึงรายชื่อผู้สมัครที่เปิดใช้งานพร้อมคะแนน
    let   query  = `
      SELECT c.id, c.candidate_id, c.full_name, c.number, c.policy,
             COUNT(v.id) AS vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
       WHERE c.is_registered = 1 AND c.is_enabled = 1
    `;
    const params = [];

    // กรองตามคำค้นหา
    if (search) {
      query += ' AND (c.full_name LIKE ? OR c.candidate_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' GROUP BY c.id ORDER BY vote_count DESC, c.number ASC';

    const [candidates] = await db.execute(query, params);

    res.render('voter/dashboard', {
      title: 'หน้าหลักผู้ลงคะแนน',
      voter, votingEnabled,
      totalVoters, totalVotes, totalCandidates, pct,
      candidates, search,
      totalVotesNum: parseInt(totalVotes) // ส่งเป็น number สำหรับคำนวณ %
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// POST /voter/cast-vote — บันทึกการลงคะแนนเสียง
router.post('/cast-vote', requireRole('voter'), verifyCsrf, async (req, res) => {
  const voterId     = req.session.voter_id;
  const candidateId = parseInt(req.body.candidate_id);

  // ขอ connection จาก pool สำหรับใช้ใน transaction
  const conn = await db.getConnection();
  try {
    // ตรวจสอบว่าเปิดรับโหวตอยู่
    const [[{ setting_value }]] = await conn.execute(
      "SELECT setting_value FROM settings WHERE setting_key = 'voting_enabled'"
    );
    if (setting_value !== '1') {
      req.session.flash_error = 'ขณะนี้ปิดรับโหวตแล้ว';
      return res.redirect('/voter/dashboard');
    }

    // ดึงข้อมูลผู้ลงคะแนน
    const [[voter]] = await conn.execute('SELECT * FROM voters WHERE id = ?', [voterId]);
    if (!voter || !voter.is_enabled) {
      req.session.flash_error = 'บัญชีถูกปิดการใช้งาน';
      return res.redirect('/voter/dashboard');
    }

    // ตรวจสอบว่าโหวตไปแล้วหรือยัง (double-check ก่อน insert)
    if (voter.has_voted) {
      req.session.flash_error = 'คุณโหวตไปแล้ว ไม่สามารถโหวตซ้ำได้';
      return res.redirect('/voter/dashboard');
    }

    // ตรวจสอบว่าผู้สมัครที่เลือกมีอยู่และเปิดใช้งาน
    const [[candidate]] = await conn.execute(
      'SELECT id FROM candidates WHERE id = ? AND is_registered = 1 AND is_enabled = 1',
      [candidateId]
    );
    if (!candidate) {
      req.session.flash_error = 'ไม่พบผู้สมัครที่เลือก';
      return res.redirect('/voter/dashboard');
    }

    // เริ่ม transaction เพื่อให้ทั้ง 2 query สำเร็จหรือล้มเหลวพร้อมกัน
    await conn.beginTransaction();
    // บันทึกการโหวตในตาราง votes
    await conn.execute('INSERT INTO votes (voter_id, candidate_id) VALUES (?, ?)', [voterId, candidateId]);
    // อัปเดตสถานะผู้ลงคะแนนว่าโหวตแล้ว
    await conn.execute('UPDATE voters SET has_voted = 1 WHERE id = ?', [voterId]);
    // ยืนยัน transaction
    await conn.commit();

    req.session.flash_success = 'ลงคะแนนเสียงเรียบร้อยแล้ว';
    res.redirect('/voter/dashboard');
  } catch (err) {
    // ยกเลิก transaction ถ้าเกิดข้อผิดพลาด
    await conn.rollback();

    if (err.code === 'ER_DUP_ENTRY') {
      // UNIQUE constraint ถูก violate = โหวตซ้ำที่ระดับ DB (safety net)
      req.session.flash_error = 'คุณโหวตไปแล้ว';
    } else {
      console.error('cast-vote error:', err);
      req.session.flash_error = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    }
    res.redirect('/voter/dashboard');
  } finally {
    conn.release(); // คืน connection กลับ pool เสมอ
  }
});

// GET /voter/results — หน้าดูผลคะแนน
router.get('/results', requireRole('voter'), async (req, res) => {
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

    const [candidates]         = await db.execute(query, params);
    const [[{ totalVotes }]]   = await db.execute('SELECT COUNT(*) totalVotes  FROM votes');
    const [[{ totalVoters }]]  = await db.execute('SELECT COUNT(*) totalVoters FROM voters WHERE is_enabled = 1');
    const pct = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(1) : '0.0';

    res.render('voter/results', {
      title: 'ผลการเลือกตั้ง',
      candidates,
      totalVotes: parseInt(totalVotes),
      totalVoters: parseInt(totalVoters),
      pct, search
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// GET /voter/history — หน้าดูประวัติการโหวตของตัวเอง
router.get('/history', requireRole('voter'), async (req, res) => {
  try {
    const voterId = req.session.voter_id;

    // ดึงข้อมูลการโหวต (JOIN กับ candidates เพื่อแสดงรายละเอียดผู้สมัคร)
    const [rows] = await db.execute(`
      SELECT v.voted_at, c.candidate_id, c.full_name, c.number, c.policy
        FROM votes v
        JOIN candidates c ON v.candidate_id = c.id
       WHERE v.voter_id = ?
    `, [voterId]);

    res.render('voter/history', {
      title: 'ประวัติการโหวต',
      vote: rows.length ? rows[0] : null // null = ยังไม่ได้โหวต
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

module.exports = router;
