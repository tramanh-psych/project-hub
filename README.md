# Project Hub · Quản lý dự án · 项目管理

Một web nhỏ để quản lý tập trung nhiều dự án nghiên cứu. Thành viên đăng nhập để cập nhật tiến độ và nộp bài.

- **Không cần máy chủ riêng.** Giao diện là file tĩnh (chạy trên GitHub Pages). Dữ liệu và đăng nhập do Supabase lo (miễn phí).
- **Không dùng CDN hay dịch vụ Google.** Mọi file JS/CSS nằm ngay trong repo, để người ở Trung Quốc không bị chặn.
- **3 ngôn ngữ:** Tiếng Việt, 中文, English. Mỗi người tự chọn.

## Chức năng

| | Bạn (admin / phụ trách) | Thành viên |
|---|---|---|
| Tổng quan nhiều dự án, nhắc quá hạn / sắp đến hạn | ✓ tất cả dự án | ✓ dự án mình tham gia |
| Biểu đồ: % hoàn thành (theo giờ công), trạng thái, theo giai đoạn, lịch trình (Gantt) | ✓ | ✓ |
| Thêm / sửa / giao việc, deliverable, tiêu chí, nơi nộp | ✓ | – |
| Cập nhật tiến độ + ghi chú | ✓ | ✓ chỉ việc của mình |
| Đánh dấu **Hoàn thành** | ✓ (duyệt) | – (chỉ “Đã nộp – chờ duyệt”) |
| Nộp bài (link WPS / Drive) | thấy **tất cả** | chỉ thấy **bài của mình** |
| Tài liệu & quyền (Hạn chế / Kiểm soát / Cộng tác) | ✓ tick ai được xem | chỉ thấy cái được chia sẻ |
| Hiệu suất từng người, đóng góp %, CRediT | ✓ | chỉ thấy dòng CRediT của mình |
| Nhật ký đóng góp (ai đổi gì, lúc nào) | ✓ | lịch sử việc của mình |
| Ghi chú riêng cho từng việc | ✓ | – |
| Checklist bảo vệ nghiên cứu (8 mục) | ✓ | – |
| Xuất lịch `.ics` (nhắc trước 2 ngày), xuất Excel `.csv` | ✓ | ✓ |

Quyền được kiểm tra ở **cơ sở dữ liệu** (Row-Level Security trong `supabase/schema.sql`), không chỉ ở giao diện. Dù ai đó sửa code trên máy họ thì cũng không đọc được dữ liệu không thuộc quyền của họ.

Mỗi dự án có tuỳ chọn **“Thành viên được xem”**:
- *Tất cả việc*: minh bạch, giống file Excel chung.
- *Chỉ việc của mình*: nguyên tắc quyền tối thiểu.

## Xem thử ngay (không cần cài gì)

Khi `js/config.js` còn để trống, web tự chạy **bản demo** với dữ liệu giả. Ở thanh trên cùng có ô **“Xem với vai trò”**: chọn một thành viên để thấy đúng những gì họ thấy.

```bash
cd project-hub && python3 -m http.server 8000   # rồi mở http://localhost:8000
```

---

## Cài đặt thật (khoảng 20 phút)

### Bước 1 – Tạo repo GitHub riêng
1. Trên GitHub bấm **New repository**, đặt tên ví dụ `project-hub`, chọn **Public**. GitHub Pages miễn phí cần repo public. Code public không sao vì dữ liệu nằm trong Supabase và được khoá bằng RLS.
2. Đưa toàn bộ nội dung thư mục `project-hub/` này vào repo mới. Tôi có thể làm bước này cho bạn khi repo đã tạo xong.

### Bước 2 – Tạo Supabase
1. Vào <https://supabase.com>, chọn **Sign in with GitHub**, rồi **New project**.
   - Region: **Southeast Asia (Singapore)**. Đây là vùng gần cả Trung Quốc lẫn Việt Nam.
   - Đặt database password và lưu lại.
2. Vào **SQL Editor → New query**, dán toàn bộ `supabase/schema.sql` rồi bấm **Run**.
3. Vào **Authentication → Sign In / Providers → Email**:
   - **Tắt “Confirm email”.** Máy chủ email mặc định của Supabase chỉ gửi được rất ít thư (và chỉ cho thành viên team Supabase), nên người khác sẽ không nhận được thư xác nhận. Ai có tài khoản thì đều do bạn đã thêm email của họ vào dự án, nên tắt bước này vẫn an toàn.
   - Nếu sau này muốn có “Quên mật khẩu” qua email, hãy cài SMTP riêng (Resend, Brevo…) ở **Authentication → Emails → SMTP**. Trước đó, ai quên mật khẩu thì bạn đặt lại giúp ở **Authentication → Users**.
4. Vào **Authentication → URL Configuration**: đặt **Site URL** = địa chỉ web ở bước 4, ví dụ `https://<tên-github>.github.io/project-hub/`.
5. Vào **Project Settings → API** (hoặc nút **Connect**), copy **Project URL** và khoá **anon / publishable**.

### Bước 3 – Nối web với Supabase
Mở `js/config.js` và điền 2 giá trị vừa copy:
```js
window.HUB_CONFIG = {
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ... hoặc sb_publishable_...',
};
```
Khoá anon được phép công khai. **Tuyệt đối không** dán khoá `service_role` hay `secret` vào đây.

### Bước 4 – Bật GitHub Pages
Repo → **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, thư mục `/ (root)`. Khoảng một phút sau, web chạy ở `https://<tên-github>.github.io/project-hub/`.

