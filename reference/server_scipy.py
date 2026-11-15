"""Local-only browser app (Python stdlib HTTP + SciPy MILP)."""
from __future__ import annotations
import csv
from datetime import date
from io import BytesIO, StringIO
import json
import os
from pathlib import Path
import re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from zipfile import ZipFile, ZIP_DEFLATED
import webbrowser
from optimizer import optimize, boss_reward
from reporting import export_daily_transactions

ROOT = Path(__file__).resolve().parent
WEB = ROOT / 'web'
CONTENT = {'/':'index.html','/app.css':'app.css','/app.js':'app.js'}
MIME = {'html':'text/html; charset=utf-8','css':'text/css; charset=utf-8', 'js':'application/javascript; charset=utf-8'}


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


class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):
        print('[local]',fmt%args)
    def reply(self,code,payload,content_type='application/json; charset=utf-8',headers=None):
        if isinstance(payload,(dict,list)):
            payload=json.dumps(payload,ensure_ascii=False).encode('utf8')
        self.send_response(code)
        self.send_header('Content-Type',content_type)
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        if headers:
            for k,v in headers.items():self.send_header(k,v)
        self.end_headers()
        self.wfile.write(payload)
    def do_GET(self):
        route=self.path.split('?')[0]
        if route=='/api/health':
            self.reply(200,{'status':'ready','local':True})
            return
        if route not in CONTENT:
            self.reply(404,{'error':'Không tìm thấy đường dẫn.'})
            return
        fn=WEB/CONTENT[route]
        raw=fn.read_bytes()
        self.reply(200,raw,MIME[fn.suffix[1:]])
    def do_POST(self):
        route=self.path.split('?')[0]
        if route not in ('/api/optimize','/api/export','/api/excel'):
            self.reply(404,{'error':'Đường dẫn không hợp lệ.'})
            return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=1024*1024:
                self.reply(413,{'error':'Dữ liệu quá lớn (giới hạn 1 MB).'})
                return
            raw=json.loads(self.rfile.read(length).decode('utf8'))
            if not isinstance(raw,dict):raise ValueError('Dữ liệu phải là đối tượng JSON.')
            result=optimize(raw.get('config',raw))
            if route=='/api/optimize':
                self.reply(200,result)
            else:
                name=str(raw.get('profile','Nguoi_choi'))[:100]
                if route=='/api/excel':
                    from excel_export import make_excel
                    content=make_excel(result,name)
                    self.reply(200,content,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        {'Content-Disposition':'attachment; filename="Khoang_Thach_v5.xlsx"'})
                else:
                    content=make_export(result,name)
                    self.reply(200,content,'application/zip',{'Content-Disposition':'attachment; filename="Ke_hoach_game_CSV.zip"'})
        except (ValueError,RuntimeError,TypeError,AssertionError) as e:
            self.reply(422,{'error':str(e)})
        except Exception as e:
            print('Internal error',repr(e))
            self.reply(500,{'error':'Lỗi xử lý nội bộ. Xem cửa sổ dòng lệnh để biết chi tiết.'})


def main():
    port=int(os.environ.get('GAME_APP_PORT','8765'))
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    url=f'http://127.0.0.1:{port}/'
    print('\n'+'='*60)
    print('ỨNG DỤNG TỐI ƯU TÀI NGUYÊN GAME (chỉ chạy trong máy)')
    print('Truy cập:',url)
    print('Nhấn Ctrl+C để tắt máy chủ.')
    print('='*60+'\n',flush=True)
    if os.environ.get('GAME_APP_NO_BROWSER')!='1':
        webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:print('\nĐã đóng ứng dụng.')
    finally:server.server_close()

if __name__=='__main__':main()
