import { PDFDocument, rgb, StandardFonts } from 'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js';

// ── State ────────────────────────────────────────────────────
const state = { pdfs: {}, results: [], currentStep: 1, employees: [] };

// ── DOM helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHistory();
  setupDragDrop();
  setupDarkMode();
});

// ── Dark Mode ────────────────────────────────────────────────
function setupDarkMode() {
  const saved = localStorage.getItem('theme') || 'light';
  setTheme(saved);
  on('btnDarkMode', 'click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
  });
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('btnDarkMode').innerHTML = t === 'dark' ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-fill"></i>';
}

// ── Wizard ───────────────────────────────────────────────────
window.goStep = function (n) {
  if (n === 2 && !validateStep1()) return;
  if (n === 3 && !state.employees.length) { toast('Upload file Excel terlebih dahulu.', 'warning'); return; }

  state.currentStep = n;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.wizard-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < n) s.classList.add('done');
    if (i + 1 === n) s.classList.add('active');
  });
  document.querySelectorAll('.wizard-line').forEach((l, i) => {
    l.classList.toggle('done', i + 1 < n);
  });
  $(`step${n}`)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function validateStep1() {
  const company = $('companyName').value.trim();
  const month   = $('payrollMonth').value.trim();
  if (!company || !month) {
    toast('Nama RS dan periode penggajian wajib diisi.', 'warning');
    return false;
  }
  return true;
}

// ── Settings ─────────────────────────────────────────────────
function loadSettings() {
  const s = JSON.parse(localStorage.getItem('settings') || '{}');
  if (s.company)     { $('companyName').value = s.company; $('settCompany').value = s.company; }
  if (s.ejsService)  $('settEjsService').value  = s.ejsService;
  if (s.ejsTemplate) $('settEjsTemplate').value = s.ejsTemplate;
  if (s.ejsKey)      $('settEjsKey').value      = s.ejsKey;
}
window.saveSettings = function () {
  const s = {
    company:     $('settCompany').value.trim(),
    ejsService:  $('settEjsService').value.trim(),
    ejsTemplate: $('settEjsTemplate').value.trim(),
    ejsKey:      $('settEjsKey').value.trim(),
  };
  localStorage.setItem('settings', JSON.stringify(s));
  if (s.company) $('companyName').value = s.company;
  bootstrap.Modal.getInstance($('#settingsModal')).hide();
  toast('Pengaturan disimpan.', 'success');
};

// ── History ──────────────────────────────────────────────────
function loadHistory() {
  const history = getHistory();
  updateHistoryBadge(history.length);
  renderHistory(history);
}
function getHistory() {
  return JSON.parse(localStorage.getItem('payroll_history') || '[]');
}
function saveToHistory(summary) {
  const history = getHistory();
  history.unshift({ ...summary, date: new Date().toLocaleString('id-ID') });
  if (history.length > 20) history.pop();
  localStorage.setItem('payroll_history', JSON.stringify(history));
  updateHistoryBadge(history.length);
  renderHistory(history);
}
function updateHistoryBadge(n) {
  const badge = $('historyBadge');
  badge.textContent = n;
  badge.classList.toggle('d-none', n === 0);
}
function renderHistory(history) {
  const list  = $('historyList');
  const empty = $('historyEmpty');
  if (!history.length) {
    list.innerHTML = '';
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');
  list.innerHTML = history.map((h, i) => `
    <div class="list-group-item px-3 py-2">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <div class="fw-semibold small">${h.month} — ${h.company}</div>
          <div class="text-muted" style="font-size:.75rem">${h.date}</div>
        </div>
        <div class="text-end">
          <span class="badge bg-success">${h.pdfOk} PDF</span>
          <span class="badge bg-secondary ms-1">${h.total} karyawan</span>
        </div>
      </div>
    </div>`).join('');
}
window.clearHistory = function () {
  if (!confirm('Hapus semua riwayat penggajian?')) return;
  localStorage.removeItem('payroll_history');
  loadHistory();
  toast('Riwayat dihapus.', 'info');
};

// ── File upload ──────────────────────────────────────────────
function setupDragDrop() {
  const area = $('uploadArea');
  area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  area.addEventListener('click', () => $('excelFile').click());
  on('excelFile', 'change', function () { if (this.files[0]) handleFile(this.files[0]); });
}

async function handleFile(file) {
  try {
    const employees = await readExcel(file);
    if (!employees.length) throw new Error('File Excel kosong atau format salah.');
    state.employees = employees;

    // Show file info
    $('uploadArea').classList.add('d-none');
    $('fileInfo').classList.remove('d-none');
    $('fileName').textContent = file.name;
    $('fileStats').textContent = `${employees.length} karyawan ditemukan · ${(file.size / 1024).toFixed(1)} KB`;
    toast(`${employees.length} karyawan berhasil dimuat.`, 'success');
  } catch (err) {
    toast('Gagal membaca Excel: ' + err.message, 'danger');
  }
}

window.clearFile = function () {
  state.employees = [];
  $('excelFile').value = '';
  $('uploadArea').classList.remove('d-none');
  $('fileInfo').classList.add('d-none');
};

function readExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: 0 });
        resolve(data);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Email toggle ─────────────────────────────────────────────
