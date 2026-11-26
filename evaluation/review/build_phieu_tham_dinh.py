"""Dựng phiếu trắng từ gốc repo bằng venv/Scripts/python.exe -B."""
import csv
from collections import Counter
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from verify_expert_questions import COMMON, HEADERS, HERE, ROOT, front, rows

KB = ROOT / "knowledge"
OUTPUT = HERE / "phieu_tham_dinh_csv"
COLD = "cam_lanh_thong_thuong"
ENT_J00 = "hong_thanh_quan_viem_mui_hong_cap_tinh"
UNKNOWN = "CHƯA XÁC MINH"
GROUPS = {"musculoskeletal": "Cơ xương khớp", "ent": "Tai mũi họng",
          "respiratory": "Hô hấp", "infectious": "Truyền nhiễm"}
POLARITY = {"SUPPORTS": "Ủng hộ", "CONTRADICTS": "Loại trừ"}
YN = ("Có", "Không")
SLUG = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*")


def check(ok, message):
    if not ok:
        raise ValueError(message)


def scope():
    return sorted(p for p in (KB / "conditions").glob("*/*.md")
                  if p.parent.name == "musculoskeletal" or p.stem in COMMON | {COLD})


def flagged(conditions):
    release = (KB / "_release.md").read_text(encoding="utf-8-sig")
    line = next(s for s in release.splitlines() if "ICD CẦN BÁC SĨ XÁC NHẬN" in s)
    result = dict(re.findall(r"`(\w+)`: [A-Z]\d{2}\.\d+ → ([A-Z]\d{2}\.\d+)", line))
    check(set(result.values()) == {"L40.5", "M09.0"}, line)
    check("giữ song song hai hồ sơ J00" in release, "Thiếu căn cứ cho J00")
    shared = {c for c, d in conditions.items() if d["icd10_code"] == "J00"}
    check(shared == {COLD, "hong_thanh_quan_viem_mui_hong_cap_tinh"}, shared)
    for c, icd in result.items():
        check(conditions[c]["icd10_code"] == icd, c)
    return set(result) | shared


def locator(excerpt, code, conditions):
    # Số quyết định đã có ở cột bên cạnh.
    text = excerpt["source_locator"].removesuffix(f" ({excerpt['source_edition']})")
    if code == ENT_J00:
        # Hai hồ sơ dùng chung chương. Trang cụ thể là điểm tra chung,
        # không phải chứng cứ riêng cho từng liên kết của hồ sơ TMH.
        shared, = (e for e in conditions[COLD]["excerpts"] if e["source_key"] == excerpt["source_key"])
        text += ". Tra cùng chương: " + shared["source_locator"]
    return text


def read_questions(conditions, sources, catalog):
    result, seen = [], set()
    for filename, expected in [("expert_questions_nhom_trong_tam.csv", (6, 2, 110)),
                               ("expert_questions_kb_2026_12.csv", (1, 1, 2))]:
        headers, questions = rows(HERE / filename)
        check(headers == HEADERS, filename)
        counts = Counter()
        for q in questions:
            group, code, disease, codes, names, weights, refs, question, _, answer = (
                q[k] for k in HEADERS)
            g = group[0]
            d = conditions[code]
            identity = (g, code, codes)
            check(identity not in seen and not answer and d["name_vi"] == disease, identity)
            seen.add(identity)
            counts[g] += 1
            by_code = {r["symptom_code"]: r for r in d["relations"]}
            keys = codes.split(";") if codes else []
            if g == "a":
                check(set(keys) == set(by_code) and not any(r["is_key"] for r in by_code.values()), code)
            if g == "c":
                check(len(keys) == 1, identity)
            if keys:
                check([catalog[k]["symptom_name"] for k in keys] == names.split(" | "), identity)
                check([str(by_code[k]["weight"]) for k in keys] == weights.split(";"), identity)
                check(all(by_code[k]["polarity"] == "SUPPORTS" for k in keys), identity)
            editions = set(re.findall(r"knowledge/sources/(\w+)\.md", refs))
            check(editions and all(by_code[k]["source_key"] in editions for k in keys), identity)
            references = []
            for source in sorted(editions):
                matches = [e for e in d["excerpts"] if e["source_key"] == source and
                           (e["excerpt_key"] in refs or (code == COLD and g == "b"))]
                check(matches, (identity, source))
                references.extend(f"{sources[source]['edition']}, {locator(e, code, conditions)}" for e in matches)
            if g == "b":
                references.append(f"Quy ước mã hóa tại Việt Nam • {UNKNOWN}")
            if g == "a":
                context = "\n".join(f"{i}. {catalog[k].get('short_name') or catalog[k]['symptom_name']} ({k})"
                                    for i, k in enumerate(keys, 1))
            elif g == "b" and code == COLD:
                context = (f"J00 — {disease} (Hô hấp) và {conditions[ENT_J00]['name_vi']} (Tai mũi họng). "
                           "Có thể trả lời: ĐỒNG Ý DÙNG CHUNG J00 / NÊN GỘP HỒ SƠ / "
                           "ĐỔI MÃ HOẶC TÁCH RANH GIỚI KHÁC / CHƯA ĐỦ DỮ KIỆN. Xin ghi rõ quy ước tại cơ sở.")
            elif g == "b":
                context = (f"Hồ sơ hiện ghi một mã ({d['icd10_code']}). Xin xác nhận mã này có thể "
                           "ghi riêng hay cần mã kèm tại cơ sở.")
            elif code == COLD and keys == ["fever_low_grade"]:
                check("fever_high" not in by_code, code)
                context = (f"{codes}. Hồ sơ cảm lạnh hiện để sốt cao ngoài danh sách để đối chiếu với "
                           f"{conditions['cum_mua']['name_vi']} hoặc {conditions[ENT_J00]['name_vi']}.")
            else:
                context = codes
            result.append(({"a": 1, "b": 2, "c": 3}[g], disease, context,
                           question, "\n".join(references), None))
        check(tuple(counts[g] for g in "abc") == expected, (filename, counts))
    return sorted(result, key=lambda row: row[0])


