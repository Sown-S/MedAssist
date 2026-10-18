# MedAssist — Ứng dụng desktop cho phòng khám ngoại trú

Hệ thống hỗ trợ quyết định lâm sàng (CDSS) cho phòng khám ngoại trú, chạy dạng **ứng dụng desktop Electron + React** (JavaScript, không TypeScript — theo Proposal §10). Nhóm: C1SE.28.

Bản hiện tại là **client hoàn chỉnh về giao diện và luồng nghiệp vụ**, dữ liệu chạy bằng **lớp giả lập (mock store) lưu trong `localStorage`**. Luồng nghiệp vụ đã **khớp backend v5** (Cấu trúc v5, Thông báo thành viên 10/10/2026): máy trạng thái lượt khám, trừ kho FEFO khi bác sĩ chốt đơn, hoá đơn pending tự tạo, cấp phát từng dòng, sinh hiệu 8 khoá, triệu chứng ba trạng thái. Mỗi store ghi rõ endpoint backend tương ứng để ghép FastAPI + PostgreSQL mà không phải viết lại trang.

Phạm vi theo **Proposal v2.0 §6.2**: đã bỏ sổ quỹ / chốt ca, nhà cung cấp & công nợ, kiểm kho / huỷ thuốc, hoá đơn bán lẻ, bàn giao bệnh nhân, giấy nghỉ ốm, tóm tắt bệnh án, ghi bổ sung, phân quyền chỉnh được, tab tri thức (RAG) và ma trận DDI.

> Tài liệu này dành cho người phát triển tiếp dự án: frontend, backend (FastAPI) và module AI.

---

## Mục lục