on('sendEmailToggle', 'change', function () {
  $('emailFields').classList.toggle('d-none', !this.checked);
});

// ── Form submit ──────────────────────────────────────────────
on('formPenggajian', 'submit', async function (e) {
  e.preventDefault();
  if (!state.employees.length) { toast('Upload file Excel terlebih dahulu.', 'warning'); return; }

  const config = {
    companyName:  $('companyName').value.trim(),
    payrollMonth: $('payrollMonth').value.trim(),
  };

  const btn = $('btnProses');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses…';

  goStep(4);
  $('progressBox').classList.remove('d-none');
  $('summaryCards').innerHTML = '';
  $('hasilCard').classList.add('d-none');
  $('actionBar').style.removeProperty('display');
  $('actionBar').classList.add('d-none');

  state.pdfs    = {};
  state.results = [];

  try {
    for (let i = 0; i < state.employees.length; i++) {
      const row = state.employees[i];
      const nrk = String(row.NRK || '').trim();
      updateProgress(i, state.employees.length, `Memproses: ${row.Nama || nrk}`);

      const result = { nrk, nama: String(row.Nama || ''), jabatan: String(row.Jabatan || ''),
        pdfOk: false, emailOk: false, error: null };

      try {
        const bytes = await generateSlipPDF(row, config);
        state.pdfs[nrk] = bytes;
        result.pdfOk = true;
      } catch (err) {
        result.error = 'PDF: ' + err.message;
      }

      if (result.pdfOk && $('sendEmailToggle').checked) {
        try {
          result.emailOk = await sendViaEmailJS(row, state.pdfs[nrk], config);
        } catch (err) {
          result.error = (result.error || '') + ' | Email: ' + err.message;
        }
      }

      state.results.push(result);
    }

    updateProgress(state.employees.length, state.employees.length, 'Selesai!');
    await new Promise(r => setTimeout(r, 600));
    $('progressBox').classList.add('d-none');

    renderHasil(state.results, $('sendEmailToggle').checked);
    $('hasilCard').classList.remove('d-none');
    $('actionBar').classList.remove('d-none');

    // Save history
    const pdfOk = state.results.filter(r => r.pdfOk).length;
    saveToHistory({ company: config.companyName, month: config.payrollMonth,
      total: state.results.length, pdfOk });

    const gagal = state.results.length - pdfOk;
    if (gagal === 0) toast(`${pdfOk} slip gaji berhasil dibuat!`, 'success');
    else toast(`${pdfOk} berhasil, ${gagal} gagal.`, gagal > 0 ? 'warning' : 'success');

  } catch (err) {
    toast('Error: ' + err.message, 'danger');
    goStep(3);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-play-circle me-2"></i>Generate Slip Gaji';
  }
});

