// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho các bảng danh mục dùng chung của backend.
// Mỗi danh mục là 1 danh sách bản ghi { id, code, name, active, updatedAt, updatedBy, ...trường riêng }.
// Không XOÁ bản ghi — chỉ "ngừng sử dụng" (active = false), vì hồ sơ / hoá đơn cũ vẫn tham chiếu tới mã đó.
// Danh mục Thuốc & vật tư và Nhà cung cấp nằm ở inventoryStore (dùng chung với kho / công nợ).
import { useSyncExternalStore } from 'react'
import { logEvent } from './activityStore'

const KEY = 'medassist_catalogs_v1'
const T0 = '2026-07-01T08:00:00.000Z'
const T1 = '2026-09-15T08:00:00.000Z'

const rows = (list, extra = {}) => list.map((r) => ({ active: true, updatedAt: T0, updatedBy: 'Trần Thị Lan', ...extra, ...r }))

// ---------- Danh mục chung (nhóm giá trị dùng trong hồ sơ bệnh nhân) ----------
const GENERAL = rows([
  ...[['M', 'Nam'], ['F', 'Nữ'], ['O', 'Khác']].map(([code, name]) => ({ group: 'gender', code: 'GT-' + code, name })),
  ...['Kinh', 'Tày', 'Thái', 'Mường', 'Khmer', 'Hoa', 'Nùng', "H'Mông", 'Dao', 'Gia Rai', 'Ê Đê', 'Ba Na', 'Chăm', 'Cơ Tu', 'Xơ Đăng'].map((name, i) => ({
    group: 'ethnicity',
    code: 'DT-' + String(i + 1).padStart(2, '0'),
    name
  })),
  ...['Học sinh / sinh viên', 'Cán bộ, công chức', 'Công nhân', 'Nông dân', 'Kinh doanh', 'Hưu trí', 'Nội trợ', 'Trẻ em dưới 6 tuổi', 'Khác'].map((name, i) => ({
    group: 'occupation',
    code: 'NN-' + String(i + 1).padStart(2, '0'),
    name
  })),
  ...['Bố', 'Mẹ', 'Vợ / chồng', 'Con', 'Anh / chị / em', 'Người giám hộ'].map((name, i) => ({ group: 'relationship', code: 'QH-' + String(i + 1).padStart(2, '0'), name })),
  ...['A', 'B', 'AB', 'O'].map((name) => ({ group: 'blood', code: 'NM-' + name, name }))
])