def build():
    paths = scope()
    conditions = {p.stem: front(p) for p in paths}
    check(len(paths) == len(conditions) == 39 and COMMON | {COLD} <= conditions.keys(), "Phạm vi")
    catalog = {s["symptom_code"]: s for s in front(KB / "symptoms/symptom_catalog.md")["symptoms"]}
    sources = {s["source_key"]: s for s in map(front, (KB / "sources").glob("*.md"))}
    flags = flagged(conditions)
    diseases, relations, used = [], [], set()
    for code, d in sorted(conditions.items(), key=lambda pair: pair[1]["name_vi"].casefold()):
        check(code == d["condition_code"] and SLUG.fullmatch(code), code)
        excerpts = d["excerpts"]
        keys = sorted({e["source_key"] for e in excerpts})
        used.update(keys)
        for e in excerpts:
            check(e["source_edition"] == sources[e["source_key"]]["edition"], e)
        rr = d["relations"]
        diseases.append((len(diseases) + 1, GROUPS[d["disease_group"]], code, d["name_vi"],
                         d["name_en"], d["icd10_code"], YN[code not in flags],
                         "\n".join(f"{sources[k]['title']} ({sources[k]['edition']})" for k in keys),
                         len(rr), sum(r["is_key"] for r in rr), None, None, None))
        for r in sorted(rr, key=lambda item: -item["weight"]):
            s = r["symptom_code"]
            key = r["source_key"]
            check(SLUG.fullmatch(s) and r["source_edition"] == sources[key]["edition"], (code, s))
            matches = [e for e in excerpts if e["source_key"] == key]
            if len(matches) > 1:
                # Hai hồ sơ cột sống có mục riêng ghi rõ dấu hiệu phản bác.
                check(any(e["excerpt_key"].endswith("_phan_bac") for e in matches), code)
                matches = [e for e in matches if e["excerpt_key"].endswith("_phan_bac")
                           == (r["polarity"] == "CONTRADICTS")]
            check(len(matches) == 1 and matches[0]["source_locator"], (code, s, key))
            relations.append((d["name_vi"], s, catalog[s]["symptom_name"], catalog[s].get("short_name"),
                              POLARITY[r["polarity"]], r["weight"], YN[not r["is_key"]],
                              sources[key]["edition"], locator(matches[0], code, conditions), None, None, None, None))
    questions = read_questions(conditions, sources, catalog)
    n_msk = sum(p.parent.name == "musculoskeletal" for p in paths)
    guide = [
        ('Mục đích', 'Xin bác sĩ nhận xét tên bệnh, mã ICD-10 và các triệu chứng liên quan.'),
        ('Phiên bản tri thức', front(KB / "_release.md")["label"]),
        ('Phạm vi', f'{len(paths)} hồ sơ gồm {n_msk} hồ sơ cơ xương khớp và {len(paths) - n_msk} hồ sơ bệnh phổ biến, kể cả cảm lạnh thông thường.'),
        ('Bắt đầu', f'Ưu tiên điền tệp 04_cau_hoi_uu_tien.csv ({len(questions)} câu). Tệp 02 và 03 dùng để tra cứu hoặc nhận xét thêm nếu có thời gian.'),
        ('Cách điền', 'Nhập trực tiếp vào các cột nhận xét cuối mỗi dòng. Có thể để trống phần chưa rà. Khi lưu, chọn CSV UTF-8.'),
        ('Trọng số đề xuất', '0.9 — then chốt\n0.6 — thường gặp\n0.3 — có thể gặp\nCác mức này đang chờ thẩm định.'),
        ('Thuật ngữ trong câu hỏi', 'SUPPORTS nghĩa là “Ủng hộ”. Catalog là danh mục triệu chứng của hệ thống. Cột Then chốt ghi nhận lựa chọn hiện tại.'),
        ('Phạm vi sử dụng', 'Tri thức chưa rà lâm sàng. Hệ thống chỉ hỗ trợ bác sĩ, không thay thế quyết định lâm sàng. Phiếu không chứa dữ liệu bệnh nhân.'),
        ('Tên bệnh và ICD', 'Trong tệp 02, điền Đồng ý / Cần sửa / Loại cho tên bệnh và Đồng ý / Cần sửa cho ICD. Có thể ghi căn cứ vào cột Ghi chú.'),
        ('Quan hệ và trọng số', 'Trong tệp 03, điền Đồng ý / Nên tăng / Nên giảm / Nên bỏ. Nếu đề nghị sửa, ghi trọng số 0.9 / 0.6 / 0.3 và Có / Không cho cột Then chốt đề nghị.'),
        ('Trả lời câu hỏi', 'Trong tệp 04, ghi lựa chọn và căn cứ vào cột Trả lời bác sĩ. Với câu chọn then chốt, có thể ghi số thứ tự của ứng viên ngay trên dòng đó hoặc ghi mã triệu chứng.'),
    ]
    references = [(sources[k]["edition"], sources[k]["title"], str(sources[k]["publication_date"])[:4], sources[k]["url"])
                  for k in sorted(used)]
    return {
        "01_huong_dan.csv": (
            ('Phiếu thẩm định', 'Hướng dẫn dành cho bác sĩ'),
            guide,
        ),
        "02_danh_sach_benh.csv": (
            ('STT', 'Nhóm', 'Mã bệnh (condition_code)', 'Tên bệnh tiếng Việt', 'Tên bệnh tiếng Anh', 'ICD-10', 'ICD cần xác nhận', 'Nguồn Bộ Y tế', 'Số triệu chứng', 'Số then chốt', 'Tên bệnh phù hợp?', 'ICD phù hợp?', 'Ghi chú'),
            diseases,
        ),
        "03_benh_trieu_chung.csv": (
            ('Bệnh', 'Mã triệu chứng', 'Tên triệu chứng', 'Cách người bệnh hay nói', 'Quan hệ', 'Trọng số hiện tại', 'Then chốt', 'Nguồn Bộ Y tế', 'Mục trích dẫn', 'Mức phù hợp', 'Trọng số đề nghị', 'Then chốt đề nghị', 'Ghi chú'),
            relations,
        ),
        "04_cau_hoi_uu_tien.csv": (
            ('Ưu tiên', 'Bệnh', 'Mã hoặc danh sách ứng viên', 'Câu hỏi cho bác sĩ', 'Nguồn và mục trích dẫn', 'Trả lời bác sĩ'),
            questions,
        ),
        "05_nguon_tham_chieu.csv": (
            ('Số quyết định', 'Tên văn bản Bộ Y tế', 'Năm', 'URL'),
            references,
        ),
    }