// ── Progress ─────────────────────────────────────────────────
function updateProgress(done, total, label) {
  $('progressLabel').textContent  = label;
  $('progressCount').textContent  = `${done} / ${total}`;
  $('progressBar').style.width    = total ? `${(done / total) * 100}%` : '0%';
  $('progressCurrent').textContent = done === total ? '✓ Semua selesai' : '';
}

// ── Render hasil ─────────────────────────────────────────────
function renderHasil(results, emailEnabled) {
  const total = results.length;
  const pdfOk = results.filter(r => r.pdfOk).length;
  const emaOk = results.filter(r => r.emailOk).length;
  const gagal = total - pdfOk;

  $('summaryCards').innerHTML = `
    <div class="col-6 col-md-3"><div class="stat-card s-total text-center">
      <div class="num">${total}</div><div class="lbl">Total Karyawan</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card s-ok text-center">
      <div class="num">${pdfOk}</div><div class="lbl">PDF Berhasil</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card s-email text-center">
      <div class="num">${emailEnabled ? emaOk : '—'}</div><div class="lbl">Email Terkirim</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card s-fail text-center">
      <div class="num">${gagal}</div><div class="lbl">Gagal</div></div></div>`;

  $('hasilTbody').innerHTML = results.map(r => {
    const pdfB  = r.pdfOk
      ? '<span class="badge badge-ok">✓ OK</span>'
      : '<span class="badge badge-fail">✗ Gagal</span>';
    const emaB  = !emailEnabled ? '<span class="badge badge-skip">—</span>'
      : r.emailOk ? '<span class="badge badge-ok">✓ Terkirim</span>'
      : '<span class="badge badge-fail">✗ Gagal</span>';
    const aksi  = r.pdfOk ? `
      <div class="d-flex gap-1 justify-content-center">
        <button class="btn btn-outline-primary btn-sm py-0 px-2"
                onclick="previewPDF('${r.nrk}','${r.nama.replace(/'/g,"\\'")}')">
          <i class="bi bi-eye"></i></button>
        <button class="btn btn-outline-success btn-sm py-0 px-2"
                onclick="downloadPDF('${r.nrk}')">
          <i class="bi bi-download"></i></button>
      </div>` : '—';
    const errRow = r.error ? `<tr class="table-danger"><td colspan="6" class="ps-3 small text-danger py-1">⚠ ${r.error}</td></tr>` : '';
    return `<tr>
      <td class="ps-3 font-monospace small">${r.nrk}</td>
      <td class="fw-semibold">${r.nama}</td>
      <td class="text-muted small">${r.jabatan}</td>
      <td class="text-center">${pdfB}</td>
      <td class="text-center">${emaB}</td>
      <td>${aksi}</td>
    </tr>${errRow}`;
  }).join('');
}

window.resetForm = function () {
  clearFile();
  state.results = [];
  state.pdfs    = {};
  $('hasilCard').classList.add('d-none');
  $('hasilTbody').innerHTML = '';
  $('summaryCards').innerHTML = '';
};

// ── Download ─────────────────────────────────────────────────
window.downloadPDF = function (nrk) {
  const bytes = state.pdfs[nrk];
  if (!bytes) return;
  triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `slip_${nrk}.pdf`);
};

