"""hospital_data: chuẩn hóa tên, lọc loại cơ sở, đọc bảng HTML/Excel, gắn cờ trùng, xuất file cho seed."""
import csv

import openpyxl
import pytest

from hospital_data import build
from hospital_data.parsers import html_js_data, html_list, html_table, xlsx_table


@pytest.mark.parametrize("raw, name", [
    ("BVĐK Quảng Nam", "Bệnh viện Đa khoa Quảng Nam"),
    ("BVĐKKVMNPB Quảng Nam", "Bệnh viện Đa khoa khu vực miền núi phía Bắc Quảng Nam"),
    ("TTYT huyện Núi Thành", "Trung tâm Y tế huyện Núi Thành"),
    ("Trung Tâm Y tế Vietsovpetro", "Trung tâm Y tế Vietsovpetro"),
    ("  Bệnh viện  Đồng Tâm thuộc Công tyTNHH y tế Đồng Tâm", "Bệnh viện Đồng Tâm"),
    ("Bệnh viện Chữ Thập Xanh trực thuộc Công ty cổ phần", "Bệnh viện Chữ Thập Xanh"),
    ("Bệnh viện Sản Nhi - tỉnh Quảng Ngãi", "Bệnh viện Sản Nhi"),
    ("BV YHCT tỉnh Quảng Ngãi", "Bệnh viện Y học cổ truyền tỉnh Quảng Ngãi"),
    ("BV Lao & Bệnh phổi", "Bệnh viện Lao và Bệnh phổi"),
    ("TT Y tế Minh Long", "Trung tâm Y tế Minh Long"),
    ("BỆNH VIỆN ĐA KHOA HUYỆN SƠN TỊNH", "Bệnh viện Đa Khoa Huyện Sơn Tịnh"),
])
def test_normalize_name(raw, name):
    assert build.normalize_name(raw)[0] == name


@pytest.mark.parametrize("name, kind", [
    ("Bệnh viện Đà Nẵng", "Hospital"), ("Viện Y học biển", "Hospital"),
    ("Trung tâm Y tế khu vực Hội An", "HealthCenter"), ("Phòng khám đa khoa Phước An", None),
    ("Khoa Vi sinh, Bệnh viện Trường Đại học Y Dược Huế", None), ("Viện pháp y tâm thần trung ương", None),
    ("Trung tâm Kiểm soát bệnh tật", None),
])
def test_facility_type(name, kind):
    assert build.facility_type(name) == kind


def test_fold_matches_unaccent():
    assert build.fold("Bệnh viện Đa khoa Hoà Vang") == build.fold("BENH VIEN DA KHOA HOÀ  VANG")
    assert build.fold("Đà Nẵng") == "da nang"


def test_split_grouped_cell():
    row = {"ten": "Bệnh viện", "dia_chi": "*Bệnh viện Phục hồi chức năng (Cơ sở 1) 93 Đặng Huy Trứ *Bệnh viện "
           "Phục hồi chức năng (Cơ sở 2) 30 Tô Hiến Thành", "so_huu": "Public", "cap_cmkt": "", "vi_tri": "dòng 15"}
    parts = build._split_grouped(row)
    assert [(p["ten"], p["dia_chi"]) for p in parts] == [
        ("Bệnh viện Phục hồi chức năng (Cơ sở 1)", "93 Đặng Huy Trứ"),
        ("Bệnh viện Phục hồi chức năng (Cơ sở 2)", "30 Tô Hiến Thành")]


def test_near_duplicates_ignore_generic_words():
    rows = [{"ten": n, "tinh": "Huế", "can_xem": []} for n in
            ("Bệnh viện Tâm thần", "Bệnh viện Tâm Thần Huế", "Bệnh viện Đa khoa Đống Đa", "Bệnh viện Đa khoa Hà Đông")]
    build._flag_near_duplicates(rows)
    assert [bool(r["can_xem"]) for r in rows] == [True, True, False, False]


def test_html_table(tmp_path):
    f = tmp_path / "t.html"
    f.write_text("<table><tr><th>STT</th><th>Tên</th><th>Số GP</th><th>Hình thức</th><th>Địa chỉ</th><th>Xã</th></tr>"
                 "<tr><td>1</td><td>Bệnh viện  Mắt</td><td>1/GP</td><td>BV</td><td>33 Triệu Việt Vương</td>"
                 "<td>Phường Kon Tum</td></tr></table>", encoding="utf-8")
    (row,) = html_table(f, {"cot_ten": 1, "cot_dia_chi": [4, 5], "so_huu": "Private"})
    assert (row["ten"], row["dia_chi"], row["so_huu"]) == ("Bệnh viện Mắt", "33 Triệu Việt Vương, Phường Kon Tum", "Private")


