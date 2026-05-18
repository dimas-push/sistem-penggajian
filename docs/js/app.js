import { PDFDocument, rgb, StandardFonts } from 'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js';

// ── Globals ──────────────────────────────────────────────────
const generatedPDFs = {}; // { NRK: Uint8Array }

// ── Helpers ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function fmt(val) {
  const n = parseFloat(val) || 0;
  if (n === 0) return '-';
  return n.toLocaleString('id-ID');
}
function fmtN(val) {
  return (parseFloat(val) || 0).toLocaleString('id-ID');
}
function g(row, key) {
  return parseFloat(row[key] || 0) || 0;
}

// ── UI Events ────────────────────────────────────────────────
$('excelFile').addEventListener('change', function () {
  $('fileName').textContent = this.files[0]?.name || 'Belum ada file dipilih';
});

const uploadArea = $('uploadArea');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    $('excelFile').files = dt.files;
    $('fileName').textContent = file.name;
  }
});

$('sendEmailToggle').addEventListener('change', function () {
  $('emailFields').classList.toggle('d-none', !this.checked);
});

// ── Form Submit ───────────────────────────────────────────────
$('formPenggajian').addEventListener('submit', async function (e) {
  e.preventDefault();

  const companyName  = $('companyName').value.trim();
  const payrollMonth = $('payrollMonth').value.trim();
  const file = $('excelFile').files[0];

  if (!file) { alert('Pilih file Excel terlebih dahulu.'); return; }
  if (!payrollMonth) { alert('Isi periode penggajian.'); return; }

  const btn = $('btnProses');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses…';
  $('hasilBox').classList.add('d-none');
  $('progressBox').classList.remove('d-none');

  try {
    const employees = await readExcel(file);
    if (!employees.length) throw new Error('Data Excel kosong.');

    const config = { companyName, payrollMonth };
    const results = [];

    for (let i = 0; i < employees.length; i++) {
      const row = employees[i];
      const nrk = String(row.NRK || '').trim();
      updateProgress(i, employees.length, `Memproses: ${row.Nama || nrk}`);

      const result = { nrk, nama: String(row.Nama || ''), pdfOk: false, emailOk: false, error: null };

      try {
        const pdfBytes = await generateSlipPDF(row, config);
        generatedPDFs[nrk] = pdfBytes;
        result.pdfOk = true;
      } catch (err) {
        result.error = err.message;
      }

      if (result.pdfOk && $('sendEmailToggle').checked) {
        try {
          result.emailOk = await sendViaEmailJS(row, generatedPDFs[nrk], config);
        } catch (err) {
          result.error = (result.error ? result.error + ' | ' : '') + 'Email: ' + err.message;
        }
      }

      results.push(result);
    }

    updateProgress(employees.length, employees.length, 'Selesai!');
    renderHasil(results, $('sendEmailToggle').checked);
    $('hasilBox').classList.remove('d-none');
    $('hasilBox').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-play-circle me-2"></i>Generate Slip Gaji';
    setTimeout(() => $('progressBox').classList.add('d-none'), 1500);
  }
});

// ── Read Excel ────────────────────────────────────────────────
function readExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: 0 });
        resolve(data);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Generate PDF ──────────────────────────────────────────────
