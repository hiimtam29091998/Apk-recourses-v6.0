# Khoáng Thạch v7.1 FINAL – ghi chú nâng cấp

**Chỉ thay đổi luật Chợ lấp lánh** so với v7.0:
- Cốt lõi: 6 × 5.000 bạc, không đổi.
- Bổ sung: tối đa **12 × 10.000 bạc** (trước là 15), nghĩa là **150.000 bạc/kỳ Chợ** khi mua đủ cả hai nhóm.
- Mô hình MILP, bộ giải JS HiGHS WebAssembly, mô hình Python SciPy, kiểm tra snapshot, form nhập lượt đã mua, tệp Excel/CSV, bộ kiểm thử và tài liệu đã được cập nhật.
- Kết quả mẫu mặc định 16/11/2026–30/04/2028: 76/76 cốt lõi; 228/228 lượt Chợ; 205.000 vàng, 3.604 đá tím cuối kỳ.
- Hồ sơ 9.650 đá ban đầu và boss 5,92G: 206.000 vàng, 3.322 đá cuối kỳ.
- Mốc **ĐẦU NGÀY**, ngày đích tùy chọn, 4 ngôn ngữ (vi/en/zh-Hant/ja) và lưu hồ sơ vẫn được giữ.

## Cài vào GitHub Codespaces
Với repository v7.0 hiện có, tải PATCH ZIP vào thư mục gốc, mở terminal, chạy:

```bash
cd "$(git rev-parse --show-toplevel)"
unzip -o KhoangThach_v7_1_FINAL_PATCH_GitHub.zip
rm KhoangThach_v7_1_FINAL_PATCH_GitHub.zip
git add -A
git commit -m "Release Khoang Thach v7.1 FINAL (12 Market bonuses)"
git push origin HEAD:main
```

Nếu repo trống, thay bằng gói **KhoangThach_v7_1_FINAL_Android_Source.zip**.

## Cảnh báo
- Nếu đã lưu ảnh/snapshot cũ có 13–15 lượt bổ sung đã mua trong một sự kiện, giá trị đó không phù hợp giới hạn mới 12 lượt; ứng dụng từ chối thay vì âm thầm điều chỉnh. Hãy xem lại trạng thái thực tế.
- Workflow cần kết nối Internet **chỉ lúc build** để tải `highs@1.15.4`. APK sau khi build đóng gói toàn bộ WASM và chạy offline.
- APK chưa được biên dịch/xác minh tại đây; không phát hành APK giả.
- Sao lưu hồ sơ ra JSON trước khi nâng cấp APK, nhất là khi cài APK debug có chữ ký khác.
