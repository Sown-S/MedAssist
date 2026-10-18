"""scripts/tt19_catalog.py: trích Phụ lục I, đối chiếu drugs.csv, ứng viên, gộp. Không truy cập mạng."""
import csv

import pytest

pytest.importorskip("docx", reason="cần python-docx: pip install -r drug_data/requirements.txt")

from drug_data import tt19_catalog as tt  # noqa: E402
from drug_data.tests.tt19_fixture import build_docx, build_html  # noqa: E402


@pytest.fixture(scope="module")
def appendix(tmp_path_factory):
    path = tmp_path_factory.mktemp("tt19") / "tt19.docx"
    build_docx(path)
    return tt.parse_appendix(path)


# Bản sao CỐ ĐỊNH của danh mục 100 thuốc ban đầu: test không phụ thuộc server/data/drugs.csv đang thay đổi
# (đối chiếu danh mục thật là việc của lệnh 'check', chạy trên Phụ lục I đầy đủ).
DRUGS_FIXTURE = tt.Path(__file__).with_name("drugs_100.csv")


def _drugs():
    return tt.read_csv(DRUGS_FIXTURE)


def test_parse_inherits_merged_cells_and_sections(appendix):
    by = lambda stt: [r for r in appendix if r["stt"] == stt]  # noqa: E731
    para = by("18")
    assert [(r["duong_dung"], r["dang_bao_che"]) for r in para] == [
        ("Uống", "Viên"), ("Uống", "Bột pha dung dịch"), ("Đặt trực tràng", "Viên đạn")]
    assert all(r["ten_thuoc"] == "Paracetamol" and r["dau_sao"] == "x" for r in para)
    assert para[0]["nhom"].startswith("II.") and para[0]["nhom_con"].startswith("1.")
    dexa = by("36")
    assert dexa[1]["ten_thuoc"] == "Dexamethason phosphat (natri)" and dexa[1]["duong_dung"] == "Tiêm"
    assert by("323")[0]["ham_luong"] == "" and by("323")[0]["dang_bao_che"] == "Bột pha dung dịch"
    assert by("97")[0]["nhom_con"] == "♦ Thuốc nhóm Nitroimidazol"
    assert max(int(r["stt"]) for r in appendix) == 479            # không đọc lẫn Phụ lục II


def test_every_drug_in_catalog_matches_appendix(appendix):
    _, drugs = _drugs()
    report = tt.check_rows(drugs, appendix)
    fails = [r for r in report if r["ket_qua"] == "FAIL"]
    assert fails == [], fails
    warns = {r["generic_name"] for r in report if r["ket_qua"] == "WARN"}
    # Cảnh báo có chủ đích: văn bản không ghi hàm lượng (Oresol), hàm lượng ghi theo khoảng (Lactulose),
    # lỗi chính tả trong văn bản gốc (Magnest hydmxyd)
    assert warns == {"Oresol", "Lactulose", "Magnesi hydroxyd + Nhôm hydroxyd"}, warns


def test_check_flags_wrong_reference(appendix):
    bad = {"generic_name": "Paracetamol", "trade_name": "X", "strength": "500 mg", "dosage_form": "viên nén",
           "unit": "viên", "source": "TT 19/2018/TT-BYT, Phụ lục I, STT 77"}
    (row,) = tt.check_rows([bad], appendix)
    assert row["ket_qua"] == "FAIL"
    wrong_strength = {**bad, "strength": "650 mg", "source": "TT 19/2018/TT-BYT, Phụ lục I, STT 18"}
    (row,) = tt.check_rows([wrong_strength], appendix)
    assert row["ket_qua"] == "WARN" and "hàm lượng" in row["ghi_chu"]


def test_candidates_filter_and_explode(appendix):
    _, drugs = _drugs()
    cands = tt.build_candidates(drugs, appendix)
    keys = {(c["stt"], c["strength"]) for c in cands}
    assert ("18", "100 mg") in keys                     # paracetamol 100 mg chưa có
    assert ("18", "500 mg") not in {(c["stt"], c["strength"]) for c in cands if c["dosage_form"] == "viên"}
    assert not any(c["stt"] in {"21", "109", "336"} for c in cands)    # opi, phong, tránh thai bị loại
    assert not any("tiêm" in c["duong_dung"].lower() for c in cands)
    salb = [c for c in cands if c["stt"] == "448"]
    assert {c["strength"] for c in salb} == {"4 mg"}    # 2 mg, 0,4 mg/ml, 100 mcg đã có; tiêm bị loại
    assert all(c["source"].startswith("TT 19/2018/TT-BYT, Phụ lục I, STT ") for c in cands)
    assert {c["unit"] for c in cands if c["stt"] == "269"} <= {"tuýp"}


def test_word_converted_table_repeats_merged_cells(tmp_path, appendix):
    """Bản thật (vbpl .doc -> Word -> .docx): 13 cột, ô gộp dọc LẶP LẠI STT/tên/đường dùng ở dòng tiếp.
    Lỗi cũ: gặp lại STT 14 tưởng sang phụ lục khác, chỉ trích được 14 thuốc."""
    p = tmp_path / "word.docx"
    build_docx(p, repeat_merged=True, wide=True)
    assert tt.parse_appendix(p) == appendix