// ---------- Địa chỉ: 34 đơn vị hành chính cấp tỉnh sau sắp xếp từ 01/07/2025 ----------
// Nguồn: Nghị quyết 202/2025/QH15 về sắp xếp đơn vị hành chính cấp tỉnh. Mã ở đây là mã nội bộ của
// phòng khám; mã chính thức và danh sách xã / phường cần NHẬP TỪ FILE do cơ quan có thẩm quyền ban hành.
const PROVINCES = [
  ['Hà Nội', 'city', ''],
  ['Huế', 'city', ''],
  ['Hải Phòng', 'city', 'Hải Phòng, Hải Dương'],
  ['Đà Nẵng', 'city', 'Đà Nẵng, Quảng Nam'],
  ['TP. Hồ Chí Minh', 'city', 'TP. Hồ Chí Minh, Bình Dương, Bà Rịa – Vũng Tàu'],
  ['Cần Thơ', 'city', 'Cần Thơ, Sóc Trăng, Hậu Giang'],
  ['Cao Bằng', 'province', ''],
  ['Điện Biên', 'province', ''],
  ['Lai Châu', 'province', ''],
  ['Sơn La', 'province', ''],
  ['Lạng Sơn', 'province', ''],
  ['Quảng Ninh', 'province', ''],
  ['Thanh Hóa', 'province', ''],
  ['Nghệ An', 'province', ''],
  ['Hà Tĩnh', 'province', ''],
  ['Tuyên Quang', 'province', 'Tuyên Quang, Hà Giang'],
  ['Lào Cai', 'province', 'Lào Cai, Yên Bái'],
  ['Thái Nguyên', 'province', 'Thái Nguyên, Bắc Kạn'],
  ['Phú Thọ', 'province', 'Phú Thọ, Vĩnh Phúc, Hòa Bình'],
  ['Bắc Ninh', 'province', 'Bắc Ninh, Bắc Giang'],
  ['Hưng Yên', 'province', 'Hưng Yên, Thái Bình'],
  ['Ninh Bình', 'province', 'Ninh Bình, Hà Nam, Nam Định'],
  ['Quảng Trị', 'province', 'Quảng Trị, Quảng Bình'],
  ['Quảng Ngãi', 'province', 'Quảng Ngãi, Kon Tum'],
  ['Gia Lai', 'province', 'Gia Lai, Bình Định'],
  ['Khánh Hòa', 'province', 'Khánh Hòa, Ninh Thuận'],
  ['Lâm Đồng', 'province', 'Lâm Đồng, Đắk Nông, Bình Thuận'],
  ['Đắk Lắk', 'province', 'Đắk Lắk, Phú Yên'],
  ['Đồng Nai', 'province', 'Đồng Nai, Bình Phước'],
  ['Tây Ninh', 'province', 'Tây Ninh, Long An'],
  ['Vĩnh Long', 'province', 'Vĩnh Long, Bến Tre, Trà Vinh'],
  ['Đồng Tháp', 'province', 'Đồng Tháp, Tiền Giang'],
  ['Cà Mau', 'province', 'Cà Mau, Bạc Liêu'],
  ['An Giang', 'province', 'An Giang, Kiên Giang']
]
const ADDRESS = rows(
  PROVINCES.map(([name, type, mergedFrom], i) => ({ code: 'T' + String(i + 1).padStart(2, '0'), name, level: 'province', type, mergedFrom, parent: '', effectiveFrom: '2025-07-01' })),
  { updatedAt: T1 }
)

// ---------- Khoa phòng ----------
const DEPARTMENTS = rows([
  { code: 'K01', name: 'Nội tổng quát', room: 'P.101', doctors: ['Trần Minh'] },
  { code: 'K02', name: 'Nhi', room: 'P.102', doctors: ['Nguyễn Văn Dũng'] },
  { code: 'K03', name: 'Tai Mũi Họng', room: 'P.103', doctors: [] }
])