1. [Chạy dự án](#1-chạy-dự-án)
2. [Công nghệ & kiến trúc](#2-công-nghệ--kiến-trúc)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Vai trò, điều hướng & các màn hình](#4-vai-trò-điều-hướng--các-màn-hình)
5. [Luồng nghiệp vụ chính](#5-luồng-nghiệp-vụ-chính)
6. [Lớp dữ liệu (store giả lập)](#6-lớp-dữ-liệu-store-giả-lập)
7. [Đa ngôn ngữ (i18n)](#7-đa-ngôn-ngữ-i18n)
8. [Quy ước giao diện](#8-quy-ước-giao-diện)
9. [Phân quyền & nhật ký](#9-phân-quyền--nhật-ký)
10. [Điểm tích hợp Backend](#10-điểm-tích-hợp-backend)
11. [Điểm tích hợp module AI](#11-điểm-tích-hợp-module-ai)
12. [Lưu ý quan trọng & lỗi hay gặp](#12-lưu-ý-quan-trọng--lỗi-hay-gặp)
13. [Việc còn lại / hướng phát triển](#13-việc-còn-lại--hướng-phát-triển)
14. [Quy trình làm việc theo vai trò](#14-quy-trình-làm-việc-theo-vai-trò)

---

## 1. Chạy dự án

Yêu cầu: **Node.js 18+** (đã thử với Node 24), Windows / macOS / Linux. Electron cần mở cửa sổ thật nên phải chạy trên máy, không chạy trong trình duyệt.

```bash
cd medassist-app
npm install        # lần đầu hơi lâu vì Electron khá nặng
npm run dev        # chế độ phát triển, có hot reload
```

| Lệnh                                    | Tác dụng                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`                           | Chạy dev: Vite dev server + cửa sổ Electron, sửa code thấy ngay                    |
| `npm run build`                         | Build ra `out/` (main, preload, renderer)                                          |
| `npm start`                             | Chạy thử bản đã build trong `out/`                                                 |
| `npm run build:win` / `:mac` / `:linux` | Build + đóng gói bằng electron-builder (`appId`, `productName` ở mục `build` của `package.json`; chép `certs/*.crt` vào bản cài; còn thiếu `icon`) |

**Tài khoản mặc định:** `admin` / `Admin@123` (Quản trị viên). Lần đăng nhập đầu **bắt buộc đổi mật khẩu**. Tài khoản Bác sĩ và Lễ tân do Quản trị viên tạo ở **Quản trị › Tài khoản nhân viên**; tài khoản mới cũng phải tự đặt mật khẩu ở lần đăng nhập đầu. Ngôn ngữ (English / Tiếng Việt) đổi được ở màn đăng nhập và trên thanh trên cùng.

**Biến môi trường** (copy `.env.example` → `.env`):

| Biến                | Ý nghĩa                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | Địa chỉ FastAPI **mặc định** khi máy chưa đặt. Mỗi máy đổi được lúc chạy: nút **Máy chủ** ở màn đăng nhập hoặc Cài đặt › Kết nối (lưu ở `userData/config.json`). Chỉ dùng khi `USE_MOCK = false` |
| `VITE_DEV_TOOLS`    | `true` → hiện công cụ cho dev (VD giả lập mất mạng ở Tiếp đón). Để trống khi dùng thật |

**Thử trạng thái lỗi của AI:** DevTools → Console → `localStorage.setItem('medassist_mock_llm_down', '1')` → trích xuất triệu chứng báo lỗi, thẻ gợi ý chuyển sang *Rule-only*. Xoá khoá này để trở lại bình thường.

**Đặt lại dữ liệu demo:** mở DevTools (`Ctrl+Shift+I`) → Application → Local Storage → xoá các khoá `medassist_*` → tải lại (`Ctrl+R`). Có thể sao lưu / khôi phục toàn bộ ở **Quản trị › Cài đặt › Sao lưu** (file JSON có checksum).

---

## 2. Công nghệ & kiến trúc

| Thành phần  | Dùng gì                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| Vỏ desktop  | Electron 31 (`src/main`, `src/preload`)                                             |
| Build       | electron-vite 2 + Vite 5 + `@vitejs/plugin-react`                                   |
| Giao diện   | React 18, react-router-dom 6 (**HashRouter**)                                       |
| Font        | `@fontsource-variable/plus-jakarta-sans` (Plus Jakarta Sans), IBM Plex Mono cho số  |
| CSS         | 1 file `global.css` (design tokens + toàn bộ style), không dùng framework CSS       |
| Trạng thái  | Store module + `useSyncExternalStore` (không Redux), Context cho Auth và Toast      |
| Đa ngôn ngữ | JSX runtime tự viết (`@i18n`) dịch chuỗi lúc render — xem [§7](#7-đa-ngôn-ngữ-i18n) |

**Vì sao chia 3 phần main / preload / renderer?**

```
┌─────────────── Electron ────────────────┐
│ main (Node.js)    preload (cầu nối)      │
│ mở cửa sổ,   ◄──► contextBridge  ◄──►    │  renderer = app React (Chromium),
│ in ấn, file...    window.api.xxx()       │  KHÔNG truy cập Node trực tiếp
└──────────────────────────────────────────┘
```

- `src/main/index.js`: tạo cửa sổ 1360×860 (`contextIsolation: true`, `nodeIntegration: false`); bản build tải giao diện qua giao thức riêng **`app://medassist`** (Origin gửi lên server là `app://medassist` — Sơn thêm vào `CORS_ORIGINS`); lưu token mã hoá bằng `safeStorage` (`userData/secure.json`) và cấu hình riêng máy (`userData/config.json`); ép locale `en-GB` để ô ngày hiện `dd/mm/yyyy`; **chỉ tin chứng chỉ CA của dự án** khi nói chuyện với máy chủ đã cấu hình (`setCertificateVerifyProc` + `src/main/certPin.js`, TC03 — xem §12).
- `src/preload/index.js`: `window.api.secureStore` (get/set/remove token) và `window.api.config` (địa chỉ server). Việc chỉ desktop làm được (máy in, file, máy quét) cũng expose ở đây.
- `src/renderer/`: một app React bình thường. Mọi nghiệp vụ nằm ở đây.

---

## 3. Cấu trúc thư mục

```
medassist-app/
├─ electron.vite.config.js     Cấu hình build 3 phần; alias @renderer, @i18n; JSX runtime dịch; optimizeDeps (xem §12)
├─ package.json               Có mục "build" cho electron-builder (appId, productName, extraResources: certs)
├─ .env.example
├─ certs/                     Chứng chỉ gốc CÔNG KHAI của CA dự án (*.crt) — KHÔNG đặt *.key ở đây
└─ src/
   ├─ main/index.js            Tiến trình chính Electron
   ├─ main/certPin.js          Kiểm tra chuỗi chứng chỉ máy chủ theo CA dự án (thuần Node, kiểm thử được)
   ├─ preload/index.js         contextBridge → window.api
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ main.jsx           Khởi động: nạp i18n TRƯỚC, rồi HashRouter + App
         ├─ App.jsx            Khung app: thanh trên, tab theo vai trò, Routes + RequireRole
         ├─ global.css         Design tokens (:root) + style toàn app, chia khối bằng /* ===== … ===== */
         │
         ├─ api/               LỚP DỮ LIỆU — mỗi file = 1 bảng/nhóm bảng backend (xem §6)
         │  ├─ client.js         apiGet / apiPost / checkHealth — công tắc USE_MOCK
         │  ├─ mockData.js       Dữ liệu tĩnh cho các trang còn dùng useApiData
         │  ├─ accountStore.js   Tài khoản, đăng nhập, khoá, đổi mật khẩu
         │  ├─ permissionStore.js  Quyền theo vai trò (mã quyền = hợp đồng với server)
         │  ├─ activityStore.js    Nhật ký hoạt động (chỉ ghi thêm, chuỗi băm)
         │  ├─ activityMessages.js Câu mô tả nhật ký theo ngôn ngữ (Anh/Việt)
         │  ├─ patientStore.js     Danh bạ bệnh nhân, tìm kiếm không dấu, kiểm trùng
         │  ├─ queueStore.js       Lượt khám HÔM NAY: máy trạng thái backend (Waiting → CheckedIn → Examining → Prescribed → Finished / Cancelled),
         │  │                      check-in, gọi số, chốt đơn (trừ kho), cấp phát, thu tiền, ca cờ đỏ
         │  ├─ vitals.js           Sinh hiệu 8 khoá chuẩn của backend: khoảng nhập, cảnh báo mềm, đổi dữ liệu cũ
         │  ├─ symptoms.js         Triệu chứng ba trạng thái (PRESENT/ABSENT/UNKNOWN) + giả lập API trích xuất từ mô tả tự do
         │  ├─ triage.js           Node 1: luật cờ đỏ + mức sàn ưu tiên trên dữ liệu ĐÃ XÁC NHẬN (logic ba trị)
         │  ├─ assessmentMock.js   Giả lập GET /visits/{id}/assessment (Pending / Ready / Degraded / Skipped)
         │  ├─ rxHistory.js        Lịch sử đơn thuốc các ngày trước + đơn mẫu (RX)
         │  ├─ visitArchive.js     Mọi lượt khám các ngày trước + kết quả (hoàn tất / bỏ về / chuyển ngày)
         │  ├─ draftStore.js       Phiếu khám dở của bác sĩ (giữ trong ngày)
         │  ├─ rxChecks.js         (KHÔNG dùng — kiểm tra tương tác thuốc, để dành cho hướng phát triển)
         │  ├─ rxSafety.js         Thuốc N/H (đơn riêng; nhà thuốc không bán thì không lên hoá đơn)
         │  ├─ billing.js          Tạm tính tiền / dòng thuốc mua ngoài (hoá đơn thật ở invoiceStore)
         │  ├─ invoiceStore.js     INVOICE / INVOICE_ITEM: pending → paid / cancelled; dòng Drug | Consultation | Paraclinical
         │  ├─ inventoryStore.js   Thuốc & vật tư, tồn theo lô, thẻ kho; trừ kho FEFO theo đợt dùng thuốc, hoàn kho đúng lô
         │  ├─ catalogStore.js     Danh mục dùng chung (khoa phòng, dịch vụ, xét nghiệm, ICD-10…)
         │  ├─ settingsStore.js    Cài đặt hệ thống, đánh số chứng từ, khoảng an toàn hạn dùng, in ấn
         │  ├─ aiConfigStore.js    Quy tắc AI (cờ đỏ / mức sàn / chẩn đoán), duyệt, bật / tắt module
         │  └─ backupStore.js      Sao lưu / khôi phục (file JSON)
         │
         ├─ context/
         │  ├─ AuthContext.jsx   Phiên đăng nhập, kiểm tra lại phiên mỗi 5 giây
         │  └─ ToastContext.jsx  showToast(msg) dùng ở mọi nơi
         ├─ hooks/useApiData.js  { data, loading, error } cho apiGet
         ├─ i18n/                Đa ngôn ngữ (xem §7)
         │  ├─ index.js            getLang / setLang / translate / localizeProps
         │  ├─ jsx-runtime.js, jsx-dev-runtime.js   JSX runtime dịch chuỗi khi tạo phần tử
         │  └─ vi.js               Bảng dịch VI + PATTERNS (chuỗi có biến)
         │
         ├─ components/          Component dùng chung
         │  ├─ Icon.jsx            Bộ icon SVG đơn sắc (thêm icon = thêm 1 mục PATHS)
         │  ├─ Modal.jsx, ConfirmModal.jsx, ReauthModal.jsx
         │  ├─ DataState.jsx       LoadingBlock / ErrorBlock
         │  ├─ StatCard.jsx, PatientQueueCard.jsx, PatientAlerts.jsx
         │  ├─ IntakeModal.jsx     Đăng ký mới / tiếp đón (tạo lượt Waiting) + cấp số
         │  ├─ SymptomPanel.jsx    HITL: triệu chứng ba trạng thái, chip đề xuất từ mô tả tự do (phải xác nhận), "Hỏi ngay"
         │  ├─ VitalsFields.jsx    8 ô sinh hiệu (huyết áp tách tâm thu / tâm trương)
         │  ├─ WaitingVisitModals.jsx  Sửa lượt đang chờ (chạy lại luật, chỉ nâng mức) / huỷ lượt
         │  ├─ SearchModal.jsx     Tra cứu bệnh nhân (F3)
         │  ├─ RedFlagModal.jsx    Cảnh báo cờ đỏ toàn màn hình → chuyển tuyến
         │  ├─ PaymentModal.jsx    CẤP PHÁT & THU TIỀN: cấp / bỏ qua từng dòng thuốc, dòng dịch vụ, tiền mặt / chuyển khoản
         │  ├─ DrugPicker.jsx      Ô tìm thuốc có tồn kho (dùng ở Kê đơn)
         │  ├─ ICDPicker.jsx       Ô chọn mã ICD-10 (danh mục ICD của module AI)
         │  ├─ TopActions.jsx      Chuông thông báo, trợ giúp, đổi ngôn ngữ…
         │  ├─ AdminSidebar.jsx    Menu Quản trị (mảng NAV)
         │  ├─ RequireRole.jsx     Chặn route theo vai trò
         │  └─ queuePrint.js       In phiếu số thứ tự, biên lai
         │
         └─ pages/
            ├─ Login.jsx           Đăng nhập theo vai trò, đổi mật khẩu lần đầu
            ├─ Reception.jsx       Khung Lễ tân (?view=…)
            ├─ reception/          Các màn con của Lễ tân
            │  ├─ Dashboard.jsx      Thẻ tổng quan, thao tác nhanh, bảng gọi, chờ cấp phát & thu tiền
            │  ├─ QueueView.jsx      Hàng chờ theo 6 trạng thái backend + nút "Có mặt — check-in"
            │  ├─ CallPanel.jsx      Bảng gọi: check-in người tới lượt, gọi miệng người bác sĩ đã nhận
            │  ├─ InvoicesView.jsx   Doanh thu ngày/tuần/tháng, theo hình thức, in báo cáo, xác nhận chuyển khoản
            │  ├─ PrescriptionsView.jsx  Đơn thuốc theo kỳ (dùng chung cho Bác sĩ) + RxDetail
            │  ├─ PeriodPicker.jsx   Bộ chọn kỳ Hôm nay/Tuần/Tháng/Tất cả/Chọn ngày
            │  └─ shared.js          fmt tiền, giờ, PAY_STATUS, periodRange, useNow
            ├─ Doctor.jsx          Khung Bác sĩ (?view=…&visit=…)
            ├─ doctor/
            │  ├─ DoctorHome.jsx     Tổng quan bác sĩ
            │  ├─ ConsultView.jsx    Phòng khám: hàng đợi + SOAP + kê đơn + chốt đơn
            │  ├─ LabOrderModal.jsx  Phiếu chỉ định xét nghiệm (chọn từ danh mục) + in phiếu giấy
            │  └─ DrugCabinetView.jsx Tủ thuốc (chỉ xem) + thêm vào đơn đang kê
            ├─ Reports.jsx         Báo cáo (MOCKUP — dùng /reports/summary)
            ├─ Schedule.jsx        Lịch hẹn (KHÔNG có route — ngoài phạm vi v2.0)
            ├─ Admin.jsx           Khung Quản trị: bảng tra id trang → component
            └─ admin/              Các trang Quản trị
               ├─ DashboardPage, PatientsPage, InvoicesPage, StaffPage, DoctorShiftsPage,
               │  HistoryPage, SettingsPage, RoadmapPage, CatalogPage, DrugCatalogPage,
               │  InventoryPage, AIConfigPage
               ├─ ai/              Cấu hình AI: Rules, Tester, Review, Metrics, Settings (trạng thái AI qua /health)
               │  ├─ catalog.js      Mã triệu chứng, sinh hiệu (khoá ngắn của bộ luật), ICD-10
               │  └─ ruleEngine.js   Bộ máy chạy quy tắc cứng (chạy offline, là fallback của LLM)
               ├─ catalogs/        CatalogDetailPage + schemas.jsx (khai báo danh mục)
               └─ inventory/       Modal nhập lô, thẻ kho, form thuốc + shared.jsx (in ấn, nhãn)
```

**Quy tắc chia file:**

- **Mỗi vai trò = 1 file khung** trong `pages/` (`Reception.jsx`, `Doctor.jsx`, `Admin.jsx`). Màn con nằm trong thư mục cùng tên viết thường (`reception/`, `doctor/`, `admin/`).
- Màn con chọn bằng **query string** (`?view=queue`), không tạo route mới, nhờ vậy nút Back và phím tắt dùng chung.
- **Mọi đọc/ghi dữ liệu đi qua `api/*`**. Trang không tự gọi `localStorage`.
- Component dùng ở ≥ 2 nơi thì đưa vào `components/`. Helper dùng trong 1 khu vực thì để ở `shared.js` của khu vực đó.
- Chú thích trong code viết **tiếng Việt**. Chuỗi giao diện viết **tiếng Anh** (được dịch, xem §7).

---

## 4. Vai trò, điều hướng & các màn hình

Có 3 vai trò cố định (`doctor`, `reception`, `admin`). Tab hiển thị theo mảng `TABS` trong `App.jsx`, còn route được chặn bằng `<RequireRole allow={[...]}>`. Chỉ ẩn tab thì không đủ, vì vẫn gõ được URL — server mới là nơi chặn thật (403).

| Route        | Vai trò  | Nội dung                                                         |
| ------------ | -------- | ---------------------------------------------------------------- |
| `/reception` | Lễ tân   | Tiếp đón, hàng chờ, check-in, bảng gọi, cấp phát & thu tiền, hoá đơn, đơn thuốc |
| `/doctor`    | Bác sĩ   | Tổng quan, phòng khám (kể cả in phiếu chỉ định XN), đơn thuốc, tủ thuốc |
| `/reports`   | Quản trị | Báo cáo (MOCKUP)                                                 |
| `/admin`     | Quản trị | Khu quản trị (menu trái). Bác sĩ vào `/admin` chỉ thấy **Duyệt tri thức** |

### Lễ tân — `pages/Reception.jsx` (`?view=`)

| view            | Màn                 | Chức năng |
| --------------- | ------------------- | --------- |
| _(trống)_       | `Dashboard`         | Thẻ: hoá đơn (đã thu hôm nay), đơn thuốc, hàng chờ, cờ đỏ; thao tác nhanh; bảng gọi; danh sách **chờ cấp phát & thu tiền** |
| `queue`         | `QueueView`         | Hàng chờ theo **6 trạng thái** (Chờ, Đã check-in, Đang khám, Chờ thanh toán, Hoàn tất, Huỷ/bỏ về); nút **Có mặt — check-in** ngay đầu thẻ; bảng gọi bệnh nhân |
| `invoices`      | `InvoicesView`      | Doanh thu Hôm nay / Tuần / Tháng / Tất cả, theo hình thức, theo trạng thái; xác nhận chuyển khoản; huỷ hoá đơn **đã thu** (quyền `invoice.void`) |
| `prescriptions` | `PrescriptionsView` | Đơn thuốc theo kỳ, lọc bác sĩ, trạng thái thanh toán, in danh sách |

Phím tắt: **F2** đăng ký mới, **F3 / Ctrl+K** tra cứu. Mất kết nối → **chỉ đọc** (khoá mọi nút ghi). Đầu trang báo **lượt chưa đóng từ ngày trước** (`StaleVisitsModal`).

### Bác sĩ — `pages/Doctor.jsx` (`?view=` + `&visit=`)

| view            | Màn                 | Chức năng |
| --------------- | ------------------- | --------- |
| _(trống)_       | `DoctorHome`        | Thẻ: chờ khám (người **đã check-in** trước), trong phòng tôi, đơn của tôi, tủ thuốc |
| `consult`       | `ConsultView`       | Hàng đợi (trong phòng / đi xét nghiệm / chờ — người chưa check-in có nhãn và không mời được / bác sĩ khác); **Mời bệnh nhân tiếp theo**; SOAP; **chip triệu chứng lễ tân đã xác nhận**; thẻ **Gợi ý tham khảo**; ICD-10; sinh hiệu 8 khoá; kê đơn (khung nhắc chỉ đọc); in phiếu chỉ định XN; **chốt đơn = trừ kho**; giấy chuyển tuyến; **Trả về hàng chờ** |
| `prescriptions` | `PrescriptionsView` | Dùng chung với Lễ tân, mặc định lọc theo chính bác sĩ |
| `drugs`         | `DrugCabinetView`   | Tủ thuốc (chỉ xem): tồn dùng được, hạn gần nhất, giá; **+ Thêm vào đơn** |

Phiếu khám dở lưu xuống máy (`api/draftStore.js`, theo ngày). Bác sĩ sửa **dị ứng / bệnh nền** ngay trong phòng khám.

### Quản trị — `pages/Admin.jsx` + `components/AdminSidebar.jsx`

Trang chủ · Hồ sơ bệnh nhân (**ẩn danh**) · Hoá đơn thanh toán · **Cấu hình AI** (Quy tắc, Thử quy tắc, Hàng duyệt, Hiệu quả, Cài đặt module) · Ca khám bác sĩ · **Tồn kho & hạn dùng** (nhập lô, thẻ kho) · Quản lý danh mục · Lịch sử hoạt động · Tài khoản nhân viên · Cài đặt · Lộ trình.

Thêm trang = thêm component vào `PAGES` trong `Admin.jsx` + thêm mục vào `NAV` trong `AdminSidebar.jsx`.

**Bác sĩ** bấm tab *Duyệt tri thức* → trang chỉ có hàng duyệt + 4 ô tóm tắt (`AIConfigPage reviewOnly`). Tắt một luật có hiệu lực ngay (công tắc an toàn); bật lại phải qua bác sĩ duyệt; không được duyệt bản mình soạn (Architecture 5.1.10).

## 5. Luồng nghiệp vụ chính

### 5.1 Vòng đời một lượt khám — đúng máy trạng thái backend v5 (`queueStore.visits`)

```
 Tiếp đón (IntakeModal) ── createVisit()  POST /visits
        ▼
   Waiting ──checkInVisit()──► CheckedIn ──takePatient()/takeNext()──► Examining ──finalizeVisit()──► Prescribed ──payVisit() + cấp phát xong──► Finished
   (sửa được)   PATCH …/check-in   ▲  │      PATCH …/start-exam            │  ▲                …/prescription/confirm      │      …/invoice/pay
        │                          │  │                                   │  │ recallVisit() (…/prescription/reopen)        │
        │                          │  └─ markNotPresent() / releaseVisit() (PATCH …/release)                                 │
        └──────── cancelVisit() ───┴──────────────────► Cancelled ◄── leaveVisit() / cờ đỏ chuyển tuyến / cancelPrescribedVisit()
```

| Trạng thái   | Ý nghĩa | Ai đổi |
| ------------ | ------- | ------ |
| `Waiting`    | Đã tiếp đón, ngồi chờ. Sửa lượt (`updateWaitingVisit`) chỉ khi còn ở đây | Lễ tân |
| `CheckedIn`  | Tới lượt, **có mặt ở quầy** — bác sĩ chỉ mời được người ở trạng thái này | Lễ tân bấm *Có mặt* (ở thẻ Hàng chờ hoặc dải "Tiếp theo" của bảng gọi) |
| `Examining`  | Bác sĩ đã nhận (giữ lượt — bác sĩ khác bị chặn như `409 VISIT_TAKEN`). Đi xét nghiệm vẫn là `Examining` + **`labOut: true`** | Bác sĩ |
| `Prescribed` | Đã chốt đơn (đã **trừ kho**) hoặc hoàn tất khám không kê đơn; có **hoá đơn pending** | Bác sĩ |
| `Finished`   | Đã thu tiền **và** mọi dòng thuốc đã cấp / bỏ qua (thứ tự tuỳ ý) | Lễ tân |
| `Cancelled`  | Huỷ lượt / bỏ về / cờ đỏ chuyển tuyến / bỏ về khi chưa trả tiền — lý do ở `visit.left` | Lễ tân / Bác sĩ |

- **Gọi bệnh nhân** (Lễ tân gọi miệng): Lễ tân check-in người tới lượt → bác sĩ *Mời bệnh nhân tiếp theo* (start-exam người **đã check-in** đứng đầu: Cấp cứu → Ưu tiên → theo số) → bảng gọi hiện *"Mời số X vào phòng Y"* → *Đã vào phòng* hoặc *Không có mặt* (release, về cuối nhóm đã check-in). Phải *Bắt đầu ca* (chọn phòng) mới mời được.
- **Dữ liệu cũ** (`waiting / in_exam / labs / payment / done / left`) được đổi tự động khi đọc (`migrateVisit`).
- **Sang ngày mới** (`rollOver`): lượt chưa đóng vào `state.stale` (giống `GET /visits/stale`), không tự đóng; lễ tân đóng kèm lý do hoặc thu nốt tiền.

### 5.2 Tiếp đón theo HITL (FR12, FR14 — Architecture 5.1.2)

1. **Lời kể** (văn bản tự do) → *Đề xuất triệu chứng từ lời kể* (`requestExtraction`, giả lập `POST /visits/{id}/extraction` + polling, timeout 30 s). Lỗi / quá hạn → tiếp tục bằng danh sách, không chặn.
2. Đề xuất hiện thành **chip chờ xác nhận** (✓ / ✕ / đổi Có–Không / Xác nhận tất cả). **Chip chưa xác nhận không bao giờ vào luật / AI.**
3. **Danh sách triệu chứng ba trạng thái** Có / Không / Chưa rõ; nguồn ghi `Form | Extracted | Prompt`.
4. **Node 1** (`api/triage.js`) chạy ngay trên **triệu chứng đã xác nhận + sinh hiệu + tuổi + số ngày** (không đọc lời kể): cờ đỏ → *Cấp cứu*, mức sàn → *Ưu tiên*, không khớp → *Thường*. Luật cờ đỏ đã có một phần bằng chứng mà còn triệu chứng *Chưa rõ* → **"Hỏi ngay"** (ô tô vàng); thiếu số đo → tô vàng ô sinh hiệu. Node 1 **luôn chạy**, kể cả khi tắt module AI.
5. **Sinh hiệu 8 khoá** (`api/vitals.js`): `temperature_c, heart_rate_bpm, respiratory_rate_bpm, systolic_bp_mmhg, diastolic_bp_mmhg, spo2_pct, weight_kg, height_cm` — dạng số, ô trống thì không gửi; ngoài khoảng nhập → chặn; ngoài cảnh báo mềm → hỏi lại.
6. Lượt lưu `symptoms: [{ symptom_code, state, source, confirmed_by, confirmed_at }]`, `vitals`, `days`, `triage`, `triageRules`.
7. **Cờ đỏ**: *Chuyển viện ngay* ở quầy (`outcome: 'referred'`, lượt → `Cancelled` lý do `referred_out`) hoặc lưu lên đầu hàng chờ mức Cấp cứu (`'queued'`); bác sĩ được báo trong cả hai trường hợp. Ca cờ đỏ: thẻ gợi ý AI = `Skipped` (không gợi ý chẩn đoán).

### 5.3 Chốt đơn → hoá đơn → cấp phát → thu tiền (backend lượt 6b / 6c)

1. **Bác sĩ chốt đơn** (`finalizeVisit`): trừ kho **FEFO trong một giao dịch** (`inventoryStore.deductForCourse`), chỉ lô **còn hạn qua hết đợt dùng**: hạn > hôm nay + max(số ngày dùng, *khoảng an toàn hạn dùng* trong Cài đặt › Vận hành). Thiếu bất kỳ dòng nào → **không trừ gì**, trả `INSUFFICIENT_STOCK` + từng thuốc kèm lý do `out | expiring | inactive` (màn bác sĩ liệt kê). Lô đã trừ lưu ở `rx[i].alloc`.
2. **Hoá đơn pending tự tạo** (`invoiceLinesOf`): phí khám (Cài đặt › Vận hành) + thuốc nhà thuốc bán (giá chép từ danh mục). Dòng `item_type`: `Drug` (giữ `rx_index`) | `Consultation` | `Paraclinical`; `total = consultation_fee + paraclinical_fee + drug_fee`. Một lượt chỉ một hoá đơn chưa huỷ.
3. **Cấp phát & thu tiền** (`PaymentModal`):
   - **Cấp phát** từng dòng: *Đã cấp* (không trừ lần nữa) | *Bỏ qua* (bắt buộc lý do → **hoàn kho đúng lô** + **lập lại hoá đơn**, giữ dòng dịch vụ); *Cấp hết*; in phiếu xuất kèm số lô, hạn dùng.
   - **Dòng dịch vụ** (FR06): thêm từ danh mục Dịch vụ / Xét nghiệm, *Thêm các xét nghiệm đã chỉ định*, hoặc nhập tay (siêu âm…).
   - **Thu tiền**: Tiền mặt | Chuyển khoản (tiền chưa về → *Chờ chuyển khoản*, xác nhận sau ở Hoá đơn).
   - Bệnh nhân bỏ về chưa trả tiền → *Huỷ lượt* (hoàn kho dòng chưa cấp, huỷ hoá đơn).
4. **Mở lại đơn** (`recallVisit`): chỉ khi chưa thu tiền và chưa cấp dòng nào → hoàn kho, huỷ hoá đơn pending, lượt về `Examining`.
5. **Huỷ hoá đơn đã thu** (`voidInvoice`, quyền `invoice.void`, người không phải Quản trị viên cần Quản trị viên xác nhận): lượt về `Prescribed` với hoá đơn pending lập lại; *bệnh nhân trả lại thuốc* → hoàn kho dòng đã cấp.
6. Thuốc **N/H** khi nhà thuốc không bán: không trừ kho, không lên hoá đơn (`dispense_status: 'Outside'`), in đơn riêng.

Không có giảm giá, BHYT, làm tròn, thêm thuốc theo đơn giấy (CSDL ràng buộc tổng = tổng các dòng; BHYT ngoài phạm vi).

### 5.4 Chỉ định xét nghiệm (làm thủ công)

Bác sĩ *Chỉ định xét nghiệm* → `LabOrderModal` (chọn từ Danh mục › Xét nghiệm) → in phiếu; lượt vẫn `Examining`, đánh dấu `labOut`. Bệnh nhân cầm kết quả giấy về → lễ tân *Đã về — báo bác sĩ* → bác sĩ *Khám tiếp*, ghi kết quả từng xét nghiệm. Phí xét nghiệm đưa vào hoá đơn bằng dòng `Paraclinical`.

### 5.5 Kê đơn — KHÔNG đánh giá đơn (Proposal FR03)

Màn kê đơn chỉ có **khung nhắc chỉ đọc** (dị ứng, bệnh nền, mang thai) kèm câu *"hệ thống không kiểm tra tương tác thuốc"*. Chốt đơn chỉ chặn khi thiếu chẩn đoán, số lượng + cách dùng, cân nặng trẻ < 12 tuổi, sinh hiệu sai, hoặc **thiếu thuốc dùng được**. `api/rxChecks.js` còn trong mã nguồn nhưng **không dùng** (hướng phát triển).

## 6. Lớp dữ liệu (store giả lập)

### Khuôn mẫu chung của một store

```js
let state = read() ?? seed()                 // localStorage hoặc dữ liệu mẫu
function commit(next) { state = next; localStorage.setItem(KEY, …); listeners.forEach(fn => fn()) }
export const getX = () => state              // đọc ngoài React
export function useX() { return useSyncExternalStore(subscribe, getX) }   // đọc trong React
export function doSomething(args, user) { …; commit(…); logEvent(user, 'x.y', {…}) }  // ghi + nhật ký
```

- Hàm ghi trả `{ ok, error }` khi có thể thất bại; `error` là chuỗi **tiếng Anh**, dịch khi hiển thị.
- Hàm ghi nhận `user` để ghi nhật ký. Không xoá bản ghi nghiệp vụ: hoá đơn, phiếu và danh mục được "huỷ" hoặc "ngừng dùng" kèm lý do.
- Ngày tính theo **giờ máy** (`dayOf`, `ymd`), không theo UTC.

### Khoá `localStorage`

| Khoá                                             | Store           | Ghi chú                                                   |
| ------------------------------------------------ | --------------- | --------------------------------------------------------- |
| `medassist_accounts_v1`                          | accountStore    | Mật khẩu băm SHA-256 (chỉ cho demo)                       |
| `medassist_audit_v2`                             | activityStore   | Chỉ ghi thêm, có chuỗi băm                                |
| `medassist_patients_v1`                          | patientStore    |                                                           |
| `medassist_queue_v2`                             | queueStore      | Lưu theo ngày (`day`); trạng thái cũ tự đổi sang tên backend khi đọc |
| `medassist_rx_history_v1`                        | rxHistory       |                                                           |
| `medassist_visit_archive_v1` | visitArchive | Mọi lượt khám các ngày trước + kết quả (done / left / carried) |
| `medassist_consult_drafts_v1` | draftStore | Phiếu khám dở của bác sĩ, chỉ giữ trong ngày |
| `medassist_invoices_v1`                          | invoiceStore    | `processing` cũ → `pending` (chuyển khoản) khi đọc         |
| `medassist_inventory_v3`                         | inventoryStore  | Thuốc, lô, thẻ kho (đã bỏ NCC, công nợ, kiểm kho)         |
| `medassist_catalogs_v1`                          | catalogStore    |                                                           |
| `medassist_settings_v1`, `medassist_counters_v1` | settingsStore   | Bộ đếm số chứng từ                                        |
| `medassist_ai_config_v1`                         | aiConfigStore   |                                                           |
| `medassist_backup_log_v1`                        | backupStore     |                                                           |
| `medassist_lang`                                 | i18n            | `en` / `vi`                                               |
| `medassist_mock_llm_down`                        | assessmentMock, symptoms | `'1'` = giả lập LLM lỗi (Degraded / trích xuất lỗi) |
| `medassist_device_v1`                            | deviceSettings  | Cài đặt riêng máy: khổ giấy, bảng gọi bệnh nhân           |
| *(userData/secure.json)*                         | main + preload  | Token access/refresh, mã hoá `safeStorage` — không ở localStorage |
| *(userData/config.json)*                         | serverConfig    | Địa chỉ server của máy này                                |

Đổi cấu trúc dữ liệu thì **tăng hậu tố `_vN`** để bản cũ trong máy người dùng được tạo lại, thay vì đọc sai cấu trúc.

### `api/client.js` + `useApiData`

Một số trang cũ vẫn lấy dữ liệu tĩnh qua `apiGet(path)` → `MOCK_ENDPOINTS` trong `mockData.js` (giả lập trễ 300–600 ms):
`/reports/summary` (Báo cáo, trang chủ Quản trị), `/admin/dashboard`, `/schedule/*` (Lịch hẹn — chưa có route).

---

## 7. Đa ngôn ngữ (i18n)

**Nguyên tắc:** viết chuỗi giao diện bằng **tiếng Anh** ngay trong JSX. Khi người dùng chọn tiếng Việt, chuỗi được **tự dịch lúc tạo phần tử**, trang **không phải gọi `t()`** ở từng chỗ.

Cơ chế:

1. `electron.vite.config.js` khai báo `react({ jsxImportSource: '@i18n' })`. Mọi JSX đi qua `i18n/jsx-runtime.js`.
2. Runtime gọi `localizeProps()`. Hàm này dịch **chuỗi con trực tiếp** của thẻ HTML và các thuộc tính `placeholder`, `title`, `aria-label`, `defaultValue` (cùng `value` của ô `readOnly`).
3. Bảng dịch nằm trong `i18n/vi.js`:
   - `VI`: khoá = **đúng chuỗi tiếng Anh** (đã bỏ khoảng trắng 2 đầu).
   - `PATTERNS`: chuỗi có biến, viết dạng `[/^Waited (\d+) min$/, 'Đã chờ $1 phút']`.
4. Đổi ngôn ngữ thì đổi `key` của Shell, toàn bộ giao diện dựng lại mà vẫn giữ phiên đăng nhập.

**Những chỗ KHÔNG tự dịch, phải gọi `translate()` thủ công:**

- Chuỗi ghép bằng template literal: `` `${n} ${translate('paid')}` ``.
- Chuỗi truyền vào **component** (không phải thẻ HTML) rồi được render như chuỗi con của component đó, ví dụ `NavLink`. Cách xử lý: bọc chuỗi trong `<span>`.
- Nội dung in (`printHtml`), `document.title`, `window.confirm`, giá trị `value` của ô đang sửa.
- Câu nhật ký: dựng theo ngôn ngữ ở `api/activityMessages.js` (mỗi mã hành động trả `[en, vi]`).

**Thêm chuỗi mới:** viết tiếng Anh trong JSX, rồi thêm khoá vào `VI` (theo khối chú thích chủ đề). Nên kiểm tra trùng khoá:
`npx esbuild src/renderer/src/i18n/vi.js --log-level=warning --outfile=/tmp/vi.js` (esbuild báo `Duplicate key`).

---

## 8. Quy ước giao diện

- **Design tokens** đặt ở `:root` trong `global.css`: `--surface`, `--surface-alt`, `--surface-hover`, `--solid`, `--ink`, `--ink-soft`, `--primary`, `--primary-soft`, `--accent`, `--warn`, `--border`, `--field-bg`, `--radius`… Giao diện là **nền tối duy nhất**. Không dùng mã màu sáng kiểu `#EEF2ED` (sót lại từ mockup cũ, không hợp với nền tối).
- **Lớp CSS dùng lại**: `card`, `card-title` (+ `.cnt`), `btn btn-primary|btn-ghost|btn-sm`, `icon-btn sm|danger`, `badge ok|warn|low|muted|info`, `dt` (bảng), `field`, `form-grid cols-2|cols-4`, `itabs/itab`, `ai-seg` (nút phân đoạn), `cash-filters` (thanh lọc), `empty-state`, `warn-banner danger|caution`, `dash-cards/dash-card`, `dash-actions`, `rev-cards`, `inv-stats`, `status-row`, `meter`, `drug-grid`.
- **Icon**: `<Icon name="…" />` (SVG theo `currentColor`). **Không dùng emoji.**
- **Modal**: dùng `Modal` + `ModalHeader`; xác nhận thì dùng `ConfirmModal`; thao tác nhạy cảm thì dùng `ReauthModal` (nhập lại mật khẩu). Không dùng `alert/confirm` của trình duyệt.
- **Thông báo**: `const { showToast } = useToast()`.
- **Tiền**: `toLocaleString('vi-VN') + 'đ'` (`fmt` trong `reception/shared.js`, `fmtMoney` trong `admin/inventory/shared.jsx`). **Ngày** hiện `dd/mm/yyyy`, **giờ** 24h.
- **In ấn**: `printHtml(title, bodyHtml, docKind)` trong `pages/admin/inventory/shared.jsx`. Hàm này in qua iframe ẩn, khổ giấy lấy theo **Cài đặt › In ấn** cho từng loại chứng từ (`prescription`, `labOrder`, `invoice`, `other`). Luôn `esc()` dữ liệu người dùng.
- **Dropdown tìm kiếm**: dùng `onMouseDown` cho lựa chọn (chạy trước `onBlur` của ô nhập).
- Màn hình hẹp: các lưới có `@media (max-width:1100px)` để chuyển còn 1–2 cột.

---

## 9. Phân quyền & nhật ký

- **Quyền cố định theo 3 vai trò** (`api/permissionStore.js` — không còn trang chỉnh quyền): mã quyền `<module>.<thao tác>` và quyền đặc biệt `rx.finalize`, `patient.clinical`, `ai.approve`, `invoice.void`, `data.export`. Dùng: `can(user.roleKey, 'invoice.void')`.
- Theo **quyền tối thiểu** (Quy định v5 §7): Quản trị viên **không xem dữ liệu bệnh nhân**, không khám, không kê đơn; Lễ tân quản lý kho cùng Admin (như backend: Admin, Nurse quản lý danh mục và lô); Bác sĩ chỉ xem kho.
- **Ẩn nút chỉ để dễ dùng**: backend kiểm tra vai trò ở từng endpoint (`require_roles`, trả 403).
- **Khoá tài khoản tạm thời** sau `security.maxFailed` lần sai (mặc định 5 lần / 15 phút), tự mở khi hết hạn.
- **Nhật ký** (`logEvent(user, action, { target, params, before, after, level })`): chỉ ghi thêm, có chuỗi băm. Mỗi mã `action` mới cần câu `[en, vi]` trong `activityMessages.js` và mức trong `activityStore.js`.

## 10. Điểm tích hợp Backend

Backend: **FastAPI + PostgreSQL 16** chạy Docker Compose trên máy admin, client vào qua **Caddy HTTPS** (Architecture v1.5, Cấu trúc v5).

**Bật API thật:** `src/renderer/src/api/client.js` đặt `USE_MOCK = false`. Địa chỉ server lấy từ `api/serverConfig.js` (mỗi máy tự đặt; bản đóng gói chỉ nhận `https://` khi không phải máy này). Token lưu qua `tokenStore` (`safeStorage`); `client.js` tự gửi `Authorization: Bearer …`, gặp 401 thì `POST /api/v1/auth/refresh` một lần rồi thử lại, refresh cũng 401 → về màn đăng nhập. Lỗi trả về `ApiError { status, code, details, requestId }` theo định dạng `{error: {code, message, details, request_id}}`; tô đỏ ô theo `details[].field`; lỗi 500 hiện `request_id`.

**CORS:** bản build tải giao diện từ `app://medassist` → Sơn đặt `CORS_ORIGINS=app://medassist` (+ `http://localhost:5173` khi dev).

Cách ghép: **giữ nguyên chữ ký hàm** của store, thay thân bằng lời gọi API rồi cập nhật state. Các trang không phải sửa.

| Hàm client (store) | Endpoint backend v5 (tiền tố `/api/v1`) |
| --- | --- |
| `accountStore` đăng nhập / tài khoản | `POST auth/login`, `auth/refresh`, `auth/logout`, `auth/change-password`; `GET auth/me`; `admin/users…` |
| `patientStore` | `GET/POST patients` (`?q=` không dấu, `?phone=`, `?id_number=`; 409 `POSSIBLE_DUPLICATE`, `DUPLICATE_ID_NUMBER`), `GET/PATCH patients/{id}`, `GET patients/{id}/visits` |
| `queueStore.createVisit` | `POST visits` (triệu chứng đã xác nhận + `vital_signs` 8 khoá) |
| `queueStore.updateWaitingVisit` | `PATCH visits/{id}` (chỉ khi Waiting) |
| `queueStore.checkInVisit` | `PATCH visits/{id}/check-in` |
| `queueStore.takePatient / takeNext` | `PATCH visits/{id}/start-exam` (409 `VISIT_TAKEN`) |
| `queueStore.releaseVisit / markNotPresent` | `PATCH visits/{id}/release` |
| `queueStore.cancelVisit / leaveVisit` | `PATCH visits/{id}/cancel {reason}` |
| `useQueue` (polling ~2 s) | `GET queue`; lượt ngày trước: `GET visits/stale`, `POST visits/stale/cancel` |
| `queueStore.finalizeVisit` | `POST visits/{id}/diagnoses` + `PUT visits/{id}/prescription` + `POST …/prescription/confirm` (409 thiếu thuốc); không kê đơn: `POST visits/{id}/complete-exam` |
| `queueStore.recallVisit` | `POST visits/{id}/prescription/reopen` |
| `queueStore.dispenseItem / dispenseAll` | `PATCH prescription-items/{id}/dispense`, `POST visits/{id}/dispense-all` |
| `queueStore.setServiceLines` | `PATCH visits/{id}/invoice` |
| `queueStore.payVisit / confirmVisitPayment` | `POST visits/{id}/invoice/pay`; danh sách chờ: `GET billing/awaiting`; in: `GET …/invoice/print` |
| `inventoryStore` | `GET/POST drugs`, `GET/PATCH drugs/{id}`, `GET inventory/stock`, `…/alerts`, `GET/POST inventory/batches`, `POST …/top-up`, `GET …/movements` |
| `settingsStore` | `GET admin/settings`, `PUT admin/settings/{key}` |
| `activityStore` | `GET admin/audit-logs`, `GET admin/audit-logs/export` (xlsx/csv, đọc dạng blob) |
| `client.checkHealth` | `GET /health` → `{ database: {ok, detail}, ai: {ok, detail}, version }` |

**Backend chưa có endpoint** (client đang chạy cục bộ — xem danh sách gửi Sơn): tín hiệu "bác sĩ sẵn sàng / đang gọi" của bảng gọi, ca trực & phòng, phiếu chỉ định xét nghiệm, thống kê ẩn danh cho Admin, huỷ hoá đơn đã thu, ca cờ đỏ (`red_flags`), duyệt tri thức (Sprint 3), báo cáo (`Reports.jsx`, `admin/DashboardPage.jsx` còn dùng `useApiData`).

**Chức năng chỉ desktop làm được** (máy in nhiệt, file): viết ở `src/main` → expose qua `src/preload` (`window.api.xxx`) → gọi từ renderer.

## 11. Điểm tích hợp module AI

Module AI chạy **trong backend** (Huy): Node 1 tất định, Node 2–4 (truy xuất đóng, LLM xếp hạng + giải thích, kiểm tra đầu ra) chạy nền qua worker. **Client không gọi thẳng Ollama** (runtime không có xác thực, chỉ container `api` gọi được — QA03, TC05). Client chỉ bật / tắt module; mô hình, timeout, số ca đồng thời là cấu hình server.

| # | Điểm tích hợp | File client | Hiện trạng | Thay bằng |
| --- | --- | --- | --- | --- |
| 1 | **Trích xuất triệu chứng** từ lời kể | `api/symptoms.js` (`requestExtraction`), `components/SymptomPanel.jsx` | Giả lập bằng từ điển đồng nghĩa, có độ trễ, lỗi giả lập | `POST visits/{id}/extraction` (202) + polling `GET …/extraction`; trả `[{ symptom_code, state, phrase? }]`; timeout 30 s |
| 2 | **Node 1 — cờ đỏ / mức sàn** | `api/triage.js` | Chạy cục bộ trên dữ liệu đã xác nhận để lễ tân thấy ngay khi nhập | Kết quả của `POST visits/{id}/assessment` (< 2 s): `priority`, `is_red_flag`, rule hits |
| 3 | **Gợi ý chẩn đoán** | `api/assessmentMock.js`, `pages/doctor/AssessmentCard.jsx` | Đúng cấu trúc `GET visits/{id}/assessment`: `ai_status` `Pending / Ready / Degraded / Skipped`, `mode` `Full / RuleOnly`, ứng viên (≤ 3) với bằng chứng ủng hộ / phản bác / chưa rõ, phiên bản tri thức, mô hình, prompt | Gọi API thật, polling ~2 s tới khi khác `Pending` |
| 4 | **Quyết định của bác sĩ** | `ConsultView` (`aiOutcome`) → `visit.aiDecision` | `AcceptedTop / ChoseOther / NoSuggestion` | Ghi cùng `POST visits/{id}/diagnoses` (liên kết `assessment_id`) |
| 5 | **Quy tắc & duyệt** | `admin/ai/RulesTab`, `ReviewTab`, `RuleFormModal` | Soạn → gửi duyệt → bác sĩ duyệt (khác người soạn) | Luồng release tri thức `knowledge_router` (Sprint 3) |
| 6 | **Trạng thái AI** | `admin/ai/SettingsTab.jsx` | Qua `GET /health` của backend | — |

Mã triệu chứng, sinh hiệu (khoá ngắn của bộ luật), ICD-10 dùng chung ở `pages/admin/ai/catalog.js`. Khi ghép thật, danh mục triệu chứng lấy từ bản **Active** của kho tri thức (`api/symptoms.js › activeSymptoms`).

## 12. Lưu ý quan trọng & lỗi hay gặp

1. **Chuỗi mới thêm vào `vi.js` mà giao diện vẫn hiện tiếng Anh khi chạy dev**
   Nguyên nhân: Electron cache vĩnh viễn bản runtime dịch mà Vite đóng gói sẵn. Đã xử lý bằng `optimizeDeps.exclude: ['@i18n/jsx-runtime', '@i18n/jsx-dev-runtime']` trong `electron.vite.config.js`. **Không xoá cấu hình này.** Nếu vẫn gặp: tắt app, xoá `node_modules/.vite`, chạy lại `npm run dev`. Nếu cần, xoá thêm thư mục `Cache` của app trong `%APPDATA%/medassist-app`.
2. **HashRouter là bắt buộc**: bản build chạy từ `app://medassist` (giao thức riêng, `src/main/index.js`), không có server phục vụ `/doctor`. Đừng đổi sang BrowserRouter.
3. **`main.jsx` phải import `./i18n` đầu tiên**, trước mọi component.
4. **Không lưu chuỗi đã dịch vào dữ liệu.** Hãy lưu chuỗi tiếng Anh / mã, rồi dịch lúc hiển thị (trừ giá trị người dùng chọn vào ô nhập, như ICD).
5. **Ngày theo giờ máy**: so sánh ngày bằng chuỗi `YYYY-MM-DD` từ `dayOf()` / `ymd()`, không dùng `toISOString().slice(0,10)` (bị lệch múi giờ UTC+7).
6. **Dữ liệu mẫu tính lùi từ lúc mở app** (giờ đến, hoá đơn ngày trước…) để luôn khớp "hôm nay". Sang ngày mới thì hàng chờ mẫu được tạo lại.
7. **Bác sĩ của lượt khám** lưu cả `doctor` (họ tên, để hiển thị) và `doctorId`. "Của tôi" so theo `doctorId` (`isMine`). Bộ lọc bác sĩ ở màn Đơn thuốc vẫn lọc theo họ tên.
8. **Huỷ hoá đơn chỉ hoàn kho khi lễ tân tick "Bệnh nhân đã trả lại thuốc"**. Không tick nghĩa là thuốc đã giao, kho giữ nguyên.
8b. **Kho trừ một lần, lúc bác sĩ chốt đơn.** "Đã cấp" ở quầy không trừ lần nữa; mọi lần hoàn kho (bỏ qua, mở lại đơn, huỷ lượt, trả thuốc) về **đúng lô đã trừ** (`rx[i].alloc`). Dữ liệu mẫu của hai lượt "chờ thanh toán" không trừ kho (để kho mẫu không bị trừ mỗi ngày).
9. **Bảo mật bản demo**: mật khẩu SHA-256 trong `localStorage`, quyền và khoá tài khoản chỉ được ép ở client. **Không dùng bản này với dữ liệu bệnh nhân thật.**
9b. **Chứng chỉ máy chủ** (TC03): đặt chứng chỉ gốc **công khai** của CA dự án vào `certs/` (Sơn mở PR). Với máy chủ đã cấu hình, app chỉ nhận chứng chỉ có **chuỗi đi đúng** tới CA đó, khớp tên máy / IP, còn hạn (`src/main/certPin.js`). Bản đóng gói thiếu file CA → từ chối kết nối; máy dev chưa có CA → kiểm tra mặc định của Chromium. Không bao giờ tắt kiểm tra chứng chỉ; `.gitignore` chặn `*.key`.
10. **Không có ESLint config** trong dự án. Build (`npm run build`) là bước kiểm tra cú pháp tối thiểu trước khi commit.
11. Chỉnh `global.css` theo khối `/* ===== Tên khu vực ===== */`. Style mới cho khu vực nào thì thêm vào cuối khối của khu vực đó.

---

## 13. Việc còn lại / hướng phát triển

- [x] Luồng nghiệp vụ khớp backend v5: máy trạng thái, check-in, trừ kho khi chốt đơn, hoá đơn pending, cấp phát từng dòng (§5).
- [x] Tiếp đón HITL: triệu chứng ba trạng thái, chip đề xuất phải xác nhận, sinh hiệu 8 khoá (§5.2).
- [x] Thẻ gợi ý AI theo đúng `ai_status`; client không gọi thẳng LLM; ghim chứng chỉ CA dự án.
- [ ] Ghép backend thật (§10): bắt đầu từ đăng nhập → bệnh nhân → lượt khám / hàng chờ (API đã có), rồi kê đơn, cấp phát, thu tiền.
- [ ] Ghép module AI thật (§11 mục 1–3) khi Huy xong `assessment_router`.
- [ ] Thêm `certs/medassist-root-ca.crt` (Sơn) và thử kết nối HTTPS trên LAN của buổi bảo vệ.
- [ ] **Báo cáo** (`Reports.jsx`) lấy số thật: doanh thu, tồn kho, lượt khám, bệnh nhân / ngày, tỉ lệ chấp nhận gợi ý AI (Proposal §6.2).
- [ ] Đóng gói: `icon` cho electron-builder, chữ ký số.
- [ ] Chuyển mã vào `client/` của repo chung (Quy định v5) và push lên `feature/desktop-ui`.

## 14. Quy trình làm việc theo vai trò

Tóm tắt nghiệp vụ hằng ngày (chi tiết kỹ thuật ở §4–§5).

### Lễ tân (`/reception`)

| Bước | Việc làm | Màn hình / hàm |
|---|---|---|
| Đầu ngày | Xem tổng quan; xử lý **lượt chưa đóng** từ hôm trước (đóng kèm lý do hoặc thu tiền) | `Dashboard`, `StaleVisitsModal` |
| Tiếp đón | **F3** tìm bệnh nhân cũ hoặc **F2** đăng ký mới (báo trùng SĐT / họ tên + ngày sinh / CCCD); ghi dị ứng, bệnh nền theo lời khai | `SearchModal`, `IntakeModal` |
| Triệu chứng | Ghi lời kể → *Đề xuất triệu chứng* → **xác nhận từng chip**; tick Có / Không / Chưa rõ; trả lời các mục **Hỏi ngay** | `SymptomPanel` |
| Sinh hiệu | 8 ô (HA tách 2 ô); trẻ < 12 tuổi bắt buộc cân nặng; luật chạy ngay → Cấp cứu / Ưu tiên / Thường | `VitalsFields`, `triage()` |
| Cờ đỏ | *Chuyển viện ngay* (gọi 115 nếu cần) hoặc *Lưu — lên đầu hàng chờ (Cấp cứu)*; bác sĩ được báo | `TriageStrip`, `RedFlagModal` |
| Check-in | Bệnh nhân có mặt và sắp tới lượt → **Có mặt — check-in** (đầu thẻ Hàng chờ, hoặc bấm số ở dải "Tiếp theo") | `checkInVisit()` |
| Gọi bệnh nhân | Bác sĩ mời → bảng gọi hiện *"Mời số X vào phòng Y"* → gọi miệng → *Đã vào phòng* / *Không có mặt* | `CallPanel` |
| Lượt đang chờ | **Sửa** (chỉ khi chưa check-in): lời kể, triệu chứng, sinh hiệu đo lại, ưu tiên — luật chạy lại, chỉ nâng mức; **Huỷ lượt** kèm lý do | `EditWaitingModal`, `CancelVisitModal` |
| Cấp phát | Mở **Cấp phát & thu tiền**: *Đã cấp* / *Bỏ qua* (lý do) từng dòng, hoặc *Cấp hết*; in phiếu xuất kèm số lô | `PaymentModal` → `dispenseItem()` |
| Hoá đơn | Thêm dòng **Khám / Cận lâm sàng** (siêu âm, xét nghiệm đã chỉ định…) | `setServiceLines()` |
| Thu tiền | Tiền mặt / Chuyển khoản (chưa về → *Chờ chuyển khoản*, xác nhận ở Hoá đơn). Thu tiền + cấp xong → **Hoàn tất** | `payVisit()`, `confirmVisitPayment()` |
| Bỏ về chưa trả | *Huỷ lượt khám này* (hoàn kho thuốc chưa cấp) | `cancelPrescribedVisit()` |
| Huỷ hoá đơn đã thu | Nhập lý do; cần **Quản trị viên xác nhận tại quầy**; bệnh nhân trả thuốc → hoàn kho | `voidInvoice()` |

### Bác sĩ (`/doctor`)

| Bước | Việc làm | Màn hình / hàm |
|---|---|---|
| Bắt đầu ca | *Bắt đầu ca* → chọn phòng (bắt buộc trước khi mời bệnh nhân) | `dutyStore`, `DutyBar` |
| Cờ đỏ | Thông báo đỏ + chuông → *Chuyển tuyến* (tự mở giấy chuyển tuyến) / *Khám tại phòng khám* | `reviewRedFlag()` |
| Mời bệnh nhân | *Mời bệnh nhân tiếp theo* (**Alt+N**) — chỉ người **đã check-in**; ca ưu tiên mời vượt được (ghi nhật ký) | `takePatient()`, `takeNext()` |
| Khám | Chip triệu chứng đã xác nhận + sinh hiệu; SOAP; **thẻ Gợi ý tham khảo** (Đang phân tích / Đầy đủ / Chỉ theo luật / Cờ đỏ — không gợi ý); ICD-10 | `ConsultView`, `AssessmentCard` |
| Xét nghiệm | In phiếu chỉ định (**Alt+L**); bệnh nhân về → *Khám tiếp*, ghi kết quả | `LabOrderModal`, `sendToLabs()` |
| Kê đơn | Liều Sáng/Trưa/Chiều/Tối × số ngày → tự tính số lượng; khung nhắc chỉ đọc; cảnh báo nếu lô hết hạn trước khi hết đợt | `ConsultView` |
| Chốt đơn | **Ctrl+Enter** → **trừ kho ngay**; thiếu thuốc → danh sách từng thuốc + lý do, đổi thuốc rồi chốt lại | `finalizeVisit()` |
| Mở lại đơn | Khi chưa thu tiền và chưa cấp thuốc → sửa rồi chốt lại | `recallVisit()`, `RxReviewPanel` |
| Rời phòng | *Trả về hàng chờ* (bác sĩ khác mời lại được, phiếu dở giữ theo lượt) | `releaseVisit()` |
| Bỏ về | *Bệnh nhân bỏ về* (bắt buộc lý do) | `leaveVisit()` |
| Kết thúc ca | Không còn bệnh nhân trong phòng / đi xét nghiệm / cờ đỏ chưa đánh giá → tổng kết ca | `ShiftEndModal` |
| Duyệt tri thức | Tab **Duyệt tri thức**: duyệt / từ chối thay đổi luật do Quản trị viên soạn | `AIConfigPage reviewOnly` |

### Quản trị viên (`/admin`, `/reports`)

| Mảng | Việc làm |
|---|---|
| Hệ thống | Tài khoản, khoá / buộc đăng xuất, cài đặt (phí khám, giờ mở cửa, khoảng an toàn hạn dùng, đánh số, khổ giấy), sao lưu |
| Kho | Danh mục thuốc, **nhập lô** (số lô, hạn dùng, số lượng, giá nhập), thẻ kho, cảnh báo sắp hết hạn / dưới ngưỡng |
| Danh mục | Thuốc & vật tư, dịch vụ, xét nghiệm (kèm giá — dùng cho dòng cận lâm sàng), khoa phòng, ICD-10… |
| AI | Soạn / thử quy tắc, theo dõi hiệu quả, bật / tắt module (trạng thái AI qua máy chủ) |
| Giám sát | Nhật ký hoạt động (chỉ ghi thêm), hoá đơn, ca khám bác sĩ, hồ sơ bệnh nhân **ẩn danh** |

### Giới hạn đã biết (ghi vào báo cáo đồ án)

- **Vai trò Lễ tân** (đề tài cố định 3 vai trò) đảm nhận cả tiếp đón, cấp phát và thu tiền (thực tế do dược sĩ đứng quầy).
- **Không đánh giá đơn thuốc** (tương tác, liều, trùng đơn) — đúng Proposal FR03.
- **Trích xuất triệu chứng và thẻ gợi ý AI đang là giả lập** đúng cấu trúc API; Node 1 chạy cục bộ trên dữ liệu đã xác nhận.
- **Bảng gọi bệnh nhân, ca trực, phiếu chỉ định** chạy cục bộ từng máy cho tới khi backend có endpoint.
- **Xét nghiệm làm ngoài hệ thống**: không nhận kết quả điện tử; phí tính bằng dòng cận lâm sàng nhập tay.
- **Bản demo**: quyền, khoá tài khoản, kiểm tra trùng hoá đơn… chỉ ép ở client; backend thật phải kiểm tra lại (§10).
