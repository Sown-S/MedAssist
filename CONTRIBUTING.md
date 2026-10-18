# Quy ước làm việc với repo MedAssist

## 1. Nhánh

| Nhánh | Dùng cho | Ai merge |
|---|---|---|
| `main` | Bản đã chốt cuối mỗi sprint | Sơn, chỉ qua PR từ `develop` |
| `develop` | Nhánh tích hợp | Qua PR từ nhánh tính năng, CI phải xanh |
| `feature/backend-core` | Sơn | |
| `feature/desktop-ui` | Anh | |
| `feature/ai-module` | Huy | |
| `feature/knowledge-okf` | Tuấn | |

Luồng: nhánh tính năng → PR vào `develop` → cuối sprint PR `develop` → `main` và gắn tag.

## 2. Quy ước commit và tiêu đề PR (Conventional Commits)

```
loại(phạm-vi): mô tả ngắn bằng tiếng Việt
```

| loại | Khi nào |
|---|---|
| `feat` | Tính năng mới |
| `fix` | Sửa lỗi |
| `data` | Dữ liệu: danh mục thuốc, OKF, seed |
| `test` | Chỉ thêm/sửa test |
| `docs` | Tài liệu, README |
| `refactor` | Sửa cấu trúc code, không đổi hành vi |
| `build` / `ci` | Docker, đóng gói, GitHub Actions |
| `chore` | Việc lặt vặt khác |
| `release` | PR `develop` → `main` cuối sprint |

Phạm vi gợi ý: `server`, `client`, `ai`, `okf`, `db`, `drug`, `deploy`, `tools`.

Ví dụ:
- `feat(server): API lịch sử khám và tra cứu nhanh bệnh nhân`
- `fix(server): thu hồi token khi đổi mật khẩu`
- `data(okf): thêm nhóm bệnh hô hấp`
- `release: Sprint 3`

CI chỉ kiểm tiêu đề PR (vì nhóm squash merge, tiêu đề PR thành commit trên `develop`).
Commit lẻ trong nhánh của mình nên theo quy ước nhưng không bắt buộc. Không sửa lại lịch sử commit cũ.

## 3. Trước khi mở PR

```powershell
cd server
python -m pytest            # phải pass hết
python -m alembic check     # nếu có đổi model / migration
```

CI (`.github/workflows/ci.yml`) chạy lại các bước trên trên máy GitHub; PR chỉ merge khi CI xanh.

## 4. Cuối sprint: phát hành lên `main`

1. Mở PR `develop` → `main`, tiêu đề `release: Sprint N`, mô tả liệt kê card đã xong.
2. CI xanh → **Merge commit** (không squash, để giữ lịch sử của `develop`).
3. Gắn tag trên `main`:
   ```powershell
   git checkout main
   git pull
   git tag -a v0.N-sprintN -m "Kết thúc Sprint N"
   git push origin v0.N-sprintN
   ```
4. Trên Trello: chỉ kéo card sang Done khi PR chứa code của card đã merge vào `develop`.