# Các cột còn lại dành cho phản hồi của bác sĩ.
REQUIRED = {"01_huong_dan.csv": 2, "02_danh_sach_benh.csv": 10,
            "03_benh_trieu_chung.csv": 9, "04_cau_hoi_uu_tien.csv": 5,
            "05_nguon_tham_chieu.csv": 4}


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.reader(stream, strict=True))


def export():
    tables = build()
    profiles = [front(p) for p in scope()]
    relations = Counter((d["name_vi"], r["symptom_code"], str(r["weight"]), POLARITY[r["polarity"]])
                        for d in profiles for r in d["relations"])
    OUTPUT.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=HERE) as directory:
        stage = Path(directory)
        for name, (header, records) in tables.items():
            path = stage / name
            with path.open("w", encoding="utf-8-sig", newline="") as stream:
                writer = csv.writer(stream, quoting=csv.QUOTE_ALL, lineterminator="\n")
                writer.writerow(header)
                writer.writerows(records)
            saved = read_csv(path)
            check(saved[0] == list(header), name)
            check(saved[1:] == [["" if v is None else str(v) for v in row] for row in records], name)
            for row in saved[1:]:
                check(len(row) == len(header), name)
                for i in range(REQUIRED[name]):
                    if name == "03_benh_trieu_chung.csv" and i == 3:  # short_name tùy chọn
                        continue
                    check(bool(row[i].strip()), (name, i))
            if name == "03_benh_trieu_chung.csv":
                actual = Counter((r[0], r[1], r[5], r[4]) for r in saved[1:])
                check(actual == relations, "Quan hệ không khớp hồ sơ")
            if (OUTPUT / name).exists():
                old = read_csv(OUTPUT / name)
                legacy_sources = name == "05_nguon_tham_chieu.csv" and old and old[0] == saved[0][:-1]
                check(old and (old[0] == saved[0] or legacy_sources), f"{name}: tiêu đề đã thay đổi")
                check(all(len(r) == len(old[0]) and not any(r[REQUIRED[name]:]) for r in old[1:]),
                      f"{name}: hãy lưu riêng phiếu đã điền trước khi dựng lại.")
        check(len(tables["02_danh_sach_benh.csv"][1]) == 39, "Số bệnh")
        check(len(tables["04_cau_hoi_uu_tien.csv"][1]) == 122, "Số câu hỏi")
        for name in tables:
            target = OUTPUT / name
            candidate = stage / name
            if not target.exists() or target.read_bytes() != candidate.read_bytes():
                candidate.replace(target)
    for name, (_, records) in tables.items():
        print(f"PASS {name}: {len(records)}")


if __name__ == "__main__":
    export()
