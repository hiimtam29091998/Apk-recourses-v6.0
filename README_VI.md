# KHOÁNG THẠCH MOBILE v6.0 (Android, offline)

**Mục tiêu:** Biên dịch APK thật cho Samsung Galaxy S23 Ultra, không cần SciPy trên Android.

- Bộ tối ưu nguyên hỗn hợp (MILP) đã chuyển từ Python/SciPy sang JavaScript + **HiGHS WebAssembly 1.15.4**.
- Android chạy solver trên **Web Worker** của WebView. Khi sử dụng, không cần Internet hay Python server.
- Python/Chaquopy chỉ còn dùng **XlsxWriter** để xuất XLSX/CSV; không cài NumPy hoặc SciPy.
- Giữ các hồ sơ người chơi trong localStorage, sao lưu/nhập JSON, giao dịch gộp theo ngày và PDF song ngữ.
- Lịch 16/11/2026–30/04/2028: 532 ngày, 76 sự kiện, 19 Chợ lấp lánh.

## Build APK trên GitHub Actions (được khuyến nghị)

1. Cập nhật toàn bộ tệp trong gói dự án lên **cấp gốc** của repository `Apk-recourses-v5.0`, bao gồm `.github/workflows/build-apk.yml` và thư mục `app`.
2. Vào **Actions → Build Khoang Thach Android APK (HiGHS WASM) → Run workflow** (hoặc commit vào nhánh main để tự kích hoạt).
3. Workflow sẽ tải gói `highs@1.15.4` từ npm **trong lúc build**, sao chép `highs.js` và `highs.wasm` vào Android assets, kiểm tra solver thực trên Node, chạy kiểm thử xuất file và biên dịch APK bằng Gradle.
4. **Chỉ khi Actions báo dấu tích xanh**, tải artifact `Khoang-Thach-Mobile-HiGHS-WASM-APK`, giải nén và cài `app-debug.apk` trên Samsung.

> Bản ZIP này **không phải APK**. Nó chứa mã nguồn và quy trình build. Vì môi trường tạo tệp ở ChatGPT không có Android SDK và không thể truy cập npm để biên dịch, APK chỉ được xác nhận khi GitHub Actions thành công. Nếu workflow báo đỏ, cần đọc log trước khi thử cài.

### Cập nhật bằng Codespaces trên điện thoại

Tải `KhoangThach_Mobile_v6_HiGHS_WASM_PATCH.zip` vào thư mục gốc Codespaces đang mở. Trong Terminal:

```bash
unzip -o KhoangThach_Mobile_v6_HiGHS_WASM_PATCH.zip
bash tools/apply_patch.sh
rm KhoangThach_Mobile_v6_HiGHS_WASM_PATCH.zip
git add -A
git commit -m "Port MILP optimizer to offline HiGHS WebAssembly"
git push origin main
```

**Lưu ý:** Không tải ZIP như một tệp riêng vào repository rồi chạy workflow. Phải giải nén để giữ cấu trúc `app/...` và `.github/workflows/...`. Nên sao lưu hồ sơ JSON trước khi cập nhật ứng dụng Android; bản debug mới có thể được ký bằng khóa khác nên đôi khi cần gỡ bản cũ.

## Kiểm thử / kết quả đã kiểm chứng ở môi trường Python

- 23/23 bài thử v5 Python gốc đạt.
- Mô hình JS được đưa vào bộ giải SciPy/HiGHS thông qua một adapter kiểm thử độc lập: 3/3 cấu hình đối chiếu được 4 cấp ưu tiên với v5.
- Trường hợp mặc định: cốt lõi **76/76**, Chợ bổ sung **281/285**, vàng **152.000**; số dư cuối kỳ **3.604 đá tím**.
- XlsxWriter và mô-đun xuất CSV đã đọc thành công kết quả JSON do optimizer JavaScript tạo ra.
- **Chưa biên dịch/kiểm thử APK trên Galaxy S23 Ultra trong môi trường ChatGPT.** GitHub Actions bao gồm bước kiểm thử HiGHS WASM thật ở môi trường Node trước khi build Android.

## Phạm vi & giới hạn kỹ thuật

- Bộ giải Highs.js chạy trong worker, không sử dụng dịch vụ cloud. Dự án **không yêu cầu INTERNET permission** trong AndroidManifest.
- `app/src/main/assets/highs.js` và `highs.wasm` không nằm trong ZIP nguồn vì chỉ được tải từ npm **khi build**; workflow sẽ đưa trực tiếp vào APK.
- Module `reference/optimizer_scipy.py` chỉ để đối chiếu trên máy tính, không đóng gói trong APK.
- Android WebView sử dụng origin ảo `https://appassets.androidplatform.net/assets/` do ứng dụng phục vụ bằng local AssetManager, để Worker và WASM hoạt động dưới HTTPS origin. Đây không phải website yêu cầu kết nối Internet.
- Các file Python dùng cho xuất Excel/CSV không import SciPy/NumPy.

## Thư viện và bản quyền

HiGHS WebAssembly: https://www.npmjs.com/package/highs (MIT license). Chaquopy: https://chaquo.com/chaquopy/. XlsxWriter: https://xlsxwriter.readthedocs.io/.

Các thành phần có thể yêu cầu người phân phối tuân thủ giấy phép phần mềm tương ứng.
