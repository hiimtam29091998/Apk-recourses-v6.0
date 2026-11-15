KHOÁNG THẠCH v7.1 FINAL · CHỢ LẤP LÁNH: 6 × 5.000 BẠC CỐT LÕI + TỐI ĐA 12 × 10.000 BẠC BỔ SUNG = 150.000 BẠC/KỲ.

# KHOÁNG THẠCH MOBILE v7.1 FINAL | Android offline + HiGHS WebAssembly

**Trạng thái:** Mã nguồn và kiểm thử trên môi trường xây dựng đã chuẩn bị. **Chưa có APK được biên dịch và xác minh trên thiết bị** trong môi trường này. GitHub Actions sẽ tải gói HiGHS WebAssembly và biên dịch APK.

## Quy tắc Chợ lấp lánh trong v7.1 FINAL

- Mỗi lần Chợ: **6 lượt cốt lõi × 5.000 bạc** + **tối đa 12 lượt bổ sung × 10.000 bạc**.
- **Tổng chi phí tối đa 150.000 bạc/lần Chợ**. Số lượt bổ sung của 19 kỳ là **228/228** nếu mua đủ.
- Với hồ sơ mặc định (9.052 đá đầu kỳ, boss 5,82G) trong 16/11/2026–30/04/2028: **76/76 cốt lõi, 228/228 lượt Chợ, 205.000 vàng, 3.604 đá cuối kỳ**. Với hồ sơ Tâm (9.650 đá, boss 5,92G): **206.000 vàng, 3.322 đá cuối kỳ**. Các kết quả trên đã xác minh bằng Python SciPy và JS mô hình với bộ giải SciPy.
- Các ảnh và dữ liệu **v6/v7 cũ ghi 15 lượt/Chợ không còn áp dụng**. Số lượt đã mua trước ngày bắt đầu phải nằm trong khoảng 0–12 khi đang giữa kỳ Chợ.

## Thay đổi kế thừa từ v7.0

1. **Ngày bắt đầu** và **ngày đích** do người dùng nhập, không cố định ngày 30/04/2028.
2. Nhập số dư **đá tím và bạc thực tế ĐẦU NGÀY**. Hôm đó chưa nhận thưởng boss, liên minh hay xưởng. Không cộng lại thu nhập của các ngày trước.
3. Nhập số bạc **đã đổi trong tháng bắt đầu** (0-250.000), lượt đổi vàng **đã dùng trong tháng bắt đầu** (0-24), không nhầm bạc tồn với hạn mức tháng.
4. Nếu đang ở giữa một sự kiện, nhập số **lượt cốt lõi và lượt Chợ bổ sung đã mua trước ngày chốt**. Không trừ phí các lượt đã mua thêm lần nữa. Phần thưởng cũ đã được phản ánh vào số dư đầu ngày.
5. Ngôn ngữ giao diện **vi, en, zh-Hant (phồn thể), ja**; ngôn ngữ báo cáo riêng, có thể đổi mà không mất hồ sơ.
6. Ghi nhiều snapshot kế hoạch cho từng người chơi, so sánh/khôi phục kế hoạch trước.
7. Excel/CSV/PDF dựa trên kỳ đang chọn; PDF tạo từ hộp thoại in Android.

## Thứ tự tối ưu

Đạt số sự kiện cốt lõi tối đa → đạt số lượt cốt lõi tối đa → mua tối đa tổng lượt Chợ bổ sung → mua tối đa vàng → ưu tiên các Chợ sớm nhất → tối ưu thời điểm đổi vàng.

Sử dụng **MILP HiGHS WASM trong Web Worker** hoàn toàn offline trên Android. Không gỡ bỏ thuật toán hay đổi sang heuristic. Phần xuất XLSX/CSV dùng Python Chaquopy và XlsxWriter, không có SciPy trên điện thoại.

## Hạn chế đã xác định

