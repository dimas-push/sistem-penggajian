import os
import io
import zipfile
import logging
import threading
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file, session
import pandas as pd

from generate_pdf import generate_slip_pdf
from encrypt_pdf import encrypt_pdf
from send_email import send_slip

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "rs-delima-secret-2026")

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "slip_gaji"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

REQUIRED_COLUMNS = [
    "NRK", "Nama", "Jabatan", "Unit", "Golongan", "Email",
    "No_Slip", "Gaji",
    "Pot_BPJS_TK", "Pot_BPJS_Kes", "Pot_BPJS_Pensiun",
    "RS_BPJS_Kes", "RS_BPJS_TK", "RS_BPJS_Pensiun",
]

# Simpan hasil proses di memori (per session sederhana)
_results_store = {}
_lock = threading.Lock()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/proses", methods=["POST"])
def proses():
    # ── Ambil konfigurasi dari form ──────────────────────────
    company_name  = request.form.get("company_name", "").strip()
    payroll_month = request.form.get("payroll_month", "").strip()
    sender_email  = request.form.get("sender_email", "").strip()
    app_password  = request.form.get("app_password", "").strip()
    send_email_flag = request.form.get("send_email") == "on"

    if not all([company_name, payroll_month]):
        return jsonify({"error": "Nama RS dan Periode wajib diisi."}), 400

    # ── Upload file Excel ────────────────────────────────────
    file = request.files.get("excel_file")
    if not file or file.filename == "":
        return jsonify({"error": "File Excel wajib diunggah."}), 400

    excel_path = os.path.join(UPLOAD_FOLDER, "data_karyawan.xlsx")
    file.save(excel_path)

    try:
        df = pd.read_excel(excel_path, dtype={"NRK": str})
    except Exception as e:
        return jsonify({"error": f"Gagal membaca Excel: {e}"}), 400

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        return jsonify({"error": f"Kolom tidak ditemukan: {', '.join(missing)}"}), 400

    for col in ["NRK", "Nama", "Jabatan", "Unit", "Email"]:
        df[col] = df[col].astype(str).str.strip()

    payroll_config = {
        "company_name": company_name,
        "payroll_month": payroll_month,
        "output_dir": OUTPUT_FOLDER,
    }
    smtp_config = {
        "host": "smtp.gmail.com",
        "port": 587,
        "sender_email": sender_email,
        "app_password": app_password,
    }

    # ── Proses setiap karyawan ───────────────────────────────
    results = []
    for _, row in df.iterrows():
        nrk  = str(row["NRK"])
        nama = str(row["Nama"])
        temp_path  = os.path.join(OUTPUT_FOLDER, f"{nrk}_temp.pdf")
        final_path = os.path.join(OUTPUT_FOLDER, f"{nrk}_slip.pdf")
        status = {
            "nrk": nrk, "nama": nama,
            "pdf_ok": False, "email_ok": False,
            "error": None, "filename": f"{nrk}_slip.pdf",
        }
        try:
            generate_slip_pdf(row.to_dict(), temp_path)
            encrypt_pdf(temp_path, final_path, password=nrk)
            status["pdf_ok"] = True
        except Exception as e:
            status["error"] = f"PDF gagal: {e}"
            results.append(status)
            continue
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        if send_email_flag and sender_email and app_password:
            try:
                ok = send_slip(row.to_dict(), final_path, smtp_config, payroll_config)
                status["email_ok"] = ok
                if not ok:
                    status["error"] = "Email gagal dikirim"
            except Exception as e:
                status["error"] = f"Email error: {e}"

        results.append(status)

    # Simpan results untuk download
    job_id = "latest"
    with _lock:
        _results_store[job_id] = results

    total    = len(results)
    pdf_ok   = sum(1 for r in results if r["pdf_ok"])
    email_ok = sum(1 for r in results if r["email_ok"])

    return jsonify({
        "results": results,
        "summary": {
            "total": total,
            "pdf_ok": pdf_ok,
            "email_ok": email_ok,
            "send_email": send_email_flag,
        },
    })


@app.route("/download/<filename>")
def download_pdf(filename):
    path = os.path.join(OUTPUT_FOLDER, filename)
    if not os.path.exists(path):
        return "File tidak ditemukan", 404
    return send_file(path, as_attachment=True, download_name=filename)


@app.route("/download-semua")
def download_semua():
    files = list(Path(OUTPUT_FOLDER).glob("*_slip.pdf"))
    if not files:
        return "Belum ada slip yang dibuat", 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, f.name)
    buf.seek(0)
    return send_file(buf, as_attachment=True, download_name="slip_gaji_semua.zip",
                     mimetype="application/zip")


@app.route("/template")
def download_template():
    path = "data_karyawan.xlsx"
    if not os.path.exists(path):
        return "Template tidak ditemukan", 404
    return send_file(path, as_attachment=True, download_name="template_data_karyawan.xlsx")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
