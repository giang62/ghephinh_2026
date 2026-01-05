# Trò chơi mini (Next.js)

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Luồng chơi

- Trang chủ: chọn 1 trong 2 game → tạo phòng
- Quản trò: chia sẻ link/QR, chỉnh thời gian, bấm **Bắt đầu**
- Người chơi: vào link/QR, nhập tên, chờ bắt đầu, chơi, nộp kết quả

Lưu ý: phòng được lưu trong bộ nhớ (server restart là mất).

## Deploy Vercel (quan trọng)

Nếu deploy lên Vercel mà không bật lưu trữ (KV/DB), phòng sẽ bị “mất” giữa các request (serverless), dẫn tới lỗi **“Không tìm thấy phòng”** khi người chơi vào bằng link/QR.

Khuyến nghị: dùng **Redis serverless** (Vercel KV hoặc Upstash Redis).

- Cách 1 (theo guide “Redis serverless” của Vercel): dùng `REDIS_URL` (node-redis). Vào **Project → Settings → Environment Variables** thêm `REDIS_URL` (bật cho **Preview** và **Production**).
- Cách 2: bật **Vercel KV** và để Vercel tự thêm env `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
- Cách 3: dùng **Upstash Redis REST** và thêm env `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

Kiểm tra nhanh sau khi deploy: mở `https://<your-domain>/api/health` và đảm bảo `kvConfigured: true`.