async function generateSlipPDF(row, config) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const hv  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const hvB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const mx = 35, rx = width - 35;
  const navy  = rgb(0, 0.2, 0.4);
  const lgrey = rgb(0.95, 0.95, 0.95);
  const lblue = rgb(0.8, 0.9, 0.97);
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const grey6 = rgb(0.6, 0.6, 0.6);

  const txt = (text, x, y, { font = hv, size = 9, color = black } = {}) =>
    page.drawText(String(text ?? ''), { x, y, font, size, color });

  const txtR = (text, rx2, y, opts = {}) => {
    const s = String(text ?? '');
    const f = opts.font || hv;
    const sz = opts.size || 9;
    page.drawText(s, { x: rx2 - f.widthOfTextAtSize(s, sz), y, font: f, size: sz, color: opts.color || black });
  };

  const rect = (x, y, w, h, color) =>
    page.drawRectangle({ x, y, width: w, height: h, color });

  const hline = (y, { x1 = mx, x2 = rx, thickness = 0.4, color = grey6 } = {}) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });

  const vline = (x, y1, y2, { thickness = 0.4, color = grey6 } = {}) =>
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color });

  // ── Values ──────────────────────────────────────────────────
  const gaji       = g(row, 'Gaji');
  const tjJab      = g(row, 'Tj_Jabatan');
  const tjIns      = g(row, 'Tj_Insentif');
  const lem        = g(row, 'Lembur');
  const tjLain     = g(row, 'Tj_Lain');
  const tjFas      = g(row, 'Tj_Fasilitas');
  const totalPH    = gaji + tjJab + tjIns + lem + tjLain + tjFas;

  const pBpjsTK    = g(row, 'Pot_BPJS_TK');
  const pBpjsKes   = g(row, 'Pot_BPJS_Kes');
  const pAbsensi   = g(row, 'Pot_Absensi');
  const pObat      = g(row, 'Pot_Obat');
  const pRawatJ    = g(row, 'Pot_Rawat_Jalan');
  const pRawatI    = g(row, 'Pot_Rawat_Inap');
  const pSWajib    = g(row, 'Pot_S_Wajib');
  const pKop       = g(row, 'Pot_Koperasi');
  const pKantin    = g(row, 'Pot_Kantin');
  const pLain      = g(row, 'Pot_Lain');
  const pPensiun   = g(row, 'Pot_BPJS_Pensiun');
  const totalPot   = pBpjsTK + pBpjsKes + pAbsensi + pObat + pRawatJ + pRawatI + pSWajib + pKop + pKantin + pLain + pPensiun;
  const takeHome   = totalPH - totalPot;

  const rsBpjsKes  = g(row, 'RS_BPJS_Kes');
  const rsBpjsTK   = g(row, 'RS_BPJS_TK');
  const rsPensiun  = g(row, 'RS_BPJS_Pensiun');
  const totalRS    = rsBpjsKes + rsBpjsTK + rsPensiun;

  // ── Layout ──────────────────────────────────────────────────
  const RH = 18, HH = 22;
  // Columns: penghasilan label | value | potongan label | value
  const C = [mx, mx + 160, mx + 290, mx + 450, rx]; // 4 col + end

  let y = height - mx; // start from top

  // Header
  txt(config.companyName, mx, y - 13, { font: hvB, size: 13 });
  txtR(config.payrollMonth, rx, y - 13, { font: hvB, size: 11 });
  y -= 26;
  txt('SLIP GAJI', mx, y - 10, { font: hvB, size: 10 });
  y -= 18;
  page.drawLine({ start: { x: mx, y }, end: { x: rx, y }, thickness: 1.2, color: navy });
  y -= 8;

  // Info table
  const iRows = [
    ['No Slip',    row.No_Slip ?? '',    '', ''],
    ['Mitra Kerja',row.Nama ?? '',       '', ''],
    ['Jabatan',    row.Jabatan ?? '',    '', ''],
    ['NIK',        row.NRK ?? '',        '', ''],
    ['Unit',       row.Unit ?? '',       '', ''],
    ['Alpa/Ijin',  row.Alpa_Ijin ?? '0','Hari', ''],
    ['Point',      row.Point ?? '0',     '', ''],
    ['Golongan',   row.Golongan ?? '',   '', ''],
  ];
  const IC = [mx, mx + 110, mx + 320, mx + 420, rx];
  const iTop = y;
  for (let i = 0; i < iRows.length; i++) {
    const ry = y - (i + 1) * RH;
    rect(IC[0], ry, IC[4] - IC[0], RH, i % 2 === 0 ? lgrey : white);
    txt(iRows[i][0], IC[0] + 3, ry + 5, { font: hvB, size: 8.5 });
    txt(iRows[i][1], IC[1] + 3, ry + 5, { size: 8.5 });
    txt(iRows[i][2], IC[2] + 3, ry + 5, { size: 8.5 });
  }
  // Grid
  for (let i = 0; i <= iRows.length; i++) hline(iTop - i * RH, { x1: IC[0], x2: IC[4] });
  IC.forEach(x => vline(x, y - iRows.length * RH, iTop));
  y -= iRows.length * RH + 8;

  // Penghasilan/Potongan header
  const phTop = y;
  rect(C[0], y - HH, C[2] - C[0], HH, navy);
  rect(C[2], y - HH, C[4] - C[2], HH, navy);
  txt('PENGHASILAN', C[0] + 4, y - HH + 7, { font: hvB, size: 9, color: white });
  txt('POTONGAN',    C[2] + 4, y - HH + 7, { font: hvB, size: 9, color: white });
  y -= HH;

  // Detail rows
  const dRows = [
    ['Gaji',         gaji,   'BPJS Tenaga Kerja',  pBpjsTK],
    ['Tj Jabatan',   tjJab,  'BPJS Kesehatan',     pBpjsKes],
    ['Tj Insentif',  tjIns,  'Absensi',            pAbsensi],
    ['Lembur',       lem,    'Obat',               pObat],
    ['Tj. Lain-lain',tjLain, 'Rawat Jalan',        pRawatJ],
    ['Tj. Fasilitas',tjFas,  'Rawat Inap',         pRawatI],
    ['',             null,   'S Wajib Dan Pokok',  pSWajib],
    ['',             null,   'Angsuran Koperasi',  pKop],
    ['',             null,   'Kantin',             pKantin],
    ['',             null,   'Lain-lain',          pLain],
    ['',             null,   'BPJS Pensiun',       pPensiun],
  ];

  for (let i = 0; i < dRows.length; i++) {
    const [pl, pv, ql, qv] = dRows[i];
    const ry = y - RH;
    const pbg = i % 2 === 0 ? white : rgb(0.98, 0.98, 0.98);
    const qbg = (i === 6 || i === 8) ? lblue : pbg;
    rect(C[0], ry, C[2] - C[0], RH, pbg);
    rect(C[2], ry, C[4] - C[2], RH, qbg);
    if (pl) txt(pl, C[0] + 3, ry + 5, { size: 8.5 });
    if (pv !== null) txtR(fmt(pv), C[2] - 3, ry + 5, { size: 8.5 });
    txt(ql, C[2] + 3, ry + 5, { size: 8.5 });
    txtR(fmt(qv), C[4] - 3, ry + 5, { size: 8.5 });
    y -= RH;
  }

  // Total row
  rect(C[0], y - RH, C[4] - C[0], RH, lgrey);
  txt('Total Penghasilan', C[0] + 3, y - RH + 5, { font: hvB, size: 8.5 });
  txtR(fmtN(totalPH), C[2] - 3, y - RH + 5, { font: hvB, size: 8.5 });
  txt('Total Potongan', C[2] + 3, y - RH + 5, { font: hvB, size: 8.5 });
  txtR(fmtN(totalPot), C[4] - 3, y - RH + 5, { font: hvB, size: 8.5 });
  y -= RH;

  // Grid for PH/Pot table
  const phBottom = y;
  for (let i = 0; i <= dRows.length + 2; i++) hline(phTop - i * RH, { x1: C[0], x2: C[4], thickness: 0.3 });
  C.forEach(x => vline(x, phBottom, phTop));
  y -= 6;

  // Take Home Pay
  rect(C[0], y - 26, C[4] - C[0], 26, lgrey);
  page.drawRectangle({ x: C[0], y: y - 26, width: C[4] - C[0], height: 26, borderColor: grey6, borderWidth: 0.5 });
  txt('Take Home Pay :', C[0] + 4, y - 19, { font: hvB, size: 11 });
  txtR(fmtN(takeHome), C[4] - 4, y - 19, { font: hvB, size: 11 });
  y -= 32;

  // No Slip Rekening
  page.drawRectangle({ x: C[0], y: y - RH, width: C[4] - C[0], height: RH, borderColor: grey6, borderWidth: 0.4 });
  txt('No Slip Rekening', C[0] + 3, y - RH + 5, { font: hvB, size: 8.5 });
  txtR(String(row.No_Slip_Rek ?? '0'), C[2] - 3, y - RH + 5, { size: 8.5 });
  txt('Potongan Insentif', C[2] + 3, y - RH + 5, { font: hvB, size: 8.5 });
  txtR(fmt(g(row, 'Pot_Insentif')), C[4] - 3, y - RH + 5, { size: 8.5 });
  y -= RH + 12;

  hline(y, { thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
  y -= 10;

  // Iuran RS
  txt('Iuran yang ditanggung Rumah Sakit', mx, y - 10, { font: hvB, size: 9 });
  y -= 22;
  const iuranX = mx + 200;
  const iuranRows = [
    ['BPJS Kesehatan',    rsBpjsKes],
    ['BPJS Tenaga Kerja', rsBpjsTK],
    ['BPJS Pensiun',      rsPensiun],
  ];
  for (const [label, val] of iuranRows) {
    txt(label, mx, y - 10, { size: 8.5 });
    txtR(fmtN(val), iuranX, y - 10, { size: 8.5 });
    y -= RH;
  }
  hline(y - 2, { x1: mx, x2: iuranX + 5, thickness: 0.5, color: black });
  y -= 8;
  txtR(fmtN(totalRS), iuranX, y - 10, { font: hvB, size: 8.5 });

  // Save dengan password = NRK
  const nrk = String(row.NRK || '').trim();
  const pdfBytes = await pdfDoc.save({
    userPassword: nrk,
    ownerPassword: nrk,
  });

  return pdfBytes;
}

// ── Send via EmailJS ──────────────────────────────────────────
async function sendViaEmailJS(row, pdfBytes, config) {
  const serviceId  = $('ejsServiceId').value.trim();
  const templateId = $('ejsTemplateId').value.trim();
  const publicKey  = $('ejsPublicKey').value.trim();
  if (!serviceId || !templateId || !publicKey) throw new Error('Isi semua field EmailJS');

  // Load EmailJS SDK
  if (!window.emailjs) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    emailjs.init({ publicKey });
  }

  // Convert PDF bytes to base64
  const b64 = btoa(Array.from(pdfBytes, b => String.fromCharCode(b)).join(''));
  const nrk = String(row.NRK || '').trim();

  await emailjs.send(serviceId, templateId, {
    to_name:       String(row.Nama || ''),
    to_email:      String(row.Email || ''),
    nrk:           nrk,
    jabatan:       String(row.Jabatan || ''),
    payroll_month: config.payrollMonth,
    company_name:  config.companyName,
    password:      nrk,
    attachment:    b64,
    filename:      `slip_${nrk}.pdf`,
  });
  return true;
}