// ---------- Bệnh (ICD-10) — bản mẫu các mã hay gặp ở phòng khám ngoại trú ----------
const ICD = rows(
  [
    ['A09', 'Tiêu chảy và viêm dạ dày ruột có nguồn gốc nhiễm khuẩn', 'Diarrhoea and gastroenteritis of presumed infectious origin', 'I'],
    ['A90', 'Sốt Dengue', 'Dengue fever', 'I'],
    ['A91', 'Sốt xuất huyết Dengue', 'Dengue haemorrhagic fever', 'I'],
    ['B01.9', 'Thủy đậu không biến chứng', 'Varicella without complication', 'I'],
    ['B34.9', 'Nhiễm virus, không xác định', 'Viral infection, unspecified', 'I'],
    ['E11.9', 'Đái tháo đường type 2 không biến chứng', 'Type 2 diabetes mellitus without complications', 'IV'],
    ['E78.5', 'Tăng lipid máu, không xác định', 'Hyperlipidaemia, unspecified', 'IV'],
    ['G43.9', 'Migraine, không xác định', 'Migraine, unspecified', 'VI'],
    ['G44.2', 'Đau đầu do căng thẳng', 'Tension-type headache', 'VI'],
    ['G03.9', 'Viêm màng não, không xác định', 'Meningitis, unspecified', 'VI'],
    ['H10.9', 'Viêm kết mạc, không xác định', 'Conjunctivitis, unspecified', 'VII'],
    ['H66.9', 'Viêm tai giữa, không xác định', 'Otitis media, unspecified', 'VIII'],
    ['I10', 'Tăng huyết áp vô căn (nguyên phát)', 'Essential (primary) hypertension', 'IX'],
    ['I24.9', 'Bệnh tim thiếu máu cục bộ cấp, không xác định', 'Acute ischaemic heart disease, unspecified', 'IX'],
    ['J00', 'Viêm mũi họng cấp (cảm thường)', 'Acute nasopharyngitis [common cold]', 'X'],
    ['J01.9', 'Viêm xoang cấp, không xác định', 'Acute sinusitis, unspecified', 'X'],
    ['J02.9', 'Viêm họng cấp, không xác định', 'Acute pharyngitis, unspecified', 'X'],
    ['J03.9', 'Viêm amidan cấp, không xác định', 'Acute tonsillitis, unspecified', 'X'],
    ['J04.0', 'Viêm thanh quản cấp', 'Acute laryngitis', 'X'],
    ['J06.9', 'Nhiễm trùng hô hấp trên cấp, không xác định', 'Acute upper respiratory infection, unspecified', 'X'],
    ['J18.9', 'Viêm phổi, không xác định', 'Pneumonia, unspecified', 'X'],
    ['J20.9', 'Viêm phế quản cấp, không xác định', 'Acute bronchitis, unspecified', 'X'],
    ['J30.4', 'Viêm mũi dị ứng, không xác định', 'Allergic rhinitis, unspecified', 'X'],
    ['J42', 'Viêm phế quản mạn, không xác định', 'Unspecified chronic bronchitis', 'X'],
    ['J45.9', 'Hen, không xác định', 'Asthma, unspecified', 'X'],
    ['K21.9', 'Trào ngược dạ dày – thực quản không viêm thực quản', 'Gastro-oesophageal reflux disease without oesophagitis', 'XI'],
    ['K29.7', 'Viêm dạ dày, không xác định', 'Gastritis, unspecified', 'XI'],
    ['K30', 'Khó tiêu chức năng', 'Functional dyspepsia', 'XI'],
    ['K59.0', 'Táo bón', 'Constipation', 'XI'],
    ['L23.9', 'Viêm da tiếp xúc dị ứng, không rõ nguyên nhân', 'Allergic contact dermatitis, unspecified cause', 'XII'],
    ['L50.9', 'Mày đay, không xác định', 'Urticaria, unspecified', 'XII'],
    ['M54.5', 'Đau thắt lưng', 'Low back pain', 'XIII'],
    ['M79.1', 'Đau cơ', 'Myalgia', 'XIII'],
    ['N39.0', 'Nhiễm khuẩn đường tiết niệu, vị trí không xác định', 'Urinary tract infection, site not specified', 'XIV'],
    ['R05', 'Ho', 'Cough', 'XVIII'],
    ['R06.0', 'Khó thở', 'Dyspnoea', 'XVIII'],
    ['R10.4', 'Đau bụng khác và không xác định', 'Other and unspecified abdominal pain', 'XVIII'],
    ['R50.9', 'Sốt, không xác định', 'Fever, unspecified', 'XVIII'],
    ['R51', 'Đau đầu', 'Headache', 'XVIII'],
    ['T14.1', 'Vết thương hở vùng cơ thể không xác định', 'Open wound of unspecified body region', 'XIX'],
    ['Z00.0', 'Khám sức khỏe tổng quát', 'General medical examination', 'XXI'],
    ['Z23', 'Cần tiêm chủng phòng một bệnh nhiễm khuẩn đơn thuần', 'Need for immunization against single bacterial diseases', 'XXI']
  ].map(([code, name, nameEn, chapter]) => ({ code, name, nameEn, chapter, custom: false }))
)

