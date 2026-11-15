"""Export the precomputed offline WASM result without invoking SciPy."""
from __future__ import annotations
import csv
import json
from io import BytesIO, StringIO
from zipfile import ZipFile, ZIP_DEFLATED
from reporting import export_daily_transactions

def csv_bytes(rows, fields=None):
    rows=list(rows)
    if fields is None:
        fields=list(rows[0].keys()) if rows else ['Không có dữ liệu']
    s=StringIO(newline='')
    writer=csv.writer(s,delimiter=',')
    writer.writerow(fields)
    for row in rows:
        writer.writerow([row.get(f,'') if not isinstance(row.get(f,''),(dict,list)) else json.dumps(row[f],ensure_ascii=False) for f in fields])
    return ('\ufeff'+s.getvalue()).encode('utf-8')


def make_export(r, profile_name='Nguoi_choi'):
    out=BytesIO()
    with ZipFile(out,'w',compression=ZIP_DEFLATED) as z:
        tabs={
            '01_Tong_quan.csv':[{'Chỉ số':k,'Giá trị':v} for k,v in r['totals'].items()],
            '02_Lich_su_kien.csv':r['events'],
            '03_Boss.csv':[{k:e[k] for k in ('date','damage_g','damage_source','reward_boss','hits')} for e in r['events']],
            # Default report: ONE ROW PER DAY. Raw trades are separate for auditing.
            '04_Giao_dich_theo_ngay.csv':export_daily_transactions(r['transaction_days']),
            '05_Doi_bac.csv':[x for x in r['transactions'] if x['type']=='Đổi bạc'],
            '06_Doi_vang.csv':[x for x in r['transactions'] if x['type']=='Mua vàng'],
            '07_Theo_thang.csv':r['months'],
            '08_Ton_kho_tung_ngay.csv':r['daily'],
            '09_Chi_tiet_giao_dich.csv':r['transactions'],
            '10_Luot_mua_su_kien.csv':r['purchases'],
        }
        for name,rows in tabs.items():z.writestr(name,csv_bytes(rows))
        z.writestr('THONG_TIN.txt',('KẾ HOẠCH TÀI NGUYÊN GAME\nHồ sơ: '+profile_name+'\n\n'
                  'Dữ liệu tính từ 16/11/2026 đến 30/04/2028.\n'
                  'Đổi bạc vào ngày được khuyến nghị; có thể nằm giữa tuần hoặc cuối tháng.\n'
                  'Nhiệm vụ liên minh và xưởng được ghi nhận cuối ngày.\n'
                  'Các lượt sự kiện chỉ được mua từ thứ Ba; Trường bắn kết thúc thứ Bảy, ba sự kiện khác Chủ nhật.\n'
                  'Bảng 04 gộp 1 dòng/ngày giao dịch; bảng 09 giữ từng giao dịch gốc.\n'
                  'File CSV mã hóa UTF-8 BOM, mở trực tiếp được bằng Excel.\n'
                  'Có thể dùng Excel -> Data -> From Text/CSV để mở nhiều file.\n').encode('utf8'))
    return out.getvalue()


