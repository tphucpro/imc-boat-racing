# 🏆 IMC BOAT RACING

Game đua thuyền giải toán nhiều người chơi cho sinh hoạt CLB Toán - Tin.
Mỗi đội có **4 Người Chèo** (giải toán) + **1 Hoa Tiêu** (mua vật phẩm). Người chơi **quét QR bằng điện thoại**
là vào đúng đội, đúng vai trò — không cần cùng WiFi, không cần cùng mạng LAN, không cần nhập IP.

> Chạy trên Node.js + Express + Socket.IO + Phaser. Không cần database. Không cần file ảnh/âm thanh (đều tự sinh bằng code).

---

## 1. Cấu trúc thư mục

```
imc-boat-racing/
├── package.json
├── server.js            # Express + Socket.IO + sinh QR
├── game.js              # Toàn bộ luật chơi (đội, câu hỏi, vật phẩm, Thuyền Vương…)
├── questions.js         # Câu hỏi mặc định (admin có thể sửa ngay trên web)
├── test/simulate.js     # Mô phỏng kiểm tra luật chơi:  npm test
├── render.yaml  Dockerfile  Procfile      # file triển khai
└── public/              # TẤT CẢ file client nằm ở đây (express.static)
    ├── index.html       # Trang quản trị (admin)
    ├── display.html     # Màn hình lớn (chiếu cho cả lớp)
    ├── play.html        # Trang điện thoại (Người Chèo / Hoa Tiêu)
    ├── js/ admin.js display.js play.js sfx.js
    ├── css/ style.css
    └── sounds/ images/ assets/   # để trống, dùng khi bạn muốn thêm file riêng
```

---

## 2. Cài đặt và chạy thử

Cần Node.js ≥ 18.

```bash
npm install
npm start
npm test        # (tuỳ chọn) chạy mô phỏng kiểm tra luật chơi, không cần mạng
```

Mở `http://localhost:3000` để xem trang quản trị.

⚠️ **localhost chỉ để thử trên máy bạn.** Điện thoại ở nơi khác KHÔNG vào được `localhost`.
Vì vậy ở chế độ localhost, mã QR bị tắt có chủ đích (để không bao giờ sinh QR sai). Muốn chơi thật hãy **deploy** (mục 3).

Muốn thử nhanh trên máy bạn: mở trang quản trị → **Danh sách link** → mở các link `play.html?team=1&role=p1`… trong nhiều tab.
Hoặc chạy `ALLOW_LOCAL_QR=1 npm start` (chỉ để thử, QR sẽ trỏ về localhost).

### Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng. Render/Railway/Fly tự đặt, không cần làm gì. |
| `ADMIN_KEY` | **Mật khẩu trang quản trị. NÊN đặt khi deploy.** Nếu bỏ trống, ai có link cũng điều khiển được game. |
| `PUBLIC_URL` | URL công khai (vd `https://imcboatracing.onrender.com`). Thường **không cần** vì Render/Railway/Fly được tự nhận diện; VPS dùng domain qua Nginx cũng tự nhận từ header. Chỉ đặt nếu QR ra sai địa chỉ. |
| `ALLOW_LOCAL_QR` | `1` = cho phép sinh QR từ localhost (chỉ để thử). |

---

## 3. Deploy lên Internet

Sau khi deploy bạn có link dạng `https://imcboatracing.onrender.com`. Mở **link đó** (không phải localhost) → vào trang quản trị → QR tự sinh từ chính link công khai này.

Trước tiên đưa mã nguồn lên GitHub (Render/Railway/Fly đều lấy code từ đó):
```bash
git init && git add . && git commit -m "IMC Boat Racing"
# tạo repo trên GitHub rồi: git remote add origin ... && git push -u origin main
```

### 3.1 Render (dễ nhất, có gói miễn phí)
**Cách nhanh (Blueprint):** Render → *New* → *Blueprint* → chọn repo. File `render.yaml` đã cấu hình sẵn và tự sinh `ADMIN_KEY`.