// ---------- Dịch vụ / thủ thuật — có lịch sử giá ----------
const svc = (code, name, group, price, history = []) => ({ code, name, group, unit: 'lần', price, priceHistory: [...history, { price, from: '2026-01-01', by: 'Trần Thị Lan' }] })
const SERVICES = rows([
  svc('DV01', 'Khám bệnh', 'consult', 80000, [{ price: 70000, from: '2025-01-01', by: 'Trần Thị Lan' }]),
  svc('DV02', 'Khám chuyên khoa Nhi', 'consult', 100000),
  svc('DV03', 'Thay băng vết thương', 'procedure', 50000),
  svc('DV04', 'Cắt chỉ', 'procedure', 40000),
  svc('DV05', 'Rửa vết thương', 'procedure', 60000),
  svc('DV06', 'Chích rạch áp xe', 'procedure', 200000, [{ price: 180000, from: '2025-01-01', by: 'Trần Thị Lan' }]),
  svc('DV07', 'Khâu vết thương nhỏ', 'procedure', 150000),
  svc('DV08', 'Tiêm bắp', 'injection', 20000),
  svc('DV09', 'Tiêm tĩnh mạch', 'injection', 30000),
  svc('DV10', 'Truyền dịch', 'injection', 100000),
  svc('DV11', 'Khí dung', 'procedure', 50000),
  svc('DV12', 'Đo điện tim (ECG)', 'diagnostic', 80000),
  svc('DV13', 'Siêu âm ổ bụng', 'diagnostic', 150000),
  svc('DV14', 'Đo đường huyết mao mạch', 'diagnostic', 30000)
])

// ---------- Gói khám — liệt kê dịch vụ bên trong (nối với danh mục dịch vụ / xét nghiệm) ----------
const PACKAGES = rows([
  { code: 'GK01', name: 'Khám tổng quát cơ bản', price: 350000, items: [{ ref: 'service:DV01', qty: 1 }, { ref: 'lab:XN01', qty: 1 }, { ref: 'lab:XN05', qty: 1 }, { ref: 'service:DV12', qty: 1 }] },
  { code: 'GK02', name: 'Khám sức khỏe trẻ em', price: 220000, items: [{ ref: 'service:DV02', qty: 1 }, { ref: 'lab:XN01', qty: 1 }, { ref: 'lab:XN14', qty: 1 }] },
  { code: 'GK03', name: 'Theo dõi tiểu đường định kỳ', price: 300000, items: [{ ref: 'service:DV01', qty: 1 }, { ref: 'lab:XN05', qty: 1 }, { ref: 'lab:XN11', qty: 1 }, { ref: 'lab:XN07', qty: 1 }] }
])

// ---------- Xét nghiệm / cận lâm sàng — đơn vị và khoảng tham chiếu ----------
const lab = (code, name, group, unit, low, high, refText, sample, price) => ({ code, name, group, unit, low, high, refText, sample, price })
const LABS = rows([
  lab('XN01', 'Công thức máu (CBC) — Bạch cầu (WBC)', 'hematology', 'G/L', 4, 10, '', 'blood', 90000),
  lab('XN02', 'Hồng cầu (RBC)', 'hematology', 'T/L', 3.8, 5.5, '', 'blood', 0),
  lab('XN03', 'Huyết sắc tố (HGB)', 'hematology', 'g/L', 120, 170, 'Nữ 120–155, nam 130–170', 'blood', 0),
  lab('XN04', 'Tiểu cầu (PLT)', 'hematology', 'G/L', 150, 400, '', 'blood', 0),
  lab('XN05', 'Glucose máu lúc đói', 'biochemistry', 'mmol/L', 3.9, 6.4, '', 'blood', 30000),
  lab('XN06', 'Ure', 'biochemistry', 'mmol/L', 2.5, 7.5, '', 'blood', 30000),
  lab('XN07', 'Creatinin', 'biochemistry', 'µmol/L', 62, 120, 'Nữ 53–100, nam 62–120', 'blood', 30000),
  lab('XN08', 'AST (GOT)', 'biochemistry', 'U/L', null, 40, '≤ 40', 'blood', 30000),
  lab('XN09', 'ALT (GPT)', 'biochemistry', 'U/L', null, 40, '≤ 40', 'blood', 30000),
  lab('XN10', 'CRP', 'immunology', 'mg/L', null, 5, '< 5', 'blood', 80000),
  lab('XN11', 'HbA1c', 'biochemistry', '%', 4, 6, '', 'blood', 120000),
  lab('XN12', 'Cholesterol toàn phần', 'biochemistry', 'mmol/L', null, 5.2, '< 5.2', 'blood', 40000),
  lab('XN13', 'Tổng phân tích nước tiểu', 'urine', '', null, null, 'Âm tính', 'urine', 50000),
  lab('XN14', 'X-quang ngực thẳng', 'imaging', '', null, null, 'Mô tả', 'none', 120000)
])

