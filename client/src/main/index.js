import { app, shell, BrowserWindow, protocol, net, ipcMain, safeStorage, session } from 'electron'
import { join, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { X509Certificate } from 'crypto'
import { verifyAgainstCAs } from './certPin'
import { is } from '@electron-toolkit/utils'

// Bản build tải giao diện qua giao thức riêng app://medassist (không dùng file://): Origin gửi lên server là
// "app://medassist" thay vì "null", nên backend đặt được CORS_ORIGINS chính xác (Quy định v5, điểm chờ #15).
const APP_ORIGIN = 'app://medassist'
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

const RENDERER_DIR = join(__dirname, '../renderer')
function serveApp() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    const file = normalize(join(RENDERER_DIR, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)))
    // Chặn đọc ra ngoài thư mục giao diện (../../...).
    if (file !== RENDERER_DIR && !file.startsWith(RENDERER_DIR + sep)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

// ---------- Lưu trữ cục bộ của từng máy (thư mục userData) ----------
// secure.json: token đăng nhập, mã hoá bằng safeStorage (DPAPI trên Windows) — không lưu chữ thường (TC03).
// config.json: cấu hình riêng máy này (địa chỉ server...), không bí mật.
const fileOf = (name) => join(app.getPath('userData'), name)
const readJson = (name) => {
  try {
    return existsSync(fileOf(name)) ? JSON.parse(readFileSync(fileOf(name), 'utf8')) : {}
  } catch {
    return {}
  }
}
const writeJson = (name, data) => writeFileSync(fileOf(name), JSON.stringify(data), 'utf8')

function registerIpc() {
  ipcMain.handle('secure:get', (_e, key) => {
    const v = readJson('secure.json')[key]
    if (!v || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(v, 'base64'))
    } catch {
      return null
    }
  })
  ipcMain.handle('secure:set', (_e, key, value) => {
    if (!safeStorage.isEncryptionAvailable()) return false
    const all = readJson('secure.json')
    all[key] = safeStorage.encryptString(String(value)).toString('base64')
    writeJson('secure.json', all)
    return true
  })
  ipcMain.handle('secure:remove', (_e, key) => {
    const all = readJson('secure.json')
    delete all[key]
    writeJson('secure.json', all)
    return true
  })
  ipcMain.handle('config:get', () => readJson('config.json'))
  ipcMain.handle('config:set', (_e, patch) => {
    const next = { ...readJson('config.json'), ...patch }
    writeJson('config.json', next)
    return next
  })
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Quy định v5 §3: renderer không chạm Node.js; mọi việc của desktop đi qua preload (window.api).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Mở link ngoài (nếu có) bằng trình duyệt mặc định, không mở trong app
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Khi chạy "npm run dev": load từ Vite dev server (hot reload)
  // Khi build production: load qua app://medassist (xem serveApp)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL(APP_ORIGIN + '/index.html')
  }
}

// ---------- Chỉ tin chứng chỉ gốc (root CA) của dự án khi nói chuyện với máy chủ phòng khám (TC03, BC09) ----------
// File CA công khai (*.crt / *.pem) đặt ở thư mục certs/ (bản đóng gói: resources/certs — xem "build.extraResources" trong package.json).
// Với ĐÚNG máy chủ đã cấu hình, chứng chỉ chỉ được nhận khi: chuỗi chứng chỉ do CA của dự án ký, khớp tên máy / IP, còn hạn.
// Chứng chỉ do CA khác cấp (kể cả CA hệ điều hành tin) bị từ chối. Không bao giờ tắt kiểm tra chứng chỉ.
//  - Máy dev chưa có file CA → dùng kiểm tra mặc định của Chromium (-3), không hạ bảo mật;
//  - Bản đóng gói mà thiếu file CA → từ chối kết nối tới máy chủ (an toàn hơn là tin mọi CA).
const CERT_DIR = app.isPackaged ? join(process.resourcesPath, 'certs') : join(__dirname, '../../certs')
function loadProjectCAs() {
  try {
    return readdirSync(CERT_DIR)
      .filter((f) => /\.(crt|pem)$/i.test(f))
      .map((f) => new X509Certificate(readFileSync(join(CERT_DIR, f))))
      .filter((c) => c.ca)
  } catch {
    return []
  }
}
const PROJECT_CAS = loadProjectCAs()
// Máy mới cài chưa lưu serverUrl: renderer dùng địa chỉ mặc định này, main phải ghim CA cho đúng địa chỉ đó.
const DEFAULT_SERVER_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost'
const serverHost = () => {
  try {
    return new URL(readJson('config.json').serverUrl || DEFAULT_SERVER_URL).hostname
  } catch {
    return null
  }
}
function pinServerCertificate() {
  session.defaultSession.setCertificateVerifyProc((req, callback) => {
    if (req.hostname !== serverHost()) return callback(-3) // máy khác (không phải máy chủ phòng khám): kiểm tra mặc định
    if (!PROJECT_CAS.length) return callback(app.isPackaged ? -2 : -3)
    try {
      callback(verifyAgainstCAs(req, PROJECT_CAS) ? 0 : -2)
    } catch {
      callback(-2)
    }
  })
}

// Ô chọn ngày hiển thị dd/mm/yyyy (mặc định theo máy có thể là mm/dd/yyyy, dễ đọc nhầm ngày hẹn).
app.commandLine.appendSwitch('lang', 'en-GB')

app.whenReady().then(() => {
  serveApp()
  registerIpc()
  pinServerCertificate()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