// ── Progress ──────────────────────────────────────────────────
function updateProgress(done, total, label) {
  $('progressLabel').textContent = label;
  $('progressCount').textContent = `${done} / ${total}`;
  $('progressBar').style.width = total ? `${(done / total) * 100}%` : '0%';
}

// ── Render hasil ──────────────────────────────────────────────
function renderHasil(results, emailEnabled) {
  const total  = results.length;
  const pdfOk  = results.filter(r => r.pdfOk).length;
  const emaOk  = results.filter(r => r.emailOk).length;
  const gagal  = total - pdfOk;

  $('summaryCards').innerHTML = `
    <div class="col-6 col-md-3"><div class="stat-card s-total"><div class="num">${total}</div><div class="lbl">Total Karyawan</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card s-ok"><div class="num">${pdfOk}</div><div class="lbl">PDF Berhasil</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card s-email"><div class="num">${emailEnabled ? emaOk : '—'}</div><div class="lbl">Email Terkirim</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card s-fail"><div class="num">${gagal}</div><div class="lbl">Gagal</div></div></div>
  `;

  $('hasilTbody').innerHTML = results.map(r => {
    const pdfBadge   = r.pdfOk ? '<span class="badge badge-ok">✓ OK</span>' : '<span class="badge badge-fail">✗ Gagal</span>';
    const emailBadge = !emailEnabled ? '<span class="badge badge-skip">—</span>'
      : r.emailOk ? '<span class="badge badge-ok">✓ Terkirim</span>' : '<span class="badge badge-fail">✗ Gagal</span>';
    const keterangan = r.error ? `<span class="text-danger small">${r.error}</span>` : '<span class="text-muted">—</span>';
    const dlBtn = r.pdfOk
      ? `<button class="btn btn-outline-primary btn-sm py-0" onclick="downloadPDF('${r.nrk}')"><i class="bi bi-download"></i></button>`
      : '—';
    return `<tr>
      <td class="font-monospace small">${r.nrk}</td>
      <td>${r.nama}</td>
      <td class="text-center">${pdfBadge}</td>
      <td class="text-center">${emailBadge}</td>
      <td class="font-monospace small text-muted">${r.nrk}</td>
      <td class="text-center">${dlBtn}</td>
    </tr>`;
  }).join('');
}

// ── Download single PDF ───────────────────────────────────────
window.downloadPDF = function (nrk) {
  const bytes = generatedPDFs[nrk];
  if (!bytes) return;
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `slip_${nrk}.pdf`;
  a.click(); URL.revokeObjectURL(url);
};

// ── Download ALL as ZIP ───────────────────────────────────────
$('btnDownloadAll').addEventListener('click', async () => {
  const keys = Object.keys(generatedPDFs);
  if (!keys.length) return;
  const zip = new JSZip();
  keys.forEach(nrk => zip.file(`slip_${nrk}.pdf`, generatedPDFs[nrk]));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'slip_gaji_semua.zip';
  a.click(); URL.revokeObjectURL(url);
});