- Quy luật sự kiện được suy ra từ chu kỳ bắt đầu **16/11/2026**; chưa có nguồn game xác nhận chu kỳ trước thời điểm này nên ngày bắt đầu phải từ **16/11/2026** trở đi.
- Giới hạn thực dụng tối đa **10 năm** cho mỗi lần lập kế hoạch; với khoảng rất dài mô hình MILP có thể tốn RAM và thời gian. HiGHS phải chứng minh được nghiệm tối ưu, nếu không ứng dụng báo lỗi thay vì tạo lịch không kiểm chứng.
- Tài nguyên được tính theo **từng ngày**, không theo từng giờ; xưởng giả định thu đủ 8 lần (147 đá/lần) trong ngày. Nếu dự kiến dùng số đá kiếm được trong ngày, cần thực hiện giao dịch **sau khi thực nhận**; không phải có 1.176 đá ngay từ 00:00.
- Vàng được gom vào cuối tháng hoặc ngày đích, không bắt buộc người chơi phải đổi đúng một lượt tại thời điểm đó.
- Nếu phiên bản Android mới dùng khóa ký debug khác, có thể cần gỡ phiên bản cũ. **Sao lưu JSON trước khi thay phiên bản**.
- Đã kiểm thử đối chiếu mô hình JS↔Python bằng SciPy trên 6 trường hợp ngắn và Python với trường hợp cũ 532 ngày. **Chưa chạy HiGHS WASM bản npm thật trong môi trường này**, nên cần dựa trên kết quả GitHub Actions.

## Build APK bằng GitHub Actions

1. Tải ZIP **mã nguồn Android v7.1 FINAL**, giải nén **vào thư mục gốc** repository có nhánh `main`, đảm bảo thấy `.github/workflows/build-apk.yml`, `app/`, `tests/` và `build.gradle` ở cùng cấp.
2. Commit và push; hoặc vào tab **Actions → Build Khoang Thach v7.1 FINAL Android APK → Run workflow**.
3. Workflow cài Android SDK và Gradle, tải npm `highs@1.15.4` trong CI, kiểm tra thuật toán v7.1 trên SciPy, giải HiGHS WASM thực, thử export Python, biên dịch APK.
4. Khi tất cả bước hoàn tất màu xanh, tải artifact **Khoang-Thach-v7.1-FINAL-APK**, giải nén và cài `app-debug.apk`.
5. Nếu lần build đỏ, mở job `android`, gửi nội dung bước lỗi. Chưa có APK nếu bước Upload artifact bị bỏ qua.

### Commands trên Codespaces (đã tải ZIP nguồn lên thư mục gốc)

```bash
cd "$(git rev-parse --show-toplevel)"
unzip -o KhoangThach_v7_1_FINAL_Android_Source.zip
rm KhoangThach_v7_1_FINAL_Android_Source.zip
git add -A
git commit -m "Upgrade Khoang Thach to v7 dynamic multilingual planner"
git push origin HEAD:main
```

**Nếu đang ở repo v6.1**, thay bằng gói `KhoangThach_v7_1_FINAL_PATCH_GitHub.zip`, chạy các lệnh tương tự với tên file PATCH. Không giải nén cả hai gói lên cùng repository nếu không cần.

## Chạy kiểm thử thuật toán ở máy Linux/Codespaces

```bash
python -m pip install 'scipy>=1.11,<2' xlsxwriter
node tests/test_v7_dynamic.js
node tests/test_js_optimizer.js
python -m unittest discover -s tests -p "test_optimizer.py" -v
python tests/test_export_schema.py
```

Nếu có kết nối Internet, CI sẽ tải WASM và chạy `node tests/test_highs_wasm_node.cjs` trước khi biên dịch APK. Không phải kết quả kiểm thử SciPy đủ để khẳng định ứng dụng Android chạy được.

## Quyền riêng tư

Ứng dụng Android không yêu cầu quyền Internet. Hồ sơ, kế hoạch và cài đặt ngôn ngữ được lưu trên thiết bị; sao lưu JSON do người dùng thực hiện. Dữ liệu không gửi đến dịch vụ bên ngoài khi tính toán.
