import smtplib
import logging
from email.message import EmailMessage
from pathlib import Path


def build_email_message(
    sender: str,
    recipient_email: str,
    recipient_name: str,
    nrk: str,
    pdf_path: str,
    payroll_month: str,
    company_name: str,
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = f"Slip Gaji {payroll_month} - {recipient_name}"
    msg["From"] = sender
    msg["To"] = recipient_email

    body_text = f"""Yth. {recipient_name},

Terlampir adalah slip gaji Anda untuk periode {payroll_month}.

File PDF dilindungi dengan kata sandi.
Gunakan NRK Anda sebagai kata sandi untuk membuka file.

Kata sandi: {nrk}

Mohon simpan dokumen ini sebagai arsip pribadi Anda.

Hormat kami,
{company_name}
HRD / Divisi Penggajian

---
Email ini dibuat secara otomatis. Mohon tidak membalas email ini.
"""

    body_html = f"""
<html>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Yth. <strong>{recipient_name}</strong>,</p>
  <p>Terlampir adalah slip gaji Anda untuk periode <strong>{payroll_month}</strong>.</p>
  <p>File PDF dilindungi dengan kata sandi.<br>
  Gunakan <strong>NRK Anda</strong> sebagai kata sandi untuk membuka file.</p>
  <table style="border:1px solid #ccc; border-radius:4px; padding:10px; background:#f9f9f9;">
    <tr><td>Kata sandi&nbsp;&nbsp;</td><td><strong>{nrk}</strong></td></tr>
  </table>
  <br>
  <p>Mohon simpan dokumen ini sebagai arsip pribadi Anda.</p>
  <p>Hormat kami,<br>
  <strong>{company_name}</strong><br>
  HRD / Divisi Penggajian</p>
  <hr style="border:none; border-top:1px solid #eee;">
  <p style="font-size:11px; color:#999;">Email ini dibuat secara otomatis. Mohon tidak membalas email ini.</p>
</body>
</html>
"""

    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")

    pdf_bytes = Path(pdf_path).read_bytes()
    filename = Path(pdf_path).name
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    return msg


def send_email_smtp(message: EmailMessage, smtp_config: dict) -> bool:
    try:
        with smtplib.SMTP(smtp_config["host"], smtp_config["port"]) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_config["sender_email"], smtp_config["app_password"])
            server.send_message(message)
        return True
    except Exception as e:
        logging.error("Gagal mengirim email ke %s: %s", message["To"], e)
        return False


def send_slip(row: dict, pdf_path: str, smtp_config: dict, payroll_config: dict) -> bool:
    msg = build_email_message(
        sender=smtp_config["sender_email"],
        recipient_email=str(row["Email"]),
        recipient_name=str(row["Nama"]),
        nrk=str(row["NRK"]),
        pdf_path=pdf_path,
        payroll_month=payroll_config["payroll_month"],
        company_name=payroll_config["company_name"],
    )
    return send_email_smtp(msg, smtp_config)
