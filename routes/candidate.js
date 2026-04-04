const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { requireRole, verifyCsrf } = require('../middleware/auth');

// GET /candidate/dashboard — หน้าหลักของผู้สมัคร
router.get('/dashboard', requireRole('candidate'), async (req, res) => {
  try {
    const candidateId = req.session.candidate_id; // id ของผู้สมัครที่ login อยู่

    // ดึงข้อมูลผู้สมัครปัจจุบันพร้อมจำนวนโหวตของตัวเอง
    const [[me]] = await db.execute(`
      SELECT c.*, COUNT(v.id) AS my_votes
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
       WHERE c.id = ?
       GROUP BY c.id
    `, [candidateId]);

    // ดึงสถิติรวมของระบบ
    const [[{ totalVoters     }]] = await db.execute('SELECT COUNT(*) totalVoters     FROM voters     WHERE is_enabled = 1');
    const [[{ totalVotes      }]] = await db.execute('SELECT COUNT(*) totalVotes      FROM votes');
    const [[{ totalCandidates }]] = await db.execute('SELECT COUNT(*) totalCandidates FROM candidates WHERE is_registered = 1 AND is_enabled = 1');

    // ดึง top 5 ผู้สมัครสำหรับแสดง ranking preview
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

    // คำนวณอันดับของผู้สมัครปัจจุบัน (นับแถวที่คืนมา = จำนวนคนที่ได้คะแนนมากกว่า)
    // ใช้ aheadRows.length แทนการ destructure เพื่อหลีกเลี่ยง TypeError เมื่อผลว่าง
    const [aheadRows] = await db.execute(`
      SELECT c2.id
        FROM candidates c2
        LEFT JOIN votes v2 ON c2.id = v2.candidate_id
       WHERE c2.is_registered = 1 AND c2.is_enabled = 1
       GROUP BY c2.id
      HAVING COUNT(v2.id) > (SELECT COUNT(*) FROM votes WHERE candidate_id = ?)
    `, [candidateId]).catch(() => [[]]);
    const ahead = aheadRows.length; // จำนวนคนที่อยู่หน้า (ถ้าอันดับ 1 = 0)

    const myVotes = parseInt(me.my_votes) || 0;
    const myRank  = (ahead || 0) + 1;
    const myPct   = totalVotes > 0 ? ((myVotes / totalVotes) * 100).toFixed(1) : '0.0';
    const overallPct = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(1) : '0.0';

    res.render('candidate/dashboard', {
      title: 'Dashboard ผู้สมัคร',
      candidate: me, myVotes, myRank, myPct,
      totalVoters, totalCandidates, totalVotes, overallPct, top5
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// GET /candidate/profile — หน้าดูและแก้ไขโปรไฟล์
router.get('/profile', requireRole('candidate'), async (req, res) => {
  try {
    const [[candidate]] = await db.execute(
      'SELECT * FROM candidates WHERE id = ?',
      [req.session.candidate_id]
    );
    res.render('candidate/profile', { title: 'โปรไฟล์ผู้สมัคร', candidate });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// POST /candidate/update-profile — บันทึกการแก้ไขโปรไฟล์
router.post('/update-profile', requireRole('candidate'), verifyCsrf, async (req, res) => {
  const full_name = (req.body.full_name || '').trim();
  const policy    = (req.body.policy    || '').trim();

  // ตรวจสอบว่ากรอกชื่อ-นามสกุล
  if (!full_name) {
    req.session.flash_error = 'กรุณากรอกชื่อ-นามสกุล';
    return res.redirect('/candidate/profile');
  }

  try {
    // อัปเดตข้อมูลในฐานข้อมูล
    await db.execute(
      'UPDATE candidates SET full_name = ?, policy = ? WHERE id = ?',
      [full_name, policy, req.session.candidate_id]
    );
    // อัปเดตชื่อใน session ด้วย เพื่อให้ nav bar แสดงชื่อใหม่
    req.session.candidate_name = full_name;
    req.session.flash_success = 'บันทึกข้อมูลสำเร็จ';
    res.redirect('/candidate/profile');
  } catch (err) {
    console.error(err);
    req.session.flash_error = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    res.redirect('/candidate/profile');
  }
});

// GET /candidate/results — หน้าดูผลคะแนนสำหรับผู้สมัคร
router.get('/results', requireRole('candidate'), async (req, res) => {
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

    res.render('candidate/results', {
      title: 'ผลการเลือกตั้ง',
      candidates,
      totalVotes: parseInt(totalVotes),
      myCandidateId: req.session.candidate_id, // ใช้ highlight แถวของตัวเอง
      search
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

module.exports = router;
