# MedAssist: ứng dụng desktop cho phòng khám ngoại trú

Ứng dụng **Electron + React** (JavaScript, không TypeScript, theo Proposal §10) cho 3 vai trò Lễ tân, Bác sĩ, Quản trị.
Phụ trách: Lê Nhật Anh. Tài liệu dành cho người phát triển; hướng dẫn dùng theo vai trò ở [`docs/huong-dan-su-dung.md`](../docs/huong-dan-su-dung.md).

Ứng dụng luôn nối server: FastAPI + PostgreSQL qua HTTPS, token lưu mã hóa bằng `safeStorage`. Không có chế độ giả lập;
muốn xem giao diện mà không cài máy admin thì bật `deploy/docker-compose.eval.yml` (server kèm dữ liệu mẫu) và chạy `npm run eval`.

Phạm vi theo **Proposal v2.0 §6.2**: không có sổ quỹ / chốt ca, nhà cung cấp & công nợ, kiểm kho / hủy thuốc, hóa đơn bán lẻ,
bàn giao bệnh nhân, giấy nghỉ ốm, tóm tắt bệnh án, phân quyền chỉnh được, đánh giá đơn thuốc (tương tác, liều).

---

## Mục lục

1. [Chạy dự án](#1-chạy-dự-án)
2. [Công nghệ và kiến trúc](#2-công-nghệ-và-kiến-trúc)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Vai trò, điều hướng và các màn hình](#4-vai-trò-điều-hướng-và-các-màn-hình)
5. [Luồng nghiệp vụ chính](#5-luồng-nghiệp-vụ-chính)
6. [Lớp dữ liệu](#6-lớp-dữ-liệu)
7. [Đa ngôn ngữ (i18n)](#7-đa-ngôn-ngữ-i18n)
8. [Quy ước giao diện](#8-quy-ước-giao-diện)
9. [Phân quyền và nhật ký](#9-phân-quyền-và-nhật-ký)
10. [Bảng ghép API](#10-bảng-ghép-api)
11. [Tích hợp module AI](#11-tích-hợp-module-ai)
12. [Kiểm thử](#12-kiểm-thử)
13. [Lưu ý quan trọng và lỗi hay gặp](#13-lưu-ý-quan-trọng-và-lỗi-hay-gặp)
14. [Tình trạng và giới hạn đã biết](#14-tình-trạng-và-giới-hạn-đã-biết)

---

## 1. Chạy dự án

Yêu cầu: **Node.js 18+** (đã thử với Node 24). Electron mở cửa sổ thật nên phải chạy trên máy, không chạy trong trình duyệt.

```powershell
cd client
npm install        # lần đầu hơi lâu vì Electron khá nặng
npm run dev        # Vite dev server + cửa sổ Electron, sửa code thấy ngay
```

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy dev, có hot reload |
| `npm test` | Bộ test trong `tests/` (Vitest, API giả lập bằng `vi.doMock` / `tests/fakeServer.js`, không cần server). `npm run test:watch` chạy lại khi sửa code |
| `npm run build` | Build ra `out/` (main, preload, renderer); dùng để kiểm tra cú pháp trước khi commit |
| `npm start` | Chạy thử bản đã build trong `out/` |
| `npm run build:win` | Build + đóng gói bản cài Windows (NSIS) vào `dist/`, kèm `certs/*.crt`. `:mac`, `:linux` tương tự |
| `npm run eval` | Build theo `.env.eval` (nối `http://127.0.0.1:8000` của `deploy/docker-compose.eval.yml`) rồi mở app: cách giảng viên chạy kiểm thử, xem [`docs/huong-dan-kiem-thu.md`](../docs/huong-dan-kiem-thu.md) |
| `npm run dist:eval` | Bản cài kiểm thử cho hệ điều hành đang dùng. Bản Windows + macOS do workflow `.github/workflows/release.yml` build khi merge vào `main` |

**Biến môi trường**: chép `.env.example` thành `.env` (file riêng của máy, không commit), sửa rồi chạy lại `npm run dev`:

| Biến | Ý nghĩa |
|---|---|
| `VITE_API_BASE_URL` | Địa chỉ server **mặc định** khi máy chưa đặt. Mỗi máy đổi được lúc chạy: nút **Máy chủ** ở màn đăng nhập hoặc Cài đặt › Kết nối (lưu ở `userData/config.json`) |
| `VITE_DEV_TOOLS` | `true` = hiện công cụ cho dev (vd giả lập mất mạng ở Tiếp đón). Để trống khi dùng thật |

**Chạy trên máy dev**

1. Chạy backend theo `server/README.md` (API ở `http://127.0.0.1:8000`, worker AI ở terminal thứ hai),
   hoặc bật server kèm dữ liệu mẫu: `docker compose -f deploy/docker-compose.eval.yml --env-file deploy/eval.env up -d`.
2. `client/.env`: `VITE_API_BASE_URL=http://127.0.0.1:8000`.
3. `server/.env` cho phép nguồn của dev server: `CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]`.
4. Đăng nhập bằng tài khoản tạo bằng `scripts.create_user` (`admin`, `bs01`, `yta01`).

**Mở nhiều vai trò trên một máy (test)**: thêm tham số `--profile=<tên>` (chữ, số, gạch ngang) vào shortcut, vd
`"…\MedAssist.exe" --profile=bacsi`. Mỗi hồ sơ có thư mục dữ liệu riêng `%APPDATA%\MedAssist-<tên>` (token, địa chỉ máy chủ,
cài đặt của máy), nên lễ tân, bác sĩ, quản trị đăng nhập song song không đè phiên nhau. Không có tham số thì app dùng thư mục mặc định
như cũ. Xóa thư mục `MedAssist-<tên>` để bỏ một hồ sơ.

**Bản cài cho phòng khám**: `npm run build:win` với file CA trong `certs/` (xem `certs/README.md`).
Bản đóng gói tải giao diện từ `app://medassist`, nên server phải có `CORS_ORIGINS=["app://medassist"]` (mặc định của `deploy/.env.example`)
và chỉ nhận địa chỉ `https://` khi server không phải máy này.

---

## 2. Công nghệ và kiến trúc

| Thành phần | Dùng gì |
|---|---|
| Vỏ desktop | Electron 31 (`src/main`, `src/preload`) |
| Build | electron-vite 2 + Vite 5 + `@vitejs/plugin-react` |
| Giao diện | React 18, react-router-dom 6 (**HashRouter**) |
| Font | Plus Jakarta Sans (`@fontsource-variable`), IBM Plex Mono cho số |
| CSS | `global.css` nạp các file trong `styles/` theo thứ tự cascade; không dùng framework CSS |
| Trạng thái | Store module + `useSyncExternalStore` (không Redux), Context cho Auth và Toast |
| Đa ngôn ngữ | JSX runtime tự viết (`@i18n`) dịch chuỗi lúc render, xem [§7](#7-đa-ngôn-ngữ-i18n) |
| Test | Vitest + jsdom |

```
┌─────────────── Electron ────────────────┐
│ main (Node.js)    preload (cầu nối)      │
│ mở cửa sổ,   ◄──► contextBridge  ◄──►    │  renderer = app React (Chromium),
│ in ấn, file...    window.api.xxx()       │  KHÔNG truy cập Node trực tiếp
└──────────────────────────────────────────┘
```

- `src/main/index.js`: cửa sổ 1360×860 (`contextIsolation: true`, `nodeIntegration: false`); bản build tải giao diện qua giao thức riêng
  **`app://medassist`**; lưu token mã hóa bằng `safeStorage` (`userData/secure.json`; máy không có kho khóa của hệ điều hành thì chỉ giữ trong bộ nhớ) và cấu hình riêng máy (`userData/config.json`);
  ép locale `en-GB` để ô ngày hiện `dd/mm/yyyy`; **chỉ tin chứng chỉ CA của dự án** khi nói chuyện với máy chủ đã cấu hình
  (`setCertificateVerifyProc` + `src/main/certPin.js`, Architecture TC03).
- `src/preload/index.js`: `window.api.secureStore` (get/set/remove token) và `window.api.config` (địa chỉ server).
  Việc chỉ desktop làm được (máy in, file) cũng expose ở đây.
- `src/renderer/`: app React; mọi nghiệp vụ nằm ở đây.

---

## 3. Cấu trúc thư mục

```
client/
├─ electron.vite.config.js   Build 3 phần; alias @renderer, @i18n; JSX runtime dịch; optimizeDeps (xem §13)
├─ package.json              Mục "build" cho electron-builder (appId, productName, extraResources: certs)
├─ vitest.config.mjs, tests/ Test nghiệp vụ (§12)
├─ .env.example
├─ certs/                    Chứng chỉ gốc CÔNG KHAI của CA dự án (*.crt) — KHÔNG đặt *.key ở đây
└─ src/
   ├─ main/index.js, main/certPin.js   Tiến trình chính, kiểm tra chuỗi chứng chỉ máy chủ
   ├─ preload/index.js                 contextBridge → window.api
   └─ renderer/src/
      ├─ main.jsx            Khởi động: nạp i18n TRƯỚC, đọc cấu hình server, rồi HashRouter + App
      ├─ App.jsx             Khung app: thanh trên, tab theo vai trò, Routes + RequireRole
      ├─ global.css, styles/ 01-tokens-base … 19-connection-intake: mỗi file một vùng giao diện
      ├─ api/                LỚP DỮ LIỆU (§6, §10)
      │  ├─ client.js          apiGet / apiPost / apiRequest, ApiError, refresh token, checkHealth
      │  ├─ serverConfig.js    Địa chỉ server của máy, tokenStore (safeStorage)
      │  ├─ connectivity.js    Hỏi /health ~3 giây một lần; mất kết nối → chỉ đọc
      │  ├─ authApi.js, accountStore.js     Đăng nhập, đổi mật khẩu, tài khoản nhân viên
      │  ├─ clinicApi.js       Bệnh nhân, lượt khám, hàng đợi, triệu chứng, trích xuất, đánh giá AI (nối server)
      │  ├─ examApi.js         Chẩn đoán, đơn thuốc, xác nhận / mở lại đơn (nối server)
      │  ├─ billingApi.js      Chờ thanh toán, cấp phát, hóa đơn, thu tiền (nối server)
      │  ├─ emrApi.js          Lịch sử khám, chi tiết lượt khám cũ (nối server)
      │  ├─ knowledgeApi.js    Bản phát hành, nguồn, soạn nháp, tắt khẩn cấp tri thức (nối server)
      │  ├─ auditApi.js, reportsApi.js      Nhật ký hoạt động, báo cáo, nhật ký AI
      │  ├─ roomStore.js       Phòng khám cố định của bác sĩ (ERD v1.9)
      │  ├─ serverDrugs.js     Danh mục thuốc + tồn kho của server cho màn kê đơn
      │  ├─ queueStore.js      Hàng chờ trong ngày: đồng bộ GET /queue, check-in, mời, nhận khám, trả về hàng chờ, cờ đỏ
      │  ├─ inventoryStore.js  Danh mục thuốc, tồn theo lô, thẻ kho (đọc từ server)
      │  ├─ serviceApi.js, serviceStore.js, serviceCatalogLive.js   Dịch vụ, xét nghiệm, gói khám, phiếu chỉ định
      │  ├─ prescriptionApi.js, conditionCatalog.js   Danh sách đơn thuốc, danh mục bệnh Active (ICD-10)
      │  ├─ symptoms.js, vitals.js, patient.js   Danh mục triệu chứng, 8 khóa sinh hiệu, tiện ích bệnh nhân (fold, ageOf)
      │  ├─ settingsStore.js   Tham số server (GET / PUT /admin/settings) + cài đặt của máy này
      │  └─ draftStore.js, deviceSettings.js, rxSafety.js   Phiếu khám dở trên máy, cài đặt thiết bị, thuốc N / H
      ├─ context/            AuthContext (phiên, tự đăng xuất), ToastContext
      ├─ hooks/              useApiData, useAsyncAction, useDelayedFlag
      ├─ i18n/               index.js, jsx-runtime.js, jsx-dev-runtime.js, vi.js
      ├─ components/         Dùng chung: Modal, ConfirmModal, ReauthModal, ChangePasswordModal, IntakeModal, SymptomPanel,
      │                      VitalsFields, WaitingVisitModals, StaleVisitsModal, SearchModal, RedFlagModal,
      │                      PaymentModal, DrugPicker, ICDPicker, ServerAddress, AdminSidebar,
      │                      RequireRole, TopActions, Icon, queuePrint.js, useCallAnnouncer.js …
      └─ pages/
         ├─ Login.jsx                  Đăng nhập, đổi mật khẩu lần đầu, chọn máy chủ
         ├─ Reception.jsx, reception/  Dashboard, QueueView, CallPanel, BillingLiveView, PrescriptionsLive
         ├─ Doctor.jsx, doctor/        DoctorHome, ConsultView, AssessmentCard, LabOrderModal, DocumentModal,
         │                             DrugCabinetView, PatientLookup, ServerHistory
         ├─ Reports.jsx                Báo cáo vận hành (GET /reports/summary)
         ├─ Admin.jsx                  Khung Quản trị: bảng tra id trang → component (PAGES)
         └─ admin/                     DashboardPage, RoomsPage, InventoryPage, CatalogPage, DrugCatalogPage, HistoryPage,
                                       StaffPage, SettingsPage, RoadmapPage; ui.jsx (Switch, ConfirmDialog, Empty)
            ├─ knowledge/              Cấu hình AI = quản trị tri thức: Release, Items, Sources, AiLogs (KnowledgeLive)
            ├─ catalogs/               CatalogDetailPage + schemas.jsx
            └─ inventory/              Nhập lô, thẻ kho, form thuốc, shared.jsx (in ấn, nhãn)
```

**Quy tắc chia file**

- **Mỗi vai trò = 1 file khung** trong `pages/`. Màn con nằm trong thư mục cùng tên viết thường, chọn bằng **query string** (`?view=queue`).
- **Mọi đọc/ghi dữ liệu đi qua `api/*`**; trang không tự gọi `fetch` hay `localStorage`.
- Component dùng ở ≥ 2 nơi đưa vào `components/`; helper của một khu vực để ở `shared.js` của khu vực đó.
- Chú thích trong code viết **tiếng Việt**; chuỗi giao diện viết **tiếng Anh** (được dịch, §7).

---

## 4. Vai trò, điều hướng và các màn hình

3 vai trò cố định: `reception` (Nurse trên server), `doctor` (Physician), `admin` (Admin). Tab theo mảng `TABS` trong `App.jsx`,
route chặn bằng `<RequireRole allow={[...]}>`. Ẩn tab chỉ để dễ dùng; server mới là nơi chặn thật (403).

| Route | Vai trò | Nội dung |
|---|---|---|
| `/reception` | Lễ tân | Tiếp đón, hàng chờ, check-in, bảng gọi, cấp phát & thu tiền, hóa đơn, đơn thuốc |
| `/doctor` | Bác sĩ | Tổng quan, phòng khám, đơn thuốc, tủ thuốc, tra cứu bệnh nhân |
| `/reports` | Quản trị | Báo cáo vận hành |
| `/admin` | Quản trị; Bác sĩ (chỉ **Duyệt tri thức**) | Khu quản trị (menu trái) |

### Lễ tân: `pages/Reception.jsx` (`?view=`)

| view | Màn | Chức năng |
|---|---|---|
| `home` | `Dashboard` | Thẻ tổng quan (hóa đơn đã thu, đơn thuốc, hàng chờ, cờ đỏ), thao tác nhanh, bảng gọi, danh sách **chờ cấp phát & thu tiền** |
| `queue` | `QueueView` | Hàng chờ theo 6 trạng thái; nút **Có mặt – check-in**; sửa / hủy lượt đang chờ |
| `invoices` | `BillingLiveView` | Hóa đơn theo ngày |
| `prescriptions` | `BillingLiveView` | Đơn thuốc trong ngày, chờ cấp phát / thu tiền |

Phím tắt: **F2** đăng ký mới, **F3 / Ctrl+K** tra cứu. Mất kết nối → **chỉ đọc**. Đầu trang báo **lượt chưa đóng từ ngày trước** (`StaleVisitsModal`).

### Bác sĩ: `pages/Doctor.jsx` (`?view=` + `&visit=`)

| view | Màn | Chức năng |
|---|---|---|
| `home` | `DoctorHome` | Chờ khám (người đã check-in trước), trong phòng tôi, đơn của tôi |
| `consult` | `ConsultView` | Hàng đợi; **Mời bệnh nhân tiếp theo** (Alt+N); chip triệu chứng lễ tân đã xác nhận; thẻ **Gợi ý tham khảo**; SOAP; ICD-10; kê đơn (Alt+T tìm thuốc); phiếu chỉ định xét nghiệm (Alt+L); chốt đơn (Ctrl+Enter); giấy chuyển tuyến; trả về hàng chờ |
| `prescriptions` | `PrescriptionsLive` | Đơn theo kỳ (`GET /prescriptions`), mặc định lọc theo chính bác sĩ |
| `drugs` | `DrugCabinetView` | Tủ thuốc (chỉ xem): tồn dùng được, hạn gần nhất, giá; **+ Thêm vào đơn** |
| `patients` | `PatientLookup` | Tra cứu bệnh nhân và hồ sơ khám cũ (EMR) |

Bác sĩ gắn với **một phòng khám cố định** (Quản trị › Tài khoản nhân viên); đăng nhập là khám ở phòng đó, bảng gọi hiện *"Mời số X vào phòng Y"*.
Phiếu khám dở lưu xuống máy (`draftStore`, theo ngày). Đăng xuất khi còn bệnh nhân trong phòng / đang đi xét nghiệm thì app nhắc trước.

### Quản trị: `pages/Admin.jsx` + `components/AdminSidebar.jsx`

Trang chủ · **Cấu hình AI / Tri thức** · Phòng khám · **Tồn kho & hạn dùng** ·
Quản lý danh mục · Lịch sử hoạt động · Tài khoản nhân viên · Cài đặt · Lộ trình. Quản trị không xem dữ liệu bệnh nhân và hóa đơn
(doanh thu xem ở Báo cáo).
Thêm trang = thêm component vào `PAGES` trong `Admin.jsx` + thêm mục vào `NAV` trong `AdminSidebar.jsx`.

**Cấu hình AI** là `knowledge/KnowledgeLive`: bản phát hành (soạn, gửi duyệt, duyệt / từ chối), danh mục mục tri thức
(xem phiên bản, soạn nháp, xem mục phụ thuộc, **tắt khẩn cấp**), nguồn, nhật ký AI. Bác sĩ vào tab **Duyệt tri thức** chỉ thấy phần duyệt;
không được duyệt bản mình soạn (Architecture 5.1.10).

---

## 5. Luồng nghiệp vụ chính

### 5.1 Vòng đời một lượt khám (máy trạng thái backend, `queueStore`)

```
 Tiếp đón (IntakeModal) ── POST /visits
        ▼
   Waiting ──check-in──► CheckedIn ──start-exam──► Examining ──confirm / complete-exam──► Prescribed ──thu tiền + cấp phát xong──► Finished
   (sửa được)                ▲  │                       │  ▲                                   │
        │                    │  └── release ◄───────────┘  └── prescription/reopen ◄────────────┘
        └──── cancel ────────┴──────────────────► Cancelled ◄── bỏ về / cờ đỏ chuyển tuyến / hủy khi chưa trả tiền
```

| Trạng thái | Ý nghĩa | Ai đổi |
|---|---|---|
| `Waiting` | Đã tiếp đón, ngồi chờ; chỉ ở đây mới sửa được lời kể, triệu chứng | Lễ tân |
| `CheckedIn` | Tới lượt, **có mặt** — bác sĩ chỉ mời được người ở trạng thái này; vẫn đo lại sinh hiệu được | Lễ tân |
| `Examining` | Bác sĩ đã nhận (bác sĩ khác bị `409 VISIT_TAKEN`). Đi xét nghiệm vẫn là `Examining`, đánh dấu `labOut` | Bác sĩ |
| `Prescribed` | Đã chốt đơn (đã **trừ kho**) hoặc hoàn tất khám không kê đơn; có **hóa đơn chờ thu** | Bác sĩ |
| `Finished` | Đã thu tiền và mọi dòng thuốc đã cấp / bỏ qua | Lễ tân |
| `Cancelled` | Hủy lượt / bỏ về / cờ đỏ chuyển tuyến / bỏ về khi chưa trả tiền (kèm lý do) | Lễ tân, Bác sĩ |

- **Gọi bệnh nhân**: lễ tân check-in người tới lượt → bác sĩ *Mời bệnh nhân tiếp theo* (người đã check-in đứng đầu: Cấp cứu → Ưu tiên → theo số)
  → bảng gọi hiện *"Mời số X vào phòng Y"* → *Đã vào phòng* hoặc *Không có mặt* (release, về cuối nhóm đã check-in).
- **Sang ngày mới**: lượt chưa đóng không tự đóng; lễ tân đóng kèm lý do hoặc thu nốt tiền (`GET /visits/stale`, `POST /visits/stale/cancel`).

### 5.2 Tiếp đón theo HITL (FR12, FR14, Architecture 5.1.2)

1. **Lời kể** (văn bản tự do) → *Đề xuất triệu chứng từ lời kể* (`POST /visits/{id}/symptom-extraction` + polling). Lỗi / quá hạn → tiếp tục bằng danh sách, không chặn.
2. Đề xuất hiện thành **chip chờ xác nhận** (✓ / ✕ / đổi Có–Không / Xác nhận tất cả). **Chip chưa xác nhận không bao giờ vào luật / AI.**
3. **Danh sách triệu chứng ba trạng thái** Có / Không / Chưa rõ (danh mục Active của server, `GET /symptoms`); nguồn ghi `Form | Extracted | Prompt`.
4. **Sinh hiệu 8 khóa** (`api/vitals.js`): `temperature_c, heart_rate_bpm, respiratory_rate_bpm, systolic_bp_mmhg, diastolic_bp_mmhg, spo2_pct, weight_kg, height_cm`
   — ngoài khoảng nhập → chặn; ngoài cảnh báo mềm → hỏi lại; trẻ < 12 tuổi bắt buộc cân nặng.
5. Lưu: `PUT /visits/{id}/symptoms` rồi `POST /visits/{id}/assessment` — server chạy **Node 1** ngay (cờ đỏ → *Cấp cứu*, mức sàn → *Ưu tiên cao*, còn lại *Thường*)
   và xếp việc AI cho worker. Node 1 không phụ thuộc LLM hay worker.
6. Luật cờ đỏ còn thiếu dữ liệu (`complete_now`) → mục **"Hỏi ngay"** tô vàng để lễ tân hỏi thêm.
7. **Cờ đỏ**: chuyển viện ngay ở quầy, hoặc lưu lên đầu hàng chờ mức Cấp cứu; thẻ gợi ý AI của ca cờ đỏ là `Skipped`.


### 5.3 Chốt đơn → hóa đơn → cấp phát → thu tiền

1. **Bác sĩ chốt đơn**: đồng bộ chẩn đoán → lưu đơn nháp → `POST …/prescription/confirm`. Server trừ kho **FEFO trong một giao dịch**, chỉ dùng lô còn hạn qua hết đợt dùng
   (hạn > hôm nay + max(số ngày dùng, khoảng an toàn hạn dùng)). Thiếu bất kỳ dòng nào → **không trừ gì**, trả `409` kèm từng thuốc thiếu.
   Không kê đơn → `POST …/complete-exam`.
2. **Hóa đơn chờ thu tự tạo**: phí khám + thuốc nhà thuốc bán + phí cận lâm sàng (nhập tay ở quầy). Một lượt chỉ một hóa đơn chưa hủy.
3. **Cấp phát & thu tiền** (`PaymentModal`): *Đã cấp* / *Bỏ qua* (lý do, hoàn kho đúng lô, lập lại hóa đơn) từng dòng hoặc *Cấp hết*;
   thêm dòng dịch vụ / xét nghiệm; thu tiền mặt hoặc chuyển khoản. Thu xong và cấp xong → `Finished`.
4. **Mở lại đơn**: chỉ khi chưa thu tiền và chưa cấp dòng nào → hoàn kho, hủy hóa đơn chờ thu, lượt về `Examining`.
5. Thuốc nhà thuốc không bán: không trừ kho, không lên hóa đơn, in đơn riêng.

Không có giảm giá, BHYT, làm tròn. **Hóa đơn đã thu là trạng thái cuối** trên server.

### 5.4 Chỉ định xét nghiệm (làm thủ công)

Bác sĩ *Chỉ định xét nghiệm* → `LabOrderModal` (danh mục, gói từ server) → `POST visits/{id}/service-orders` và in phiếu; lượt vẫn `Examining`, server đánh dấu đi xét nghiệm (`lab_out_at`).
Bệnh nhân cầm kết quả giấy về → bác sĩ của lượt bấm *Khám tiếp* (`PATCH …/lab-return`) và nhập kết quả. Phí xét nghiệm tự vào hóa đơn từ phiếu chỉ định (ERD v2.1).

### 5.5 Kê đơn: KHÔNG đánh giá đơn (Proposal FR03)

Màn kê đơn chỉ có **khung nhắc chỉ đọc** (dị ứng, bệnh nền, mang thai) kèm câu *"hệ thống không kiểm tra tương tác thuốc"*.
Chốt đơn chỉ chặn khi thiếu chẩn đoán, số lượng + cách dùng, cân nặng trẻ < 12 tuổi, sinh hiệu sai, hoặc thiếu thuốc dùng được.

---

## 6. Lớp dữ liệu

Các file `*Api.js` gọi FastAPI và đổi dữ liệu server sang đúng hình dạng màn hình dùng. Các `*Store.js` giữ bản sao trong bộ nhớ
(`useSyncExternalStore`) để nhiều màn dùng chung, ví dụ `queueStore` hỏi lại `GET /queue` vài giây một lần. Mời bệnh nhân,
đi xét nghiệm, chuyển tuyến đều qua server (ERD v2.0), mọi máy thấy như nhau. Dữ liệu nghiệp vụ không lưu trên máy.

**`client.js`**

- Gửi `Authorization: Bearer …`; gặp `401` thì `POST /api/v1/auth/refresh` một lần rồi gọi lại; refresh cũng `401` → về màn đăng nhập.
  Sai mật khẩu ở `/auth/login` cũng là `401` nhưng không bị hiểu là hết phiên.
- `403 PASSWORD_CHANGE_REQUIRED` → về màn đổi mật khẩu.
- Lỗi thành `ApiError { status, code, details, requestId }` theo định dạng `{error: {code, message, details, request_id}}`;
  tô đỏ ô theo `details[].field`; lỗi 500 hiện `request_id`.
- `connectivity.js` hỏi `/health` ~3 giây một lần; không trả lời → banner, khóa mọi thao tác ghi; có lại thì tự mở.

**Khuôn mẫu một store**

```js
let state = { items: [] }
function commit(next) { state = next; listeners.forEach(fn => fn()) }
export const getX = () => state              // đọc ngoài React
export function useX() { return useSyncExternalStore(subscribe, getX) }   // đọc trong React
export const syncX = () => apiGet('/api/v1/x').then((items) => commit({ ...state, items }))
export const doSomething = (id) => apiRequest(`/api/v1/x/${id}`, 'PATCH', {…}).then(syncX, (e) => ({ ok: false, error: e.message }))
```

- Hàm ghi trả `{ ok, error }` khi có thể thất bại; `error` là câu tiếng Việt của server hoặc chuỗi **tiếng Anh** của client (dịch khi hiển thị).
- Nhật ký hoạt động do server ghi (`audit_log`); client không ghi nhật ký riêng.
- Không xóa bản ghi nghiệp vụ: hóa đơn, phiếu và danh mục được "hủy" hoặc "ngừng dùng" kèm lý do.
- Ngày tính theo **giờ máy** (`ymd`, `todayISO`), không theo UTC.

**Khóa lưu trên máy**

| Khóa | Ghi chú |
|---|---|
| `medassist_settings_v1` | Bản sao tham số server và cài đặt in ấn của máy |
| `medassist_consult_drafts_v1` | Phiếu khám dở của bác sĩ, chỉ giữ trong ngày |
| `medassist_device_v1` | Cài đặt riêng máy: khổ giấy, bảng gọi bệnh nhân |
| `medassist_lang` | `en` / `vi` |
| `userData/secure.json` | Token access / refresh, mã hóa `safeStorage`, không ở `localStorage` |
| `userData/config.json` | Địa chỉ server của máy |

Đổi cấu trúc dữ liệu thì **tăng hậu tố `_vN`** để bản cũ trong máy người dùng được tạo lại thay vì đọc sai cấu trúc.

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

**Thêm chuỗi mới:** viết tiếng Anh trong JSX, rồi thêm khoá vào `VI` (theo khối chú thích chủ đề). Nên kiểm tra trùng khoá:
`npx esbuild src/renderer/src/i18n/vi.js --log-level=warning --outfile=/tmp/vi.js` (esbuild báo `Duplicate key`).

---

## 8. Quy ước giao diện

- **Design tokens** đặt ở `:root` trong `styles/01-tokens-base.css`: `--surface`, `--surface-alt`, `--surface-hover`, `--solid`, `--ink`, `--ink-soft`, `--primary`, `--primary-soft`, `--accent`, `--warn`, `--border`, `--field-bg`, `--radius`… Giao diện là **nền tối duy nhất**. Không dùng mã màu sáng kiểu `#EEF2ED` (sót lại từ mockup cũ, không hợp với nền tối).
- **Lớp CSS dùng lại**: `card`, `card-title` (+ `.cnt`), `btn btn-primary|btn-ghost|btn-sm`, `icon-btn sm|danger`, `badge ok|warn|low|muted|info`, `dt` (bảng), `field`, `form-grid cols-2|cols-4`, `itabs/itab`, `ai-seg` (nút phân đoạn), `cash-filters` (thanh lọc), `empty-state`, `warn-banner danger|caution`, `dash-cards/dash-card`, `dash-actions`, `rev-cards`, `inv-stats`, `status-row`, `meter`, `drug-grid`.
- **Icon**: `<Icon name="…" />` (SVG theo `currentColor`). **Không dùng emoji.**
- **Modal**: dùng `Modal` + `ModalHeader`; xác nhận thì dùng `ConfirmModal`; thao tác nhạy cảm thì dùng `ReauthModal` (nhập lại mật khẩu). Không dùng `alert/confirm` của trình duyệt.
- **Thông báo**: `const { showToast } = useToast()`.
- **Tiền**: `toLocaleString('vi-VN') + 'đ'` (`fmt` trong `reception/shared.js`, `fmtMoney` trong `admin/inventory/shared.jsx`). **Ngày** hiện `dd/mm/yyyy`, **giờ** 24h.
- **In ấn**: `printHtml(title, bodyHtml, docKind)` trong `pages/admin/inventory/shared.jsx`. Hàm này in qua iframe ẩn, khổ giấy lấy theo **Cài đặt › In ấn** cho từng loại chứng từ (`prescription`, `labOrder`, `invoice`, `other`). Luôn `esc()` dữ liệu người dùng.
- **Dropdown tìm kiếm**: dùng `onMouseDown` cho lựa chọn (chạy trước `onBlur` của ô nhập).
- **CSS mới** thêm vào cuối file `styles/` của vùng tương ứng (hoặc file mới ở cuối danh sách trong `global.css`); thứ tự import là thứ tự cascade, không đổi.
- Màn hình hẹp: các lưới có `@media (max-width:1100px)` để chuyển còn 1–2 cột.

---

## 9. Phân quyền và nhật ký

- **Quyền cố định theo 3 vai trò**: tab và route chọn theo `user.roleKey` (`App.jsx`, `RequireRole`).
- **Quyền tối thiểu**: Quản trị **không xem dữ liệu bệnh nhân**, không khám, không kê đơn; Lễ tân quản lý kho cùng Quản trị; Bác sĩ chỉ xem kho.
- Ẩn nút chỉ để dễ dùng; server kiểm tra vai trò ở từng endpoint (`require_roles`, trả 403).
- **Nhật ký**: mọi thao tác ghi và mọi lần xem dữ liệu bệnh nhân do server ghi (`audit_log`, chỉ ghi thêm);
  màn Lịch sử hoạt động đọc `GET /admin/audit-logs`. Client không ghi nhật ký riêng.

## 10. Bảng ghép API

Tiền tố `/api/v1`. Danh sách đầy đủ và quyền: `server/README.md` mục 9, hoặc Swagger `/docs` của máy dev.

| File client | Endpoint |
|---|---|
| `authApi.js`, `accountStore.js` | `auth/login`, `auth/refresh`, `auth/logout`, `auth/change-password`, `auth/me`, `auth/password-policy`; `admin/users…` (tạo, sửa, đặt lại mật khẩu, mở khóa) |
| `clinicApi.js` | `patients` (tìm, tạo, sửa), `patients/lookup`; `visits` (tạo, sửa, `check-in`, `start-exam`, `release`, `cancel`); `queue`; `symptoms`, `visits/{id}/symptoms`; `visits/{id}/symptom-extraction`; `visits/{id}/assessment` |
| `queueStore.js` | `GET queue` (polling ~3 s); `visits/stale`, `visits/stale/cancel` |
| `examApi.js` | `visits/{id}/diagnoses`, `diagnoses/{id}`, `…/retract`; `visits/{id}/prescription` (PUT nháp), `…/confirm`, `…/reopen`; `visits/{id}/complete-exam` |
| `billingApi.js` | `billing/awaiting`, `billing/invoices`; `visits/{id}/invoice` (xem, sửa phí), `…/print`, `…/pay`; `prescription-items/{id}/dispense`, `visits/{id}/dispense-all` |
| `emrApi.js` | `patients/{id}/history`, `visits/{id}/record` |
| `serverDrugs.js`, `inventoryStore.js` | `drugs`, `drugs/{id}`; `inventory/stock`; `inventory/batches`, `…/{id}/movements` |
| `roomStore.js` | `rooms`, `admin/rooms`, `admin/rooms/{id}` |
| `settingsStore.js` | `admin/settings`, `admin/settings/{key}` |
| `auditApi.js` | `admin/audit-logs`, `admin/audit-logs/export` (xlsx / csv, đọc dạng blob) |
| `reportsApi.js` | `reports/summary?date_from&date_to` (số thô, client tự định dạng), `admin/ai-logs` |
| `knowledgeApi.js` | `admin/knowledge/releases…` (tạo, gửi duyệt, duyệt, từ chối), `…/sources`, `…/{loại}`, `…/{loại}/{mã}/versions`, `…/draft`, `…/dependents`, `…/deactivate` |
| `client.checkHealth` | `GET /health` → `{ status, database: {ok, detail}, ai: {ok, detail}, version }` (AI lỗi vẫn 200, chỉ CSDL lỗi mới 503) |

Không cần API riêng cho ca cờ đỏ: lấy từ `is_red_flag`, `red_flag_reason` trong `GET /queue`.
Chức năng chỉ desktop làm được (máy in, file): viết ở `src/main` → expose qua `src/preload` (`window.api.xxx`) → gọi từ renderer.

## 11. Tích hợp module AI

Module AI chạy **trong backend**: Node 1 tất định chạy ngay khi xếp hàng; Node 2–4 (truy xuất, LLM xếp hạng + giải thích, kiểm tra đầu ra)
chạy nền trong `worker`. **Client không gọi thẳng Ollama** (runtime không có xác thực, chỉ container `worker` gọi được; QA03, TC05).

| Điểm tích hợp | File client | API |
|---|---|---|
| Trích xuất triệu chứng từ lời kể | `components/SymptomPanel.jsx`, `IntakeModal.jsx` | `POST` + polling `GET visits/{id}/symptom-extraction`; trả `suggestions[{symptom_code, symptom_name, status}]`, luôn `requires_confirmation` |
| Node 1: cờ đỏ, mức sàn, "Hỏi ngay" | `IntakeModal.jsx`, `queueStore.js` | Kết quả của `POST visits/{id}/assessment`: `priority`, `is_red_flag`, `alerts`, `complete_now` |
| Gợi ý chẩn đoán | `pages/doctor/AssessmentCard.jsx` | Polling `GET visits/{id}/assessment` tới khi khác `Pending` |
| Quyết định của bác sĩ | `ConsultView.jsx` | Gửi `assessment_id` kèm `POST visits/{id}/diagnoses` |
| Quản trị tri thức | `pages/admin/knowledge/` | `knowledgeApi.js` |
| Trạng thái AI | `admin/settings/ConnectionTab.jsx`, `admin/DashboardPage.jsx` | `GET /health` |

Thẻ **Gợi ý tham khảo** theo `ai_status`: `Pending` (đang phân tích), `Ready` (`mode` `Full`: có lý do của LLM), `Degraded` (`RuleOnly`: chỉ xếp hạng theo luật),
`Skipped` (cờ đỏ, không gợi ý). Tối đa 3 ứng viên, mỗi ứng viên có bằng chứng ủng hộ / phản bác / còn thiếu, kèm phiên bản tri thức và mô hình.

## 12. Kiểm thử

`npm test` chạy bộ test trong `tests/` (Vitest + jsdom, không cần server). API được giả lập: các test `*-live` thay
`clinicApi` / `examApi` bằng "server" nhỏ trong bộ nhớ làm đúng luật backend (`vi.doMock`); test giao diện thay `fetch` bằng `tests/fakeServer.js`.

| File | Nội dung |
|---|---|
| `desk-live.test.js` | Quầy và phòng khám: check-in, huỷ lượt, lượt ngày cũ, trả về hàng chờ, thu hồi đơn |
| `invite-referral-live.test.js` | Mời bệnh nhân, chuyển tuyến, ca cờ đỏ |
| `labs-live.test.js`, `service-orders.test.js` | Đi xét nghiệm, phiếu chỉ định, danh mục dịch vụ / xét nghiệm / gói khám |
| `mappers.test.js`, `vitals.test.js` | Đổi dữ liệu server ↔ màn hình, sinh hiệu |
| `ui-screens.test.jsx`, `ui-error-boundary.test.jsx` | Mọi màn chính của 3 vai trò dựng được; lưới bắt lỗi giao diện |
| `i18n.test.js`, `profile.test.js` | Mọi chuỗi giao diện có bản dịch; tham số `--profile` |

CI (`.github/workflows/ci.yml`, job *Client*) chạy `npm run lint` và `npm test` cho mỗi PR; trước khi commit nên tự chạy thêm `npm run build`.

## 13. Lưu ý quan trọng và lỗi hay gặp

1. **Chuỗi mới thêm vào `vi.js` mà giao diện vẫn hiện tiếng Anh khi chạy dev**: Electron cache bản runtime dịch mà Vite đóng gói sẵn.
   Đã xử lý bằng `optimizeDeps.exclude: ['@i18n/jsx-runtime', '@i18n/jsx-dev-runtime']` trong `electron.vite.config.js`; **không xóa cấu hình này**.
   Nếu vẫn gặp: tắt app, xóa `node_modules/.vite`, chạy lại; nếu cần xóa thêm thư mục `Cache` trong `%APPDATA%/medassist-app`.
2. **HashRouter là bắt buộc**: bản build chạy từ `app://medassist`, không có server phục vụ `/doctor`.
3. **`main.jsx` phải import `./i18n` đầu tiên**, trước mọi component.
4. **Không lưu chuỗi đã dịch vào dữ liệu**: lưu chuỗi tiếng Anh / mã, dịch lúc hiển thị.
5. **Ngày theo giờ máy**: so sánh bằng chuỗi `YYYY-MM-DD` từ `ymd()` / `todayISO()`, không dùng `toISOString().slice(0,10)` (lệch UTC+7).
6. **Kho trừ một lần, lúc bác sĩ chốt đơn.** "Đã cấp" ở quầy không trừ lần nữa; mọi lần hoàn kho về **đúng lô đã trừ**.
7. **Bác sĩ của lượt khám** lưu cả họ tên (hiển thị) và id; "Của tôi" so theo id.
8. **Chứng chỉ máy chủ** (TC03): với máy chủ đã cấu hình, app chỉ nhận chứng chỉ có chuỗi đi đúng tới CA trong `certs/`, khớp tên máy / IP, còn hạn.
   Bản đóng gói thiếu file CA → từ chối kết nối; không bao giờ tắt kiểm tra chứng chỉ.
9. **Lỗi CORS khi nối server lúc dev**: thêm `http://localhost:5173` vào `CORS_ORIGINS` của `server/.env`, khởi động lại uvicorn.
10. **Đăng nhập được nhưng bị đưa về màn đổi mật khẩu**: tài khoản do Admin tạo / vừa đặt lại mật khẩu (`403 PASSWORD_CHANGE_REQUIRED`), đổi rồi đăng nhập lại.

## 14. Tình trạng và giới hạn đã biết

- [x] Luồng nghiệp vụ khớp backend: máy trạng thái, check-in, trừ kho khi chốt đơn, hóa đơn chờ thu, cấp phát từng dòng.
- [x] Tiếp đón HITL: triệu chứng ba trạng thái, chip đề xuất phải xác nhận, sinh hiệu 8 khóa.
- [x] Nối server: đăng nhập, bệnh nhân, hàng đợi, khám, kê đơn, cấp phát, thu tiền, EMR, phòng khám, kho, cài đặt, nhật ký, báo cáo, tri thức.
- [x] Gợi ý AI thật qua `GET /visits/{id}/assessment`; client không gọi thẳng LLM; ghim chứng chỉ CA dự án.
- [ ] Đóng gói: `icon` cho electron-builder, chữ ký số cho bản cài.
- [x] Thu hồi đơn chờ thanh toán để sửa: nút ở màn Đơn thuốc của bác sĩ (`PrescriptionsLive`), gọi `POST …/prescription/reopen`.
- [x] Chạy `npm run lint` và `npm test` trong CI; bản cài Windows / macOS build tự động khi đẩy tag.

Giới hạn (ghi vào báo cáo đồ án):

- **Vai trò Lễ tân** (đề tài cố định 3 vai trò) đảm nhận cả tiếp đón, cấp phát và thu tiền (thực tế do dược sĩ đứng quầy).
- **Không đánh giá đơn thuốc** (tương tác, liều, trùng đơn), đúng Proposal FR03.
- **Xét nghiệm làm ngoài hệ thống**: không nhận kết quả điện tử; bác sĩ nhập kết quả từ phiếu giấy.
- **Hóa đơn đã thu không hủy được** trên server; lịch hẹn ngoài phạm vi v2.0.