// ---------- Đơn vị tính (mã trùng với đơn vị đang dùng ở Kho) ----------
const UNITS = rows(
  [
    ['tablet', 'Viên', 'drug'],
    ['capsule', 'Viên nang', 'drug'],
    ['sachet', 'Gói', 'drug'],
    ['tube', 'Tuýp', 'drug'],
    ['bottle', 'Chai', 'drug'],
    ['ampoule', 'Ống', 'drug'],
    ['vial', 'Lọ', 'drug'],
    ['box', 'Hộp', 'drug'],
    ['pack', 'Túi', 'drug'],
    ['ml', 'ml', 'measure'],
    ['mg', 'mg', 'measure'],
    ['g', 'g', 'measure'],
    ['time', 'Lần', 'service']
  ].map(([code, name, kind]) => ({ code, name, kind }))
)

// ---------- Đường dùng thuốc ----------
const ROUTES = rows(
  [
    ['PO', 'Uống'],
    ['SL', 'Ngậm dưới lưỡi'],
    ['IV', 'Tiêm tĩnh mạch'],
    ['IM', 'Tiêm bắp'],
    ['SC', 'Tiêm dưới da'],
    ['TOP', 'Bôi ngoài da'],
    ['INH', 'Hít / khí dung'],
    ['NAS', 'Xịt mũi'],
    ['OPH', 'Nhỏ mắt'],
    ['OT', 'Nhỏ tai'],
    ['PR', 'Đặt hậu môn']
  ].map(([code, name]) => ({ code, name }))
)

// ---------- Mẫu đơn thuốc (thuốc lấy từ danh mục thuốc của Kho) & lời dặn ----------
const RXTEMPLATES = rows([
  {
    code: 'MD01',
    name: 'Viêm amidan cấp — người lớn',
    icd: 'J03.9',
    items: [
      { drugId: 'D02', qty: 20, route: 'PO', usage: 'Ngày 2 lần, mỗi lần 1 viên sau ăn' },
      { drugId: 'D01', qty: 10, route: 'PO', usage: 'Uống 1 viên khi sốt > 38,5°C, cách nhau ít nhất 4 giờ' }
    ],
    advice: ['LD01', 'LD04']
  },
  {
    code: 'MD02',
    name: 'Viêm họng cấp do virus',
    icd: 'J02.9',
    items: [
      { drugId: 'D01', qty: 10, route: 'PO', usage: 'Uống 1 viên khi sốt > 38,5°C' },
      { drugId: 'D09', qty: 7, route: 'PO', usage: 'Ngày 1 viên buổi tối' }
    ],
    advice: ['LD01', 'LD02']
  },
  {
    code: 'MD03',
    name: 'Viêm dạ dày',
    icd: 'K29.7',
    items: [{ drugId: 'D06', qty: 14, route: 'PO', usage: 'Ngày 1 viên trước ăn sáng 30 phút' }],
    advice: ['LD06', 'LD02']
  }
])
const ADVICE = rows(
  [
    ['LD01', 'Uống nhiều nước, nghỉ ngơi đầy đủ', 'general'],
    ['LD02', 'Tái khám sau 3 ngày nếu không đỡ', 'followup'],
    ['LD03', 'Uống thuốc sau khi ăn', 'medication'],
    ['LD04', 'Dùng đủ liệu trình kháng sinh, không tự ý ngừng thuốc', 'medication'],
    ['LD05', 'Đến ngay cơ sở y tế nếu sốt cao không hạ, khó thở, li bì', 'warning'],
    ['LD06', 'Kiêng đồ cay nóng, rượu bia, cà phê', 'general']
  ].map(([code, name, kind]) => ({ code, name, kind }))
)

