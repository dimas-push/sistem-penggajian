import os
import logging
from pathlib import Path

import pandas as pd

from config import SMTP_CONFIG, PAYROLL_CONFIG
from generate_pdf import generate_slip_pdf
from encrypt_pdf import encrypt_pdf
from send_email import send_slip

REQUIRED_COLUMNS = [
    "NRK", "Nama", "Jabatan", "Unit", "Golongan", "Email",
    "No_Slip", "Gaji",
    "Pot_BPJS_TK", "Pot_BPJS_Kes", "Pot_BPJS_Pensiun",
    "RS_BPJS_Kes", "RS_BPJS_TK", "RS_BPJS_Pensiun",
]


def setup_logging(log_file: str = "payroll_log.txt") -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )


def load_employee_data(filepath: str) -> pd.DataFrame:
    df = pd.read_excel(filepath, dtype={"NRK": str})
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Kolom tidak ditemukan di Excel: {missing}")
    for col in ["NRK", "Nama", "Jabatan", "Unit", "Email"]:
        df[col] = df[col].astype(str).str.strip()
    return df


def process_employee(row: dict, output_dir: str, smtp_config: dict, payroll_config: dict) -> dict:
    nrk = str(row["NRK"])
    nama = str(row["Nama"])
    status = {"nrk": nrk, "nama": nama, "pdf_generated": False, "email_sent": False, "error": None}

    temp_path = os.path.join(output_dir, f"{nrk}_slip_temp.pdf")
    final_path = os.path.join(output_dir, f"{nrk}_slip.pdf")

    try:
        logging.info("Memproses: %s (%s)", nama, nrk)

        generate_slip_pdf(row, temp_path)
        encrypt_pdf(temp_path, final_path, password=nrk)
        status["pdf_generated"] = True
        logging.info("  PDF berhasil dibuat: %s", final_path)

        sent = send_slip(row, final_path, smtp_config, payroll_config)
        status["email_sent"] = sent
        if sent:
            logging.info("  Email terkirim ke: %s", row["Email"])
        else:
            logging.warning("  Email GAGAL dikirim ke: %s", row["Email"])

    except Exception as e:
        status["error"] = str(e)
        logging.error("  Error saat memproses %s: %s", nrk, e)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    return status


def main():
    setup_logging()
    logging.info("=" * 60)
    logging.info("SISTEM PENGGAJIAN — %s", PAYROLL_CONFIG["payroll_month"])
    logging.info("=" * 60)

    output_dir = PAYROLL_CONFIG["output_dir"]
    Path(output_dir).mkdir(exist_ok=True)

    df = load_employee_data(PAYROLL_CONFIG["data_file"])
    logging.info("Data karyawan dimuat: %d orang", len(df))

    results = []
    for _, row in df.iterrows():
        result = process_employee(row.to_dict(), output_dir, SMTP_CONFIG, PAYROLL_CONFIG)
        results.append(result)

    total = len(results)
    berhasil = sum(1 for r in results if r["email_sent"])
    gagal = total - berhasil

    logging.info("=" * 60)
    logging.info("RINGKASAN")
    logging.info("  Total karyawan : %d", total)
    logging.info("  Email terkirim : %d", berhasil)
    logging.info("  Gagal          : %d", gagal)
    logging.info("=" * 60)

    if gagal:
        logging.warning("Karyawan yang gagal:")
        for r in results:
            if not r["email_sent"]:
                logging.warning("  - %s (%s): %s", r["nama"], r["nrk"], r["error"] or "Email tidak terkirim")


if __name__ == "__main__":
    main()
