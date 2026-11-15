# Hướng dẫn nâng cấp v6.1 -> v7.0

- Sao lưu JSON trong giao diện trước khi cập nhật.
- Với repository Android v6.1, tải `KhoangThach_v7_PATCH_GitHub.zip` và giải nén ở cấp root (KHÔNG tạo thư mục con cho ZIP), sau đó `git add -A && git commit -m "Upgrade to v7" && git push origin main`.
- Với repository trống, dùng **Android Source.zip** thay vì PATCH.
- Không cần chạy `tools/apply_patch.sh`; nội dung ZIP đã giữ đúng đường dẫn root.
- Sau khi commit, GitHub Actions sẽ chạy kiểm thử dynamic engine, HiGHS WASM thật, export, build APK; chỉ cài APK khi job xanh.
- Kết quả v6.1 không bị mất vì `localStorage` giữ cùng khóa hồ sơ. Cấu hình v6.1 được migrate (`silver_used_nov` -> `silver_used_month`; `gold_used_nov` -> `gold_used_month`).
- Tính năng động yêu cầu nhập trạng thái đầu ngày. Thu nhập 1.176 đá/xưởng/ngày là giả định thu đủ, người dùng cần nhận trước khi dùng.
