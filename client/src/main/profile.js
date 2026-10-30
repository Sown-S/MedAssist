// Hồ sơ dữ liệu riêng để mở nhiều vai trò trên một máy khi test: MedAssist.exe --profile=bacsi.
// Không có tham số thì dùng thư mục userData mặc định, máy phòng khám không bị ảnh hưởng.
const PREFIX = '--profile='
const NAME_RE = /^[A-Za-z0-9-]{1,32}$/

export function profileFromArgs(argv) {
  const arg = argv.find((a) => a.startsWith(PREFIX))
  if (!arg) return null
  const name = arg.slice(PREFIX.length)
  // Tên ghép vào đường dẫn thư mục: chỉ nhận chữ, số, gạch ngang để không ghi ra ngoài appData.
  return NAME_RE.test(name) ? name.toLowerCase() : null
}