def test_picks_global_tt_column_whichever_order(tmp_path, appendix):
    """Bản gốc: một cột TT liên tục, một cột đánh lại trong từng nhóm — phải lấy cột liên tục dù đứng trước/sau."""
    p = tmp_path / "local_first.docx"
    build_docx(p, local_first=True)
    assert tt.parse_appendix(p) == appendix
    assert max(int(r["stt"]) for r in appendix) == 479


def test_merge_selected_rows(appendix):
    fields, drugs = _drugs()
    cands = tt.build_candidates(drugs, appendix)
    pick = next(c for c in cands if c["stt"] == "18" and c["strength"] == "100 mg" and c["dosage_form"] == "viên")
    other = next(c for c in cands if c["stt"] == "66" and c["strength"] == "200 mg")
    rows = [{**pick, "chon": "x"}, {**other, "chon": "x", "unit": ""}, {**pick, "chon": ""}]
    added, problems = tt.merge_candidates(fields, drugs, rows)
    assert len(added) == 1 and added[0]["trade_name"] == "Paracetamol 100 mg" and added[0]["sale_price"] == ""
    assert problems and "thiếu unit" in problems[0]
    again, problems = tt.merge_candidates(fields, drugs + added, [{**pick, "chon": "x"}])
    assert again == [] and "đã có" in problems[0]


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    """Thư mục tạm có config.toml + inbox/, không đụng dữ liệu thật."""
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    cfg = tmp_path / "config.toml"
    cfg.write_text(f'''[tt19]
trang_van_ban = "https://vbpl.vn/van-ban/chi-tiet/tt19--132228?tabs=hien-thi-pdf"
trang_tai_ve = "https://vbpl.vn/van-ban/chi-tiet/tt19--132228?tabs=tai-ve"
tai_truc_tiep = []
thu_muc_tai_tay = "{inbox.as_posix()}"
''', encoding="utf-8")
    monkeypatch.setattr(tt, "CONFIG_FILE", cfg)
    monkeypatch.setattr(tt, "MIN_EXPECTED_DRUGS", 50)          # bảng dựng lại chỉ có các STT cần thiết
    monkeypatch.setattr(tt, "SOURCE_DIR", tmp_path / "src")
    monkeypatch.setattr(tt, "DOCX_FILE", tmp_path / "src" / "tt19_2018_chuyen_doi.docx")
    monkeypatch.setattr(tt, "MANIFEST", tmp_path / "src" / "manifest.json")
    monkeypatch.setattr(tt, "APPENDIX_CSV", tmp_path / "pl1.csv")
    monkeypatch.setattr(tt, "CANDIDATES_CSV", tmp_path / "cand.csv")
    monkeypatch.setattr(tt, "CHECK_REPORT", tmp_path / "report.csv")
    drugs_copy = tmp_path / "drugs.csv"
    drugs_copy.write_bytes(DRUGS_FIXTURE.read_bytes())
    monkeypatch.setattr(tt, "DRUGS_CSV", drugs_copy)
    return tmp_path


def test_run_from_inbox_without_arguments(workspace):
    """Tải tay .docx + .pdf vào inbox/ -> 'run' (không tham số): lưu minh chứng cả hai, trích từ .docx,
    check không FAIL, tự thêm ứng viên."""
    build_docx(workspace / "inbox" / "19_2018_TT-BYT.docx")
    (workspace / "inbox" / "19_2018_TT-BYT.pdf").write_bytes(b"%PDF-1.4 ban scan")
    assert tt.main(["run"]) == 0
    m = __import__("json").loads((workspace / "src" / "manifest.json").read_text(encoding="utf-8"))
    kinds = sorted(f["dinh_dang"] for f in m["files"])
    assert kinds == ["docx", "pdf"] and m["cach_lay"] == "Tải tay bằng trình duyệt"
    assert m["trang_tai_ve"].endswith("tabs=tai-ve") and m["file_trich_xuat"].endswith(".docx")
    assert all(len(f["sha256"]) == 64 for f in m["files"])
    with open(workspace / "drugs.csv", encoding="utf-8") as f:
        assert len(list(csv.DictReader(f))) > 100                      # merge --auto đã thêm thuốc
    assert (workspace / "cand.csv").read_bytes().startswith(b"\xef\xbb\xbf")


def test_fetch_html_and_manual_merge(workspace):
    build_html(workspace / "inbox" / "toan_van.html")
    assert tt.main(["fetch"]) == 0 and tt.main(["extract"]) == 0 and tt.main(["candidates"]) == 0
    _, cands = tt.read_csv(workspace / "cand.csv")
    cands[0]["chon"] = "x"
    tt.write_csv(workspace / "cand.csv", tt.CANDIDATE_FIELDS, cands, excel=True)
    assert tt.main(["merge"]) == 0
    with open(workspace / "drugs.csv", encoding="utf-8") as f:
        assert len(list(csv.DictReader(f))) == 101