const SEED = {
  general: GENERAL,
  address: ADDRESS,
  departments: DEPARTMENTS,
  icd: ICD,
  services: SERVICES,
  packages: PACKAGES,
  labs: LABS,
  units: UNITS,
  routes: ROUTES,
  rxtemplates: RXTEMPLATES,
  advice: ADVICE
}
function seed() {
  const out = {}
  for (const [k, list] of Object.entries(SEED)) out[k] = list.map((r, i) => ({ id: k + '-' + (i + 1), ...r }))
  return out
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
let state = { ...seed(), ...(read() ?? {}) }
const listeners = new Set()
function commit(next) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getCatalogs = () => state
export function useCatalogs() {
  return useSyncExternalStore(subscribe, getCatalogs)
}

const nextId = (key) => key + '-' + (Math.max(0, ...state[key].map((r) => +r.id.split('-').pop() || 0)) + 1)
const today = () => new Date().toISOString().slice(0, 10)

// title = tên danh mục (tiếng Anh, được dịch ở nhật ký) — chỉ dùng để ghi nhật ký.
export function upsertRow(key, data, user, title) {
  const now = new Date().toISOString()
  const old = data.id && state[key].find((r) => r.id === data.id)
  let row = { ...(old ?? { active: true }), ...data, updatedAt: now, updatedBy: user.name }
  if (!old) row.id = nextId(key)
  // Dịch vụ: đổi đơn giá → lưu lịch sử giá (hoá đơn cũ vẫn giữ đơn giá tại thời điểm lập).
  if (key === 'services' && (!old || old.price !== row.price)) {
    row.priceHistory = [...(old?.priceHistory ?? []), { price: row.price, from: data.priceFrom || today(), by: user.name }]
  }
  delete row.priceFrom
  const list = old ? state[key].map((r) => (r.id === row.id ? row : r)) : [...state[key], row]
  commit({ ...state, [key]: list })
  const priceChanged = key === 'services' && old && old.price !== row.price
  logEvent(user, old ? 'catalog.update' : 'catalog.create', {
    target: { kind: 'catalog', id: row.code, label: row.name, page: 'cat-' + key },
    params: { catalog: title, code: row.code, name: row.name },
    before: priceChanged ? old.price : null,
    after: priceChanged ? row.price : null
  })
  return row.id
}

export function setRowActive(key, id, active, user, title, note) {
  const r = state[key].find((x) => x.id === id)
  commit({ ...state, [key]: state[key].map((x) => (x.id === id ? { ...x, active, updatedAt: new Date().toISOString(), updatedBy: user.name } : x)) })
  logEvent(user, active ? 'catalog.reactivate' : 'catalog.discontinue', {
    target: { kind: 'catalog', id: r.code, label: r.name, page: 'cat-' + key },
    params: { catalog: title, code: r.code, name: r.name, note },
    before: !active,
    after: active
  })
}

// Nhập từ file: khớp theo MÃ — mã đã có thì cập nhật, mã mới thì thêm.
export function importRows(key, list, user, title, fileName) {
  const now = new Date().toISOString()
  let rows = [...state[key]]
  let added = 0
  let updated = 0
  for (const data of list) {
    const i = rows.findIndex((r) => r.code.toLowerCase() === String(data.code).toLowerCase())
    if (i >= 0) {
      rows[i] = { ...rows[i], ...data, updatedAt: now, updatedBy: user.name }
      updated++
    } else {
      rows.push({ active: true, ...data, id: key + '-' + (Math.max(0, ...rows.map((r) => +r.id.split('-').pop() || 0)) + 1), updatedAt: now, updatedBy: user.name })
      added++
    }
  }
  commit({ ...state, [key]: rows })
  logEvent(user, 'catalog.import', { target: { kind: 'catalog', id: key, label: title, page: 'cat-' + key }, params: { catalog: title, file: fileName, added, updated } })
  return { added, updated }
}