### Bước 5 – Tạo tài khoản admin cho bạn
1. Mở web, bấm **Tạo tài khoản** và đăng ký bằng email của bạn.
2. Trong Supabase **SQL Editor**, chạy:
   ```sql
   update public.profiles set is_admin = true where email = 'email-cua-ban@gmail.com';
   ```
3. Tải lại trang. Bạn sẽ thấy nút **＋ Dự án mới**.

### Bước 6 – Nhập dự án Houcanbei từ Excel
File `seed_houcanbei.sql` (tôi gửi riêng, **không** để trong repo vì có tên thật của thành viên) chứa sẵn 5 thành viên, 9 giai đoạn và 65 công việc. Mở **SQL Editor**, dán file đó vào rồi bấm **Run**. Bạn được gán làm `TA` (phụ trách).

Với file Excel khác cùng mẫu:
```bash
pip install openpyxl
python3 scripts/import_xlsx.py file.xlsx --code ABC --name "Tên dự án" --lead TA > seed.sql
```
Hai dự án còn lại (*Familiar but wrong*, *PTSD*) tạo nhanh bằng nút **＋ Dự án mới**.

### Bước 7 – Mời thành viên
1. Vào dự án, tab **Thành viên**, bấm ✎ ở từng người và nhập **email** của họ.
2. Gửi họ link web. Họ bấm **Tạo tài khoản** bằng **đúng email đó** và sẽ tự vào được dự án.
3. Trước tiên, gửi cho thành viên ở Trung Quốc link **`…/project-hub/check.html`**. Họ tắt VPN, mở link rồi chụp màn hình gửi lại. Nếu cả hai dòng đều ✓ thì dùng được không cần VPN.

---

## Về truy cập từ Trung Quốc (đọc kỹ)

- Web không gọi bất kỳ dịch vụ nào của Google hay CDN nước ngoài. Chỉ có 2 địa chỉ: `*.github.io` (giao diện) và `*.supabase.co` (dữ liệu).
- Hiện thường vào được cả hai từ Trung Quốc mà không cần VPN, nhưng **không có gì đảm bảo**: có thể chậm hoặc thỉnh thoảng bị chặn tuỳ nhà mạng. Vì vậy hãy kiểm tra bằng `check.html` trước khi dùng chính thức.
- Nếu `github.io` bị chặn: có thể chuyển giao diện sang host khác chỉ bằng cách copy file (không phải sửa code).
- Nếu `supabase.co` bị chặn: cần một host dữ liệu đặt tại Trung Quốc. Việc này phức tạp hơn (thường cần đăng ký ICP). Báo tôi để tính phương án.

## Nhắc hạn qua email (tuỳ chọn)

Mặc định web đã nhắc ngay trên trang tổng quan (quá hạn / còn ≤ 3 ngày). Ngoài ra mỗi người có thể bấm **Thêm vào lịch (.ics)** để điện thoại tự nhắc trước 2 ngày.

Nếu muốn có email hằng ngày:
1. Tạo tài khoản <https://resend.com> (miễn phí 3.000 thư/tháng) và lấy API key.
2. Cài [Supabase CLI](https://supabase.com/docs/guides/cli), rồi chạy:
   ```bash
   supabase link --project-ref <ref>
   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Project Hub <onboarding@resend.dev>" APP_URL=https://<you>.github.io/project-hub/ CRON_TOKEN=<chuỗi-ngẫu-nhiên-dài>
   supabase functions deploy deadline-reminder --no-verify-jwt
   ```
3. Lên lịch chạy 8:00 sáng giờ Bắc Kinh (00:00 UTC). Trong **Database → Extensions**, bật `pg_cron` và `pg_net`, rồi chạy SQL sau:
   ```sql
   select cron.schedule('deadline-reminder', '0 0 * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/deadline-reminder',
       headers := jsonb_build_object('x-cron-token', '<chuỗi-ngẫu-nhiên-dài>'));
   $$);
   ```

## Cấu trúc

```
index.html            trang chính
check.html            trang kiểm tra kết nối (gửi cho thành viên ở Trung Quốc)
css/app.css           giao diện (sáng / tối, dùng được trên điện thoại)
js/config.js          ← điền URL + anon key Supabase
js/main.js            đăng nhập, khung trang, tổng quan, tài khoản
js/project.js         các tab của một dự án
js/charts.js          biểu đồ (SVG/HTML, không thư viện ngoài)
js/api.js             kết nối Supabase
js/demo.js            bản demo chạy trong trình duyệt
js/i18n.js            chữ Việt / 中文 / English
js/vendor/supabase.js supabase-js 2.117.2 (MIT), để sẵn trong repo, không tải từ CDN
supabase/schema.sql   bảng + quyền (RLS) + trigger nhật ký
supabase/functions/   email nhắc hạn (tuỳ chọn)
scripts/import_xlsx.py chuyển file Excel tiến độ thành SQL
```

## Bảo mật & dữ liệu

- Không lưu dữ liệu định danh người tham gia nghiên cứu (raw data) trong web này. Web chỉ lưu **link** tới nơi lưu trữ được tổ chức phê duyệt.
- Quyền trong web chỉ quyết định ai **thấy link**. Hãy đặt quyền tương ứng trong WPS / Google Drive.
- Sao lưu: trong Supabase, **Database → Backups** (gói miễn phí giữ 7 ngày). Hoặc bấm **Xuất Excel** ở mỗi dự án.
