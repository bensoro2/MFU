// Middleware สำหรับตรวจสอบการเข้าสู่ระบบและสิทธิ์ผู้ใช้

// ตรวจสอบว่าผู้ใช้เข้าสู่ระบบแล้วหรือยัง
function isLoggedIn(req) {
  return !!req.session.role; // true ถ้ามี role ใน session
}

// ดึง role ของผู้ใช้ปัจจุบัน
function currentRole(req) {
  return req.session.role || null;
}

// Middleware factory: บังคับให้มี role ที่ต้องการ
// ถ้า role ไม่ตรงหรือยังไม่ได้ login จะ redirect ไปหน้า login
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.role || req.session.role !== role) {
      req.session.flash_error = 'กรุณาเข้าสู่ระบบก่อนใช้งาน';
      return res.redirect('/login');
    }
    next(); // ผ่าน: ไปยัง handler ถัดไป
  };
}

// Middleware ตรวจสอบ CSRF token เพื่อป้องกัน Cross-Site Request Forgery
function verifyCsrf(req, res, next) {
  // รับ token จาก form body หรือ header (รองรับทั้ง form POST และ AJAX)
  const token = req.body.csrf_token || req.headers['x-csrf-token'];

  // เปรียบเทียบกับ token ที่เก็บใน session
  if (!token || token !== req.session.csrf_token) {
    req.session.flash_error = 'Session expired. Please try again.';
    return res.redirect('back'); // ส่งกลับหน้าเดิม
  }
  next();
}

module.exports = { isLoggedIn, currentRole, requireRole, verifyCsrf };