on('btnDownloadAll', 'click', async () => {
  const keys = Object.keys(state.pdfs);
  if (!keys.length) return;
  $('btnDownloadAll').innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyiapkan…';
  const zip = new JSZip();
  keys.forEach(nrk => zip.file(`slip_${nrk}.pdf`, state.pdfs[nrk]));
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `slip_gaji_${Date.now()}.zip`);
  $('btnDownloadAll').innerHTML = '<i class="bi bi-download me-1"></i>Download Semua (ZIP)';
  toast('ZIP berhasil diunduh.', 'success');
});

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Export Rekap Excel ────────────────────────────────────────
on('btnExport', 'click', () => {
  if (!state.results.length) return;
  const rows = state.results.map(r => ({
    NRK: r.nrk, Nama: r.nama, Jabatan: r.jabatan,
    'PDF OK': r.pdfOk ? 'Ya' : 'Tidak',
    'Email OK': r.emailOk ? 'Ya' : 'Tidak',
    Keterangan: r.error || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
  XLSX.writeFile(wb, `rekap_gaji_${Date.now()}.xlsx`);
  toast('Rekap berhasil diexport.', 'success');
});

// ── Preview PDF ───────────────────────────────────────────────
window.previewPDF = function (nrk, nama) {
  const bytes = state.pdfs[nrk];
  if (!bytes) return;
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  $('previewFrame').src  = url;
  $('previewName').textContent = nama;
  $('previewNRK').textContent  = nrk;
  $('btnPreviewDownload').onclick = () => triggerDownload(blob, `slip_${nrk}.pdf`);
  new bootstrap.Modal($('#previewModal')).show();
};

// ── EmailJS ───────────────────────────────────────────────────
let ejsLoaded = false;
async function sendViaEmailJS(row, pdfBytes, config) {
  const serviceId  = $('ejsServiceId').value.trim()  || JSON.parse(localStorage.getItem('settings') || '{}').ejsService;
  const templateId = $('ejsTemplateId').value.trim() || JSON.parse(localStorage.getItem('settings') || '{}').ejsTemplate;
  const publicKey  = $('ejsPublicKey').value.trim()  || JSON.parse(localStorage.getItem('settings') || '{}').ejsKey;
  if (!serviceId || !templateId || !publicKey) throw new Error('Konfigurasi EmailJS tidak lengkap');

  if (!ejsLoaded) {
    await new Promise((res, rej) => {
      const s = Object.assign(document.createElement('script'), {
        src: 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
        onload: res, onerror: rej,
      });
      document.head.appendChild(s);
    });
    emailjs.init({ publicKey });
    ejsLoaded = true;
  }

  const b64 = btoa(Array.from(pdfBytes, b => String.fromCharCode(b)).join(''));
  const nrk = String(row.NRK || '').trim();
  await emailjs.send(serviceId, templateId, {
    to_name: String(row.Nama || ''), to_email: String(row.Email || ''),
    nrk, jabatan: String(row.Jabatan || ''),
    payroll_month: config.payrollMonth, company_name: config.companyName,
    password: nrk, attachment: b64, filename: `slip_${nrk}.pdf`,
  });
  return true;
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: 'check-circle-fill', danger: 'x-circle-fill',
    warning: 'exclamation-triangle-fill', info: 'info-circle-fill' };
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 show`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="d-flex"><div class="toast-body d-flex align-items-center gap-2">
    <i class="bi bi-${icons[type]}"></i>${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button>
  </div>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── PDF Generation ────────────────────────────────────────────
async function generateSlipPDF(row, config) {
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const hv  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const hvB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const mx = 35, rx = width - 35;
  const NAVY  = rgb(0, 0.2, 0.4);
  const LGREY = rgb(0.95, 0.95, 0.95);
  const LBLUE = rgb(0.8, 0.9, 0.97);
  const WHITE = rgb(1, 1, 1);
  const BLACK = rgb(0, 0, 0);
  const GREY6 = rgb(0.6, 0.6, 0.6);

  const gv = k => parseFloat(row[k] || 0) || 0;
  const fmtN = v => { const n = parseFloat(v)||0; if(!n) return '-'; return n.toLocaleString('id-ID'); };
  const fmtT = v => (parseFloat(v)||0).toLocaleString('id-ID');

  const txt = (t, x, y, { font=hv, size=9, color=BLACK }={}) =>
    page.drawText(String(t??''), { x, y, font, size, color });
  const txtR = (t, ex, y, { font=hv, size=9, color=BLACK }={}) => {
    const s = String(t??'');
    page.drawText(s, { x: ex - font.widthOfTextAtSize(s, size), y, font, size, color });
  };
  const rect = (x, y, w, h, c) => page.drawRectangle({ x, y, width:w, height:h, color:c });
  const hln  = (y, { x1=mx, x2=rx, t=0.4, c=GREY6 }={}) =>
    page.drawLine({ start:{x:x1,y}, end:{x:x2,y}, thickness:t, color:c });
  const vln  = (x, y1, y2, { t=0.4, c=GREY6 }={}) =>
    page.drawLine({ start:{x,y:y1}, end:{x,y:y2}, thickness:t, color:c });

  // Values
  const gaji=gv('Gaji'), tjJ=gv('Tj_Jabatan'), tjI=gv('Tj_Insentif'),
        lem=gv('Lembur'), tjL=gv('Tj_Lain'), tjF=gv('Tj_Fasilitas');
  const totalPH = gaji+tjJ+tjI+lem+tjL+tjF;

  const pBT=gv('Pot_BPJS_TK'), pBK=gv('Pot_BPJS_Kes'), pAb=gv('Pot_Absensi'),
        pOb=gv('Pot_Obat'), pRJ=gv('Pot_Rawat_Jalan'), pRI=gv('Pot_Rawat_Inap'),
        pSW=gv('Pot_S_Wajib'), pKo=gv('Pot_Koperasi'), pKt=gv('Pot_Kantin'),
        pLn=gv('Pot_Lain'), pBP=gv('Pot_BPJS_Pensiun');
  const totalPot = pBT+pBK+pAb+pOb+pRJ+pRI+pSW+pKo+pKt+pLn+pBP;
  const takeHome = totalPH - totalPot;
  const rsKes=gv('RS_BPJS_Kes'), rsTK=gv('RS_BPJS_TK'), rsPen=gv('RS_BPJS_Pensiun');

  const RH=18, HH=22;
  const C=[mx, mx+160, mx+290, mx+450, rx];
  const IC=[mx, mx+110, mx+320, mx+420, rx];

  let y = height - mx;

  // Header
  txt(config.companyName, mx, y-13, {font:hvB, size:13});
  txtR(config.payrollMonth, rx, y-13, {font:hvB, size:11});
  y -= 26;
  txt('SLIP GAJI', mx, y-10, {font:hvB, size:10});
  y -= 18;
  page.drawLine({start:{x:mx,y}, end:{x:rx,y}, thickness:1.2, color:NAVY});
  y -= 8;

  // Info table
  const iRows=[
    ['No Slip', row.No_Slip??''], ['Mitra Kerja', row.Nama??''],
    ['Jabatan', row.Jabatan??''], ['NIK', row.NRK??''],
    ['Unit', row.Unit??''], ['Alpa/Ijin', String(row.Alpa_Ijin??'0')+' Hari'],
    ['Point', row.Point??'0'], ['Golongan', row.Golongan??''],
  ];
  const iTop = y;
  for (let i=0; i<iRows.length; i++) {
    const ry = y-(i+1)*RH;
    rect(IC[0], ry, IC[4]-IC[0], RH, i%2===0?LGREY:WHITE);
    txt(iRows[i][0], IC[0]+3, ry+5, {font:hvB, size:8.5});
    txt(iRows[i][1], IC[1]+3, ry+5, {size:8.5});
  }
  for (let i=0; i<=iRows.length; i++) hln(iTop-i*RH, {x1:IC[0],x2:IC[4],t:0.3});
  IC.forEach(x => vln(x, y-iRows.length*RH, iTop, {t:0.3}));
  y -= iRows.length*RH + 8;

  // PH/POT header
  const phTop = y;
  rect(C[0], y-HH, C[2]-C[0], HH, NAVY);
  rect(C[2], y-HH, C[4]-C[2], HH, NAVY);
  txt('PENGHASILAN', C[0]+4, y-HH+7, {font:hvB, size:9, color:WHITE});
  txt('POTONGAN',    C[2]+4, y-HH+7, {font:hvB, size:9, color:WHITE});
  y -= HH;

  const dRows=[
    ['Gaji',         gaji,  'BPJS Tenaga Kerja',  pBT],
    ['Tj Jabatan',   tjJ,   'BPJS Kesehatan',     pBK],
    ['Tj Insentif',  tjI,   'Absensi',            pAb],
    ['Lembur',       lem,   'Obat',               pOb],
    ['Tj. Lain-lain',tjL,   'Rawat Jalan',        pRJ],
    ['Tj. Fasilitas',tjF,   'Rawat Inap',         pRI],
    ['',             null,  'S Wajib Dan Pokok',  pSW],
    ['',             null,  'Angsuran Koperasi',  pKo],
    ['',             null,  'Kantin',             pKt],
    ['',             null,  'Lain-lain',          pLn],
    ['',             null,  'BPJS Pensiun',       pBP],
  ];

  for (let i=0; i<dRows.length; i++) {
    const [pl,pv,ql,qv] = dRows[i];
    const ry = y-RH;
    const pb = i%2===0?WHITE:rgb(.98,.98,.98);
    const qb = (i===6||i===8)?LBLUE:pb;
    rect(C[0],ry,C[2]-C[0],RH,pb); rect(C[2],ry,C[4]-C[2],RH,qb);
    if (pl) txt(pl, C[0]+3, ry+5, {size:8.5});
    if (pv!==null) txtR(fmtN(pv), C[2]-3, ry+5, {size:8.5});
    txt(ql, C[2]+3, ry+5, {size:8.5});
    txtR(fmtN(qv), C[4]-3, ry+5, {size:8.5});
    y -= RH;
  }

  // Total row
  rect(C[0],y-RH,C[4]-C[0],RH,LGREY);
  txt('Total Penghasilan',C[0]+3,y-RH+5,{font:hvB,size:8.5});
  txtR(fmtT(totalPH),C[2]-3,y-RH+5,{font:hvB,size:8.5});
  txt('Total Potongan',C[2]+3,y-RH+5,{font:hvB,size:8.5});
  txtR(fmtT(totalPot),C[4]-3,y-RH+5,{font:hvB,size:8.5});
  y -= RH;

  for (let i=0; i<=dRows.length+2; i++) hln(phTop-i*RH, {x1:C[0],x2:C[4],t:0.3});
  C.forEach(x => vln(x, y, phTop, {t:0.3}));
  y -= 6;

  // Take Home Pay
  rect(C[0],y-26,C[4]-C[0],26,LGREY);
  page.drawRectangle({x:C[0],y:y-26,width:C[4]-C[0],height:26,borderColor:GREY6,borderWidth:0.5});
  txt('Take Home Pay :',C[0]+4,y-19,{font:hvB,size:11});
  txtR(fmtT(takeHome),C[4]-4,y-19,{font:hvB,size:11});
  y -= 32;

  // Rekening
  page.drawRectangle({x:C[0],y:y-RH,width:C[4]-C[0],height:RH,borderColor:GREY6,borderWidth:0.4});
  txt('No Slip Rekening',C[0]+3,y-RH+5,{font:hvB,size:8.5});
  txtR(String(row.No_Slip_Rek??'0'),C[2]-3,y-RH+5,{size:8.5});
  txt('Potongan Insentif',C[2]+3,y-RH+5,{font:hvB,size:8.5});
  txtR(fmtN(gv('Pot_Insentif')),C[4]-3,y-RH+5,{size:8.5});
  y -= RH+12;

  hln(y,{t:0.5,c:rgb(.75,.75,.75)});
  y -= 10;

  txt('Iuran yang ditanggung Rumah Sakit',mx,y-10,{font:hvB,size:9});
  y -= 22;
  const ixR = mx+200;
  [['BPJS Kesehatan',rsKes],['BPJS Tenaga Kerja',rsTK],['BPJS Pensiun',rsPen]].forEach(([l,v])=>{
    txt(l,mx,y-10,{size:8.5}); txtR(fmtT(v),ixR,y-10,{size:8.5}); y-=RH;
  });
  hln(y-2,{x1:mx,x2:ixR+5,t:0.5,c:BLACK});
  y -= 8;
  txtR(fmtT(rsKes+rsTK+rsPen),ixR,y-10,{font:hvB,size:8.5});

  const nrk = String(row.NRK||'').trim();
  return await pdfDoc.save({ userPassword: nrk, ownerPassword: nrk });
}
