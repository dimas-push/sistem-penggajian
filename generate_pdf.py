from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


def fmt(amount) -> str:
    """Format angka ke string ribuan, tampilkan '-' jika nol."""
    try:
        val = float(amount)
    except (TypeError, ValueError):
        return "-"
    if val == 0:
        return "-"
    return "{:,.0f}".format(val).replace(",", ".")


def fmt_total(amount) -> str:
    """Format total — tampilkan 0 jika nol (bukan dash)."""
    try:
        val = float(amount)
    except (TypeError, ValueError):
        return "0"
    return "{:,.0f}".format(val).replace(",", ".")


def _v(row, key):
    """Ambil nilai numerik dari dict row, default 0."""
    try:
        return float(row.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def generate_slip_pdf(row: dict, output_path: str) -> str:
    from config import PAYROLL_CONFIG

    company_name = PAYROLL_CONFIG["company_name"]
    payroll_month = PAYROLL_CONFIG["payroll_month"]

    # ── Komponen penghasilan ──────────────────────────────────
    gaji          = _v(row, "Gaji")
    tj_jabatan    = _v(row, "Tj_Jabatan")
    tj_insentif   = _v(row, "Tj_Insentif")
    lembur        = _v(row, "Lembur")
    tj_lain       = _v(row, "Tj_Lain")
    tj_fasilitas  = _v(row, "Tj_Fasilitas")
    total_penghasilan = gaji + tj_jabatan + tj_insentif + lembur + tj_lain + tj_fasilitas

    # ── Komponen potongan ────────────────────────────────────
    pot_bpjs_tk     = _v(row, "Pot_BPJS_TK")
    pot_bpjs_kes    = _v(row, "Pot_BPJS_Kes")
    pot_absensi     = _v(row, "Pot_Absensi")
    pot_obat        = _v(row, "Pot_Obat")
    pot_rawat_jalan = _v(row, "Pot_Rawat_Jalan")
    pot_rawat_inap  = _v(row, "Pot_Rawat_Inap")
    pot_s_wajib     = _v(row, "Pot_S_Wajib")
    pot_koperasi    = _v(row, "Pot_Koperasi")
    pot_kantin      = _v(row, "Pot_Kantin")
    pot_lain        = _v(row, "Pot_Lain")
    pot_bpjs_pensiun= _v(row, "Pot_BPJS_Pensiun")
    total_potongan  = (pot_bpjs_tk + pot_bpjs_kes + pot_absensi + pot_obat +
                       pot_rawat_jalan + pot_rawat_inap + pot_s_wajib +
                       pot_koperasi + pot_kantin + pot_lain + pot_bpjs_pensiun)

    take_home = total_penghasilan - total_potongan

    # ── Iuran RS ─────────────────────────────────────────────
    rs_bpjs_kes    = _v(row, "RS_BPJS_Kes")
    rs_bpjs_tk     = _v(row, "RS_BPJS_TK")
    rs_bpjs_pensiun= _v(row, "RS_BPJS_Pensiun")
    total_rs       = rs_bpjs_kes + rs_bpjs_tk + rs_bpjs_pensiun

    # ── Warna ────────────────────────────────────────────────
    BLUE   = colors.HexColor("#003366")
    LBLUE  = colors.HexColor("#CCE5FF")
    LGREY  = colors.HexColor("#F2F2F2")
    WHITE  = colors.white
    BLACK  = colors.black

    # ── Dokumen ──────────────────────────────────────────────
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )

    styles = getSampleStyleSheet()
    st_co = ParagraphStyle("co", fontSize=13, fontName="Helvetica-Bold", spaceAfter=1)
    st_sub = ParagraphStyle("sub", fontSize=10, fontName="Helvetica-Bold", spaceAfter=2)
    st_month = ParagraphStyle("month", fontSize=10, fontName="Helvetica-Bold",
                               alignment=TA_RIGHT)

    # ──────────────────────────────────────────────────────────
    # BAGIAN 1: Header (nama RS + SLIP GAJI | Bulan)
    # ──────────────────────────────────────────────────────────
    header_data = [[
        Paragraph(company_name, st_co),
        Paragraph(payroll_month, st_month),
    ]]
    header_tbl = Table(header_data, colWidths=["65%", "35%"])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    slip_label = Table([["SLIP GAJI", ""]], colWidths=["65%", "35%"])
    slip_label.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (0, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    # ──────────────────────────────────────────────────────────
    # BAGIAN 2: Info karyawan
    # ──────────────────────────────────────────────────────────
    def info_row(label, value, extra_label="", extra_value=""):
        return [label, value, extra_label, extra_value]

    alpa = fmt(_v(row, "Alpa_Ijin")) if _v(row, "Alpa_Ijin") else "0"

    info_data = [
        ["No Slip",    str(row.get("No_Slip", "")),   "",     ""],
        ["Mitra Kerja",str(row.get("Nama", "")),       "",     ""],
        ["Jabatan",    str(row.get("Jabatan", "")),    "",     ""],
        ["NIK",        str(row.get("NRK", "")),        "",     ""],
        ["Unit",       str(row.get("Unit", "")),       "",     ""],
        ["Alpa/Ijin",  alpa,                           "Hari", ""],
        ["Point",      str(row.get("Point", "0")),     "",     ""],
        ["Golongan",   str(row.get("Golongan", "")),   "",     ""],
    ]

    cw_info = [4*cm, 7*cm, 2*cm, 4.5*cm]
    info_tbl = Table(info_data, colWidths=cw_info)
    info_tbl.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",  (0, 0), (-1, -1), 9),
        ("FONTNAME",  (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID",      (0, 0), (-1, -1), 0.4, colors.lightgrey),
        ("BACKGROUND",(0, 0), (0, -1), LGREY),
        ("TOPPADDING",(0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
    ]))

    # ──────────────────────────────────────────────────────────
    # BAGIAN 3: Tabel PENGHASILAN | POTONGAN (2 kolom berdampingan)
    # ──────────────────────────────────────────────────────────
    col_left  = 4.5 * cm   # label penghasilan
    col_right = 3.0 * cm   # nominal penghasilan
    col_mid   = 4.5 * cm   # label potongan
    col_far   = 2.5 * cm   # nominal potongan

    # Header baris
    ph_hdr = Table(
        [["PENGHASILAN", "", "POTONGAN", ""]],
        colWidths=[col_left, col_right, col_mid, col_far],
    )
    ph_hdr.setStyle(TableStyle([
        ("FONTNAME",     (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("BACKGROUND",   (0, 0), (1, 0),   BLUE),
        ("BACKGROUND",   (2, 0), (3, 0),   BLUE),
        ("TEXTCOLOR",    (0, 0), (-1, -1), WHITE),
        ("ALIGN",        (1, 0), (1, 0),   "RIGHT"),
        ("ALIGN",        (3, 0), (3, 0),   "RIGHT"),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("GRID",         (0, 0), (-1, -1), 0.4, colors.white),
    ]))

    # Baris detail — penghasilan kiri, potongan kanan
    detail_rows = [
        ("Gaji",          fmt(gaji),         "BPJS Tenaga Kerja",  fmt(pot_bpjs_tk)),
        ("Tj Jabatan",    fmt(tj_jabatan),   "BPJS Kesehatan",     fmt(pot_bpjs_kes)),
        ("Tj Insentif",   fmt(tj_insentif),  "Absensi",            fmt(pot_absensi)),
        ("Lembur",        fmt(lembur),       "Obat",               fmt(pot_obat)),
        ("Tj. Lain-lain", fmt(tj_lain),      "Rawat Jalan",        fmt(pot_rawat_jalan)),
        ("Tj. Fasilitas", fmt(tj_fasilitas), "Rawat Inap",         fmt(pot_rawat_inap)),
        ("",              "",                "S Wajib Dan Pokok",  fmt(pot_s_wajib)),
        ("",              "",                "Angsuran Koperasi",  fmt(pot_koperasi)),
        ("",              "",                "Kantin",             fmt(pot_kantin)),
        ("",              "",                "Lain-lain",          fmt(pot_lain)),
        ("",              "",                "BPJS Pensiun",       fmt(pot_bpjs_pensiun)),
    ]

    detail_data = [[r[0], r[1], r[2], r[3]] for r in detail_rows]
    detail_tbl = Table(detail_data, colWidths=[col_left, col_right, col_mid, col_far])

    detail_style = TableStyle([
        ("FONTNAME",     (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("ALIGN",        (1, 0), (1, -1), "RIGHT"),
        ("ALIGN",        (3, 0), (3, -1), "RIGHT"),
        ("TOPPADDING",   (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ("GRID",         (0, 0), (-1, -1), 0.4, colors.lightgrey),
        # Highlight baris S Wajib (index 6) kolom potongan
        ("BACKGROUND",   (2, 6), (3, 6), LBLUE),
        # Highlight baris Kantin (index 8) kolom potongan
        ("BACKGROUND",   (2, 8), (3, 8), LBLUE),
    ])
    detail_tbl.setStyle(detail_style)

    # Baris total
    total_row = Table(
        [["Total Penghasilan", fmt_total(total_penghasilan),
          "Total Potongan",    fmt_total(total_potongan)]],
        colWidths=[col_left, col_right, col_mid, col_far],
    )
    total_row.setStyle(TableStyle([
        ("FONTNAME",     (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("ALIGN",        (1, 0), (1, 0), "RIGHT"),
        ("ALIGN",        (3, 0), (3, 0), "RIGHT"),
        ("GRID",         (0, 0), (-1, -1), 0.4, colors.grey),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("BACKGROUND",   (0, 0), (-1, -1), LGREY),
    ]))

    # ──────────────────────────────────────────────────────────
    # BAGIAN 4: Take Home Pay
    # ──────────────────────────────────────────────────────────
    thp_data = [["Take Home Pay :", fmt_total(take_home)]]
    thp_tbl = Table(thp_data, colWidths=[col_left + col_right + col_mid, col_far])
    thp_tbl.setStyle(TableStyle([
        ("FONTNAME",     (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 11),
        ("ALIGN",        (0, 0), (0, 0), "RIGHT"),
        ("ALIGN",        (1, 0), (1, 0), "RIGHT"),
        ("BACKGROUND",   (0, 0), (-1, -1), LGREY),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("GRID",         (0, 0), (-1, -1), 0.5, colors.grey),
    ]))

    # ──────────────────────────────────────────────────────────
    # BAGIAN 5: No Slip Rekening & Potongan Insentif
    # ──────────────────────────────────────────────────────────
    rek_data = [["No Slip Rekening", str(row.get("No_Slip_Rek", "0")),
                 "Potongan Insentif", fmt(_v(row, "Pot_Insentif"))]]
    rek_tbl = Table(rek_data, colWidths=[col_left, col_right, col_mid, col_far])
    rek_tbl.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",  (0, 0), (-1, -1), 9),
        ("FONTNAME",  (0, 0), (0, 0), "Helvetica-Bold"),
        ("FONTNAME",  (2, 0), (2, 0), "Helvetica-Bold"),
        ("ALIGN",     (1, 0), (1, 0), "RIGHT"),
        ("ALIGN",     (3, 0), (3, 0), "RIGHT"),
        ("GRID",      (0, 0), (-1, -1), 0.4, colors.lightgrey),
        ("TOPPADDING",(0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
    ]))

    # ──────────────────────────────────────────────────────────
    # BAGIAN 6: Iuran yang ditanggung Rumah Sakit
    # ──────────────────────────────────────────────────────────
    iuran_header = Table(
        [["Iuran yang ditanggung Rumah Sakit", "", "", ""]],
        colWidths=[col_left, col_right, col_mid, col_far],
    )
    iuran_header.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",  (0, 0), (-1, -1), 9),
        ("SPAN",      (0, 0), (-1, 0)),
        ("TOPPADDING",(0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
    ]))

    iuran_data = [
        ["BPJS Kesehatan",    fmt_total(rs_bpjs_kes),   "", ""],
        ["BPJS Tenaga Kerja", fmt_total(rs_bpjs_tk),    "", ""],
        ["BPJS Pensiun",      fmt_total(rs_bpjs_pensiun),"", ""],
        ["",                  fmt_total(total_rs),       "", ""],
    ]
    iuran_tbl = Table(iuran_data, colWidths=[col_left, col_right, col_mid, col_far])
    iuran_tbl.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",  (0, 0), (-1, -1), 9),
        ("FONTNAME",  (0, 3), (1, 3), "Helvetica-Bold"),
        ("ALIGN",     (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, 3), (1, 3), 0.5, colors.black),
        ("TOPPADDING",(0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
    ]))

    # ──────────────────────────────────────────────────────────
    # Susun story
    # ──────────────────────────────────────────────────────────
    story = [
        header_tbl,
        slip_label,
        HRFlowable(width="100%", thickness=0.8, color=BLACK),
        Spacer(1, 0.2 * cm),
        info_tbl,
        Spacer(1, 0.3 * cm),
        ph_hdr,
        detail_tbl,
        total_row,
        Spacer(1, 0.2 * cm),
        thp_tbl,
        Spacer(1, 0.2 * cm),
        rek_tbl,
        Spacer(1, 0.3 * cm),
        HRFlowable(width="100%", thickness=0.4, color=colors.lightgrey),
        Spacer(1, 0.1 * cm),
        iuran_header,
        iuran_tbl,
    ]

    doc.build(story)
    return output_path