def test_html_js_data_accepts_js_object_literal(tmp_path):
    f = tmp_path / "d.html"
    f.write_text("""<script>const data = [
        {"stt": 1, "ten_don_vi": "Bệnh viện Đà Nẵng", "dia_chi_moi": ""},
        {
            stt: 5,
            ten_don_vi: "Bệnh viện Ung bướu Đà Nẵng",
            dia_chi_moi: "Đường Hoàng Thị Loan, phường Hòa Khánh",
        },
    ];</script>""", encoding="utf-8")
    rows = html_js_data(f, {"truong_ten": "ten_don_vi", "truong_dia_chi": "dia_chi_moi"})
    assert [(r["ten"], r["dia_chi"], r["vi_tri"]) for r in rows] == [
        ("Bệnh viện Đà Nẵng", "", "STT 1"),
        ("Bệnh viện Ung bướu Đà Nẵng", "Đường Hoàng Thị Loan, phường Hòa Khánh", "STT 5")]


def test_html_list_reads_only_chosen_sections(tmp_path):
    f = tmp_path / "l.html"
    f.write_text("""<div class="ContentODM"><p>I. Chi cục</p><p>1. Chi cục Dân số</p>
        <p>II. Bệnh viện chuyên khoa</p><p>1. Bệnh viện Từ Dũ;</p><p>2. Bệnh viện Mắt.</p>
        <p>V. Trung tâm Y tế</p><p>Trung tâm Y tế Quận 1;</p></div>""", encoding="utf-8")
    rows = html_list(f, {"khoi": "ContentODM", "muc": ["Bệnh viện chuyên khoa"]})
    assert [(r["ten"], r["vi_tri"]) for r in rows] == [
        ("Bệnh viện Từ Dũ", "mục 'II. Bệnh viện chuyên khoa' số 1"),
        ("Bệnh viện Mắt", "mục 'II. Bệnh viện chuyên khoa' số 2")]


def test_xlsx_table(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["CƠ SỞ ĐỦ ĐIỀU KIỆN"])
    ws.append(["STT", "Số văn bản", "Ngày ban hành", "Tên cơ sở", "Địa chỉ"])
    ws.append([1, "5789/SYT-NVY", "28/12/2018", "Bệnh viện đa khoa Phương Đông", "Số 9 phố Viên"])
    wb.save(tmp_path / "x.xlsx")
    (row,) = xlsx_table(tmp_path / "x.xlsx", {})
    assert row["ten"] == "Bệnh viện đa khoa Phương Đông" and "5789/SYT-NVY" in row["vi_tri"]


def _cand(**over):
    base = {k: "" for k in build.CAND_COLS + ["_doc", "_file"]}
    return base | {"chon": "x", "ten": "Bệnh viện A", "tinh": "Huế", "loai": "Hospital", "_doc": "VB", "_file": "f"} | over


def test_export_only_chosen_rows_and_rejects_duplicates(tmp_path):
    src, dst = tmp_path / "c.csv", tmp_path / "h.csv"
    build.write_candidates([_cand(), _cand(ten="Bệnh viện B", chon="")], src)
    assert build.export(src, dst) == 1
    with open(dst, encoding="utf-8") as f:
        (row,) = list(csv.DictReader(f))
    assert row["name"] == "Bệnh viện A" and row["facility_type"] == "Hospital" and row["source_doc"] == "VB"

    build.write_candidates([_cand(), _cand(ten="BỆNH VIỆN A")], src)
    with pytest.raises(SystemExit, match="cùng tỉnh"):
        build.export(src, dst)
    build.write_candidates([_cand(tinh="")], src)
    with pytest.raises(SystemExit, match="thiếu tỉnh"):
        build.export(src, dst)


def test_apply_review(tmp_path):
    review = tmp_path / "duyet.csv"
    review.write_text("tinh,ten,hanh_dong,ten_moi,dia_chi,so_huu,ly_do\n"
                      "Huế,BỆNH VIỆN TÂM THẦN,bo,,,,trùng\n"
                      "Huế,Bệnh viện Tâm Thần Huế,giu,Bệnh viện Tâm thần Huế,-,Public,\n"
                      "Huế,Bệnh viện Không Còn,bo,,,,\n", encoding="utf-8")
    rows = [_cand(ten="Bệnh viện Tâm thần", dia_chi="39 Phạm Thị Liên"),
            _cand(ten="Bệnh viện Tâm Thần Huế", chon="", dia_chi="cũ")]
    warnings = build.apply_review(rows, review)
    assert (rows[0]["chon"], rows[0]["duyet"]) == ("", "bỏ: trùng")
    assert (rows[1]["chon"], rows[1]["ten"], rows[1]["dia_chi"], rows[1]["so_huu"]) == (
        "x", "Bệnh viện Tâm thần Huế", "", "Public")
    assert warnings == ["duyet.csv: không còn dòng 'Bệnh viện Không Còn' (Huế)"]
