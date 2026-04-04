const express = require('express');
const router  = express.Router();
const { isLoggedIn, currentRole } = require('../middleware/auth');

// GET / — redirect ไปยัง dashboard ตาม role หรือไปหน้า login
router.get('/', (req, res) => {
  if (isLoggedIn(req)) {
    return res.redirect(`/${currentRole(req)}/dashboard`);
  }
  res.redirect('/login');
});

// GET /login — แสดงหน้า login (3 แท็บ: voter / candidate / admin)
router.get('/login', (req, res) => {
  // ถ้า login แล้วให้ redirect ไป dashboard
  if (isLoggedIn(req)) {
    return res.redirect(`/${currentRole(req)}/dashboard`);
  }
  // รับ tab จาก query string (voter | candidate | admin)
  const tab = req.query.tab || 'voter';
  res.render('login', { tab });
});

// GET /logout — ทำลาย session แล้ว redirect ไปหน้า login
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
