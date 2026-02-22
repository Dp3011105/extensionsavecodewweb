Extension nàyđược thiết kế để thu thập và lưu trữ toàn bộ các network requests (yêu cầu mạng) từ một tab trình duyệt, bao gồm nội dung thực tế của các tài nguyên như HTML, CSS, JS, hình ảnh, JSON, v.v. Nó sử dụng Chrome Debugger API để ghi lại dữ liệu mà không cần mở DevTools (F12), giúp vượt qua các trang web chặn mở công cụ developer. Kết quả được xuất ra file ZIP chứa:

File HAR (network_trace.har) để phân tích requests.
Các thư mục nguồn code (source_code theo domain), hình ảnh (images), và metadata (thống kê, sessions).
Trang index.html preview để xem tổng quan.

Extension hỗ trợ thu thập liên tục qua nhiều phiên (accumulated data), tránh tải trùng lặp file, và phù hợp để phân tích, lấy mã nguồn trang web mà không bị chặn.


CÁCH SỬ DỤNG :

Cài đặt extension:
Tải mã nguồn về máy (manifest.json, popup.html, background.js, popup.js, và thư mục libs chứa jszip.min.js).
Mở Chrome, truy cập chrome://extensions/.
Bật "Developer mode" (góc trên bên phải).
Chọn "Load unpacked" và tải thư mục chứa mã nguồn.
Extension sẽ xuất hiện với icon (mặc định là biểu tượng popup).

Mở extension và chuẩn bị:
Click icon extension để mở popup (giao diện tối giản với gradient đỏ).
Popup sẽ tự động hiển thị URL tab hiện tại (dưới phần "TRANG HIỆN TẠI").
Nếu muốn chọn tab khác: Click nút "Chọn tab" (🎯) để chọn tab cần phân tích (tạm thời lấy tab active; có thể nâng cấp sau để chọn từ danh sách).

Bắt đầu thu thập dữ liệu:
Đảm bảo tab đã chọn không phải trang hệ thống (chrome:// hoặc edge://).
Click nút "Bắt đầu" (⏺️) – extension sẽ attach debugger và bắt đầu ghi requests.
Popup sẽ hiển thị trạng thái "ĐANG THU THẬP" với đồng hồ đếm thời gian, số requests và files live (cập nhật mỗi 2 giây).
Lúc này, hãy tương tác với trang web (refresh, click link, submit form, v.v.) để ghi lại các requests. Extension sẽ tự động thu thập headers, timings, post data, và nội dung tài nguyên (HTML/CSS/JS/images).

Dừng và xuất file:
Khi đủ dữ liệu, click nút "Dừng & Xuất file" (⏹️) – extension sẽ dừng capture, tải nội dung file mới (nếu chưa có), tổng hợp dữ liệu từ các phiên trước (nếu có), và tạo file ZIP.
Quá trình sẽ hiển thị progress bar (từ 30% đến 100%).
File ZIP sẽ tự động tải về (tên dạng Website_YYYYMMDD_HHMM.zip), chứa:
index.html: Trang preview thống kê (tổng requests, files, sessions).
source_code/: Mã nguồn theo domain (ví dụ: example_com/index.html, styles.css).
images/: Hình ảnh tải về.
har_data/: File HAR và sessions (current_session.json, accumulated_sessions.json).
metadata.json: Thông tin tổng hợp.

Popup sẽ hiển thị thống kê kết quả (requests, resources, thời gian, dung lượng) trong panel "KẾT QUẢ XUẤT FILE".

Lưu ý khi sử dụng:
Quyền hạn: Extension yêu cầu quyền "debugger", "downloads", "activeTab", "storage" và host_permissions "<all_urls>" – chấp nhận khi cài.
Tránh lỗi: Đóng DevTools (F12) trước khi bắt đầu, vì debugger chỉ hoạt động khi không có debugger khác.
Thu thập liên tục: Nếu chạy nhiều lần, dữ liệu sẽ tích lũy (không tải trùng file), nhưng reset khi reload extension.
Giới hạn: Chỉ tải tài nguyên có MIME type phù hợp (HTML/CSS/JS/JSON/images/fonts); bỏ qua data: URLs hoặc non-HTTP.
Kiểm tra: Mở file ZIP để xem nội dung; dùng công cụ như HAR Analyzer để phân tích file HAR.
Debug: Nếu lỗi (ví dụ: "Đang có DevTools mở"), kiểm tra console background (chrome://extensions/ > Inspect views > background page).


Extension này đơn giản, hiệu quả cho developer muốn "lấy code" trang web chặn F12 mà không cần công cụ phức tạp. Nếu cần chỉnh sửa, có thể thêm filter options trong popup.js!
