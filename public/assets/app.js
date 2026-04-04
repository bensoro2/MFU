// ============================================================
// MFU Election — Client-Side JavaScript (Node.js version)
// ใช้ร่วมกันทุกหน้า ผ่าน <script src="/assets/app.js">
// ============================================================

// ---- Password Strength Meter ----
// คำนวณ score ของ password (0-5)
function calcStrength(pw) {
  let score = 0;
  if (pw.length >= 6)            score++; // ความยาวพื้นฐาน
  if (pw.length >= 10)           score++; // ความยาวดี
  if (/[0-9]/.test(pw))         score++; // มีตัวเลข
  if (/[A-Z]/.test(pw))         score++; // มีตัวพิมพ์ใหญ่
  if (/[^a-zA-Z0-9]/.test(pw))  score++; // มีอักขระพิเศษ
  return score;
}

// อัปเดต strength bar และ hint text แบบ real-time
function updateStrength(input) {
  const pw    = input.value;
  const fill  = document.getElementById('strength-fill');
  const hint  = document.getElementById('strength-hint');
  if (!fill) return;

  // สีและข้อความตาม score
  const colors  = ['#e5e7eb','#ef4444','#f97316','#eab308','#22c55e','#15803d'];
  const widths  = ['0%','20%','40%','60%','80%','100%'];
  const labels  = ['','อ่อนมาก','อ่อน','ปานกลาง','แข็งแรง','แข็งแรงมาก'];

  const s = calcStrength(pw);
  fill.style.background = colors[s];
  fill.style.width      = widths[s];
  if (hint) hint.textContent = pw ? 'ความปลอดภัย: ' + labels[s] : '';
}

// ตรวจสอบว่า password ตรงกับ confirm หรือไม่
function checkMatch() {
  const pw      = document.getElementById('reg-password');
  const confirm = document.getElementById('reg-confirm');
  const hint    = document.getElementById('match-hint');
  if (!pw || !confirm || !hint) return;
  if (!confirm.value) { hint.textContent = ''; return; }

  if (pw.value === confirm.value) {
    hint.textContent = '✓ Password ตรงกัน';
    hint.className   = 'text-xs mt-1 text-green-600';
  } else {
    hint.textContent = '✗ Password ไม่ตรงกัน';
    hint.className   = 'text-xs mt-1 text-red-500';
  }
}

// ---- Candidate ID Format Validator ----
// ตรวจสอบรูปแบบ Candidate ID แบบ real-time (C-XXXX)
function checkCandidateId(input) {
  const val  = input.value.trim().toUpperCase();
  input.value = val; // แปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ
  const hint = document.getElementById('cand-id-hint');
  if (!hint) return;
  if (!val) { hint.textContent = ''; return; }

  if (/^C-\d{4}$/.test(val)) {
    hint.textContent = '✓ รูปแบบถูกต้อง';
    hint.className   = 'text-xs mt-1 text-green-600';
  } else {
    hint.textContent = 'รูปแบบต้องเป็น C-XXXX (เช่น C-0001)';
    hint.className   = 'text-xs mt-1 text-red-500';
  }
}

// ---- Toggle Add Form (Admin Pages) ----
// แสดง/ซ่อน section เพิ่มข้อมูลใหม่
function toggleAddForm() {
  const form = document.getElementById('add-form');
  if (!form) return;
  form.classList.toggle('hidden');
}

// ---- Vote Confirmation Dialog ----
// เปิด dialog ยืนยันก่อนโหวต
function confirmVote(candidateId, candidateName) {
  const dialog   = document.getElementById('vote-dialog');
  const nameEl   = document.getElementById('vote-name');
  const idInput  = document.getElementById('vote-candidate-id');
  if (!dialog) return;

  if (nameEl)  nameEl.textContent  = candidateName;
  if (idInput) idInput.value       = candidateId;
  dialog.classList.remove('hidden');
}

// ปิด dialog โหวตโดยไม่ดำเนินการ
function closeVoteDialog() {
  const dialog = document.getElementById('vote-dialog');
  if (dialog) dialog.classList.add('hidden');
}

// ---- Event Listeners ----
document.addEventListener('DOMContentLoaded', function () {

  // กด Escape เพื่อปิด vote dialog
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeVoteDialog();
  });

  // Auto-hide flash messages หลัง 5 วินาที
  const flashMessages = document.querySelectorAll('.flash-ok, .flash-err');
  flashMessages.forEach(function (el) {
    setTimeout(function () {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity    = '0';
      setTimeout(function () { el.remove(); }, 500);
    }, 5000); // หายหลัง 5 วินาที
  });

});