**Cách thủ công:** *New* → *Web Service* → chọn repo →
- Runtime: **Node** · Build Command: `npm install` · Start Command: `npm start`
- Health Check Path: `/healthz`
- *Environment*: thêm `ADMIN_KEY` = mật khẩu bạn chọn.

Xong, mở `https://<tên-app>.onrender.com`. Lưu ý gói free sẽ "ngủ" sau ~15 phút không dùng và mất ~30–60 giây để thức dậy: **hãy mở link trước giờ sinh hoạt vài phút.**

### 3.2 Railway
*New Project* → *Deploy from GitHub repo* → chọn repo. Railway tự nhận Node và chạy `npm start`.
Vào *Settings* → *Networking* → **Generate Domain** để lấy link công khai (Railway tự cung cấp biến `RAILWAY_PUBLIC_DOMAIN`, game tự dùng).
Vào *Variables* → thêm `ADMIN_KEY`.

### 3.3 VPS (Ubuntu 22.04/24.04)
```bash
# 1) Cài Node 20 và công cụ
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx
sudo npm i -g pm2

# 2) Lấy code và chạy
git clone <repo-của-bạn> imc-boat-racing && cd imc-boat-racing
npm install --omit=dev
ADMIN_KEY=matkhau123 PORT=3000 pm2 start server.js --name imc
pm2 save && pm2 startup        # tự chạy lại khi khởi động lại máy
```
Nginx (bắt buộc có phần `Upgrade` để WebSocket hoạt động) — tạo `/etc/nginx/sites-available/imc`:
```nginx
server {
  server_name game.tenmiencuaban.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 120s;
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/imc /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d game.tenmiencuaban.com   # HTTPS
```
Mở firewall cổng 80/443. Nếu QR ra sai địa chỉ, thêm `PUBLIC_URL=https://game.tenmiencuaban.com`.

### 3.4 Fly.io
```bash
fly launch            # dùng Dockerfile có sẵn, chọn region gần bạn, KHÔNG tạo database
fly secrets set ADMIN_KEY=matkhau123
fly deploy
```
Trong `fly.toml` đặt `internal_port = 3000`, `min_machines_running = 1` và **chỉ chạy 1 máy** (`fly scale count 1`) vì trạng thái trận đấu nằm trong bộ nhớ.

> ⚠️ Chỉ chạy **1 instance** (đừng bật auto-scale nhiều máy) — trạng thái trận đấu giữ trong RAM của tiến trình.

---

## 4. Cách tổ chức một buổi chơi

1. Mở `https://<link-của-bạn>` → nhập `ADMIN_KEY`.
2. **Thiết lập:** số đội (1–50), thời gian (phút), số đoạn đường, danh sách câu hỏi, câu hỏi Thuyền Vương, tên đội → **Lưu & tạo đội**.
3. Bấm **Mở màn hình lớn** (hoặc mở `/display.html`) trên máy chiếu; bấm nút âm thanh một lần để bật tiếng.
4. Mục **Mã QR** → **Hiện mã QR** / **In mã QR**. Mỗi đội có 5 mã: Chèo 1, 2, 3, 4 và Hoa Tiêu. Phát cho từng người (hoặc gửi link qua Zalo/Messenger ở mục *Danh sách link*).
5. Mọi người quét QR → tự vào đúng vai trò. Bảng *Trạng thái các đội* cho thấy ai đã online.
6. Bấm **▶ Bắt đầu trận**. Dùng **Làm lại** để chơi ván mới.

Nhập câu hỏi — mỗi dòng: `Câu hỏi | Đáp án | Độ khó (1-3, có thể bỏ trống)`. Đáp án số chấp nhận `1.25`, `1,25`, `5/4`. Độ khó bỏ trống sẽ tự chia dễ → khó theo thứ tự.
Câu Thuyền Vương: `Câu hỏi | Đáp án`.

---

## 5. Luật chơi (đúng như thiết kế)

