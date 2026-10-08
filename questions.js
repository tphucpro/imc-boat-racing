'use strict';
// =====================================================================
// CÂU HỎI MẶC ĐỊNH. Admin có thể nhập/sửa trực tiếp trên trang quản trị.
// Định dạng mỗi dòng:   Câu hỏi | Đáp án | Độ khó (1-3, có thể bỏ trống)
// - Đáp án số: chấp nhận 1.25 / 1,25 / 5/4
// - Dòng bắt đầu bằng # là ghi chú
// - Nếu bỏ trống độ khó: tự chia đều theo thứ tự (dễ → khó)
// =====================================================================

const DEFAULT_QUESTIONS_TEXT = `
# ---- Độ khó 1 ----
15 + 27 = ? | 42 | 1
9 × 8 = ? | 72 | 1
100 − 38 = ? | 62 | 1
56 ÷ 7 = ? | 8 | 1
12 + 19 + 4 = ? | 35 | 1
6 × 7 + 8 = ? | 50 | 1
81 ÷ 9 + 11 = ? | 20 | 1
250 − 175 = ? | 75 | 1
14 × 5 = ? | 70 | 1
Số liền sau của 399 là? | 400 | 1
# ---- Độ khó 2 ----
23 × 14 = ? | 322 | 2
Giải: 3x + 7 = 31. Tìm x. | 8 | 2
15% của 240 là? | 36 | 2
√144 + 5² = ? | 37 | 2
Hình chữ nhật có chu vi 34, chiều dài 10. Diện tích = ? | 70 | 2
3/4 + 1/2 = ? (phân số hoặc số thập phân) | 5/4 | 2
Trung bình cộng của 12, 18, 30 là? | 20 | 2
2³ × 3² = ? | 72 | 2
Một số tăng 20% thì được 60. Số ban đầu là? | 50 | 2
Giải: 5x − 12 = 2x + 9. Tìm x. | 7 | 2
# ---- Độ khó 3 ----
Tổng các số nguyên từ 1 đến 50 là? | 1275 | 3
Giải: 2x² − 18 = 0 (x > 0). Tìm x. | 3 | 3
ƯCLN(84, 126) = ? | 42 | 3
7! ÷ 5! = ? | 42 | 3
Số chính phương nhỏ nhất lớn hơn 200 là? | 225 | 3
Có bao nhiêu số nguyên tố nhỏ hơn 30? | 10 | 3
BCNN(12, 18, 30) = ? | 180 | 3
Tổng các chữ số của 2^10 là? | 7 | 3
Có bao nhiêu cách xếp 4 bạn thành một hàng ngang? | 24 | 3
Chữ số tận cùng của 7^2026 là? | 9 | 3
`.trim();

// Câu hỏi THUYỀN VƯƠNG (đề chung cho mọi đội): Câu hỏi | Đáp án
const DEFAULT_KING_TEXT = `
Tính: 17 × 23 − 19 × 9 | 220
Tổng các ước nguyên dương của 36 là? | 91
2^10 − 3^5 = ? | 781
Số tự nhiên n nhỏ nhất sao cho n! chia hết cho 100 là? | 10
Có bao nhiêu số có ba chữ số chia hết cho 7? | 128
`.trim();

module.exports = { DEFAULT_QUESTIONS_TEXT, DEFAULT_KING_TEXT };