def test_run_stops_when_extract_reads_too_few(workspace, monkeypatch):
    monkeypatch.setattr(tt, "MIN_EXPECTED_DRUGS", 400)
    build_docx(workspace / "inbox" / "tt19.docx")
    with pytest.raises(SystemExit, match="KHÔNG phải lỗi drugs.csv"):
        tt.main(["run"])


def test_inspect_writes_table_sample(workspace, monkeypatch):
    monkeypatch.setattr(tt, "OUTPUT_DIR", workspace)
    build_docx(workspace / "inbox" / "tt19.docx")
    tt.main(["fetch"])
    assert tt.main(["inspect"]) == 0
    text = (workspace / "tt19_bang_mau.txt").read_text(encoding="utf-8")
    assert "Bảng 0:" in text and "TÊN THUỐC" in text


def test_pdf_only_is_saved_but_asks_for_doc(workspace):
    (workspace / "inbox" / "tt19.pdf").write_bytes(b"%PDF-1.4 scan")
    with pytest.raises(SystemExit, match="Tải thêm bản .doc hoặc .docx"):
        tt.main(["fetch"])


def test_empty_inbox_and_blocked_download_explain_next_step(workspace):
    cfg = workspace / "config.toml"
    cfg.write_text(cfg.read_text(encoding="utf-8").replace(
        "tai_truc_tiep = []", 'tai_truc_tiep = ["http://khong-ton-tai.invalid/tt19.doc"]'), encoding="utf-8")
    with pytest.raises(SystemExit, match="Chưa có file nguồn.*tabs=tai-ve"):
        tt.main(["fetch"])


@pytest.mark.parametrize("rowspan", [True, False])
def test_html_page_parses_same_as_docx(tmp_path, appendix, rowspan):
    page = tmp_path / "p.html"
    build_html(page, rowspan=rowspan)
    assert tt.parse_appendix(page) == appendix


def test_doc_that_is_really_html_is_read_directly(tmp_path, appendix):
    disguised = tmp_path / "19_2018_TT-BYT_393919.doc"          # vbpl hay trả HTML dưới đuôi .doc
    build_html(disguised)
    assert tt.detect_kind(disguised) == "html"
    assert tt.parse_appendix(disguised) == appendix


def test_extract_without_fetch_gives_hint(tmp_path, monkeypatch):
    monkeypatch.setattr(tt, "MANIFEST", tmp_path / "manifest.json")
    with pytest.raises(SystemExit, match="Chạy trước: python -m drug_data.tt19_catalog fetch"):
        tt.main(["extract"])


@pytest.mark.skipif(not __import__("shutil").which("soffice"), reason="cần LibreOffice")
def test_doc_to_docx_conversion_keeps_table(tmp_path, appendix):
    """File gốc trên vbpl là .doc: chuyển .docx -> .doc rồi dùng convert_to_docx (LibreOffice ở máy không có Word)."""
    import subprocess
    src_docx = tmp_path / "goc.docx"
    build_docx(src_docx)
    subprocess.run(["soffice", "--headless", "--convert-to", "doc", "--outdir", str(tmp_path), str(src_docx)],
                   check=True, capture_output=True)
    doc = tmp_path / "goc.doc"
    assert doc.read_bytes()[:4] == b"\xd0\xcf\x11\xe0"            # định dạng Word 97-2003 (OLE2)
    out = tmp_path / "chuyen.docx"
    assert tt.detect_kind(doc) == "doc-ole"
    assert tt.convert_to_docx(doc, out) == "LibreOffice"
    again = tt.parse_appendix(out)
    assert [(r["stt"], r["dang_bao_che"], r["ham_luong"]) for r in again] == \
           [(r["stt"], r["dang_bao_che"], r["ham_luong"]) for r in appendix]


def test_merge_auto_adds_only_complete_candidates(appendix):
    fields, drugs = _drugs()
    cands = tt.build_candidates(drugs, appendix)
    eligible = [c for c in cands if tt.auto_eligible(c)]
    assert eligible
    rng = {**cands[0], "strength": "Từ 0,62 đến 0,74g/ml", "unit": "chai"}
    no_unit = {**cands[0], "unit": ""}
    assert not tt.auto_eligible(rng) and not tt.auto_eligible(no_unit)
    added, problems = tt.merge_candidates(fields, drugs, cands, auto=True)
    assert len(added) == len({(a["generic_name"], a["strength"], a["dosage_form"]) for a in added})   # không trùng
    assert all(a["unit"] and a["sale_price"] == "" for a in added)
    again, _ = tt.merge_candidates(fields, drugs + added, cands, auto=True)
    assert again == []                                                    # chạy lại không thêm gì


def test_missing_file_gives_hint_not_traceback(tmp_path):
    with pytest.raises(SystemExit, match="Chạy trước: python -m drug_data.tt19_catalog fetch"):
        tt.read_csv(tmp_path / "tt19_2018_phu_luc_1.csv")
