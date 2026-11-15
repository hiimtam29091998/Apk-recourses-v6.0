# KHOÁNG THẠCH v6.1 — thay đổi quy tắc Chợ lấp lánh

Cấp ưu tiên đã khóa: sự kiện cốt lõi -> số lượt cốt lõi -> tổng lượt Chợ -> tổng vàng -> Chợ sớm nhất theo thứ tự ngày -> lịch giao dịch.

Công thức mô hình không bị hardcode cho Người chơi A hoặc Tâm.

Đối chiếu hồ sơ Tâm: dữ liệu cũ 11/15 tại 08/12/2026, đủ 15/15 các Chợ sau; dữ liệu mới đủ 15/15 ở 18 Chợ đầu tiên, 11/15 ở 25/04/2028. Cả hai phương án có 281/285 lượt Chợ, 153.000 vàng, 76/76 sự kiện cốt lõi.

Gói PATCH nên giải nén vào gốc repository chứa app, build.gradle, .github. Giữ nguyên các file hồ sơ/sao lưu JSON.

Các kiểm thử tích hợp: tests/test_js_optimizer.js và tests/test_highs_wasm_node.cjs; Python tham chiếu: tests/test_optimizer.py. GitHub Actions có bước kiểm thử WASM thực tế trước khi build.
