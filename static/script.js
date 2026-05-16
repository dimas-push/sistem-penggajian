// ── File input label ─────────────────────────────────────────
document.getElementById('excelFile').addEventListener('change', function () {
  const name = this.files[0] ? this.files[0].name : 'Belum ada file dipilih';
  document.getElementById('fileName').textContent = name;
});

// ── Drag & drop ──────────────────────────────────────────────
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) {
    const input = document.getElementById('excelFile');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    document.getElementById('fileName').textContent = file.name;
  }
});

// ── Toggle email fields ──────────────────────────────────────
document.getElementById('sendEmailToggle').addEventListener('change', function () {
  const fields = document.getElementById('emailFields');
  fields.style.setProperty('display', this.checked ? 'flex' : 'none', 'important');
  fields.classList.toggle('row', this.checked);
});

// ── Toggle password visibility ───────────────────────────────
function togglePassword() {
  const inp = document.getElementById('appPassword');
  const icon = document.getElementById('eyeIcon');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.className = 'bi bi-eye-slash';
  } else {
    inp.type = 'password';
    icon.className = 'bi bi-eye';
  }
}

// ── Form submit ──────────────────────────────────────────────
document.getElementById('formPenggajian').addEventListener('submit', async function (e) {
  e.preventDefault();

  const btn     = document.getElementById('btnProses');
  const loading = document.getElementById('loadingBox');
  const hasil   = document.getElementById('hasilBox');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses…';
  loading.classList.remove('d-none');
  hasil.classList.add('d-none');

  const formData = new FormData(this);

  try {
    const resp = await fetch('/proses', { method: 'POST', body: formData });
    const data = await resp.json();

    if (!resp.ok) {
      alert('Error: ' + (data.error || 'Terjadi kesalahan.'));
      return;
    }

    renderHasil(data);
    hasil.classList.remove('d-none');
    hasil.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    alert('Koneksi error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-play-circle me-2"></i>Proses Penggajian';
    loading.classList.add('d-none');
  }
});

// ── Render hasil ─────────────────────────────────────────────
function renderHasil(data) {
  const { results, summary } = data;
  const gagal = summary.total - summary.pdf_ok;

  // Summary cards
  document.getElementById('summaryCards').innerHTML = `
    <div class="col-6 col-md-3">
      <div class="stat-card stat-total">
        <div class="stat-num">${summary.total}</div>
        <div class="stat-lbl">Total Karyawan</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card stat-pdf">
        <div class="stat-num">${summary.pdf_ok}</div>
        <div class="stat-lbl">PDF Berhasil</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card stat-email">
        <div class="stat-num">${summary.send_email ? summary.email_ok : '—'}</div>
        <div class="stat-lbl">Email Terkirim</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="stat-card stat-gagal">
        <div class="stat-num">${gagal}</div>
        <div class="stat-lbl">Gagal</div>
      </div>
    </div>
  `;

  // Tabel
  const tbody = document.getElementById('hasilTbody');
  tbody.innerHTML = results.map(r => {
    const pdfBadge   = r.pdf_ok
      ? '<span class="badge badge-ok">✓ OK</span>'
      : '<span class="badge badge-fail">✗ Gagal</span>';
    const emailBadge = !summary.send_email
      ? '<span class="badge badge-skip">—</span>'
      : r.email_ok
        ? '<span class="badge badge-ok">✓ Terkirim</span>'
        : '<span class="badge badge-fail">✗ Gagal</span>';
    const keterangan = r.error
      ? `<span class="text-danger small">${r.error}</span>`
      : '<span class="text-muted small">—</span>';
    const downloadBtn = r.pdf_ok
      ? `<a href="/download/${r.filename}" class="btn btn-outline-primary btn-sm py-0">
           <i class="bi bi-download"></i>
         </a>`
      : '—';
    return `
      <tr>
        <td class="font-monospace">${r.nrk}</td>
        <td>${r.nama}</td>
        <td class="text-center">${pdfBadge}</td>
        <td class="text-center">${emailBadge}</td>
        <td>${keterangan}</td>
        <td class="text-center">${downloadBtn}</td>
      </tr>`;
  }).join('');
}