- **Người Chèo** mỗi người nhận câu hỏi **riêng**. Đúng: +1 ⚡ năng lượng và +10 💰 (chuyển cho Hoa Tiêu). Sai: bị chặn 3–5 giây. Độ khó tăng dần theo thời gian trận.
- **4 năng lượng = thuyền tiến 1 đoạn.**
- **Shop (Hoa Tiêu):** ❄️ Băng Sương 50 (đóng băng đối thủ 3s) · 🔓 Mở Trói 40 · ⚡ Tốc Biến 60 (2s) · 🛡 Khiên Hộ Mệnh 50 (chặn 1 đòn) · 🎲 Hòm Bí Ẩn 40 · 🌪 Gió Thuận 70 (+25% tốc độ, 5s) · ⚓ Mỏ Neo 70 (−50% tốc độ đối thủ, 4s).
  Thuyền bị đóng băng thì không tiến và Người Chèo bị khoá trả lời.
- **Kết thúc sớm:** từ 50% thời gian, nếu đội nhất dẫn đội nhì ≥ 25% đường đua → đếm ngược 15 giây, hiện vạch đích, rồi kết thúc.
- **👑 Thuyền Vương:** ở 15% thời gian cuối, nếu chưa đội nào vượt trội: mọi thuyền dừng, vật phẩm bị khoá, màn hình lớn hiện câu hỏi chung. Mỗi đội gửi **1** đáp án; đội đúng nhanh nhất tăng tốc lao về đích và thắng. Nếu 45 giây không ai đúng sẽ sang câu tiếp theo.

Các con số (giá, thời gian, ngưỡng…) nằm ở đầu file `game.js` (`CFG`, `ITEMS`) để bạn tinh chỉnh.

---

## 6. Vì sao các lỗi cũ không còn xảy ra

| Lỗi trước đây | Cách khắc phục |
|---|---|
| `Cannot GET /display.html`, `display.js 404`, MIME type | Mọi file client nằm trong `public/`, phục vụ bằng `express.static(path.join(__dirname,"public"))`. Khi khởi động server tự kiểm tra các file bắt buộc và in cảnh báo nếu thiếu. Đường dẫn trong HTML dùng đường dẫn tuyệt đối `/js/...`, `/css/...`. |
| socket.io không kết nối | Client dùng `io()` cùng origin, không hard-code địa chỉ. Server dùng `trust proxy` + `cors` + tự kết nối lại; hướng dẫn Nginx có `Upgrade`. |
| QR không vào được / localhost | QR luôn sinh từ **URL công khai** (`PUBLIC_URL` → biến của Render/Railway/Fly → header proxy). Nếu là localhost/IP nội bộ, QR bị tắt và admin thấy cảnh báo đỏ. |
| Số đội cố định | Số đội 1–50 do admin nhập; làn đua, bảng xếp hạng, QR tự mở rộng. |
| Không nhập được dữ liệu | Admin nhập số đội, thời gian, câu hỏi, câu Thuyền Vương ngay trên web (lưu vào `data/config.json` nếu hosting cho ghi). |
| `npm start` chạy nhưng không chơi được | Đủ gameplay từ đầu đến cuối; `npm test` mô phỏng cả ván (đúng/sai, vật phẩm, kết thúc sớm, Thuyền Vương). |
| Server chạy nhưng client không nhận dữ liệu | Màn hình lớn nhận `state` 4 lần/giây, điện thoại nhận `me` 2 lần/giây (chỉ dữ liệu đội mình); tự `join` lại khi mất mạng. |

## 7. Lưu ý vận hành

- **Chống gian lận:** đáp án đúng không bao giờ được gửi xuống điện thoại; server tự chấm.
- **Quét lại QR:** mỗi vai trò chỉ một thiết bị; thiết bị mới thay thế thiết bị cũ (có thông báo).
- **Mất mạng:** điện thoại tự kết nối lại và vào lại đúng vai trò (vẫn giữ thời gian bị chặn).
- Trạng thái trận nằm trong RAM: khởi động lại server giữa trận sẽ mất trận đó (cấu hình vẫn được giữ nếu hosting cho ghi file).
- Màn hình lớn cần Internet để tải Phaser và font từ CDN.
- Âm thanh được tổng hợp bằng WebAudio; trình duyệt chỉ phát tiếng sau khi bạn chạm/bấm một lần trên trang.
