// นำเข้า mysql2 แบบ promise เพื่อใช้ async/await ได้
const mysql = require('mysql2/promise');

// สร้าง connection pool — จัดการหลาย connection พร้อมกัน
const pool = mysql.createPool({
  host:             process.env.DB_HOST || 'localhost',
  port:             parseInt(process.env.DB_PORT) || 3306,
  database:         process.env.DB_NAME || 'mfu_election',
  user:             process.env.DB_USER || 'root',
  password:         process.env.DB_PASS || '',
  charset:          'utf8mb4',       // รองรับภาษาไทยและ emoji
  waitForConnections: true,          // รอถ้า connection เต็ม ไม่ throw error
  connectionLimit:  10,              // จำนวน connection สูงสุดใน pool
  queueLimit:       0                // ไม่จำกัดคิว (0 = unlimited)
});

module.exports = pool;
