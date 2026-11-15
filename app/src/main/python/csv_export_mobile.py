"""Export the precomputed offline WASM result without invoking SciPy."""
from __future__ import annotations
import csv
import json
from io import BytesIO, StringIO
from zipfile import ZipFile, ZIP_DEFLATED
from reporting import export_daily_transactions
from report_i18n import tr

def csv_bytes(rows, fields=None, lang="vi"):
    rows=list(rows)
    if fields is None:
        fields=list(rows[0].keys()) if rows else ['Không có dữ liệu']
    s=StringIO(newline='')
    writer=csv.writer(s,delimiter=',')
    writer.writerow([tr(f,lang) for f in fields])
    for row in rows:
        writer.writerow([tr(row.get(f,''),lang) if not isinstance(row.get(f,''),(dict,list)) else json.dumps(row[f],ensure_ascii=False) for f in fields])
    return ('\ufeff'+s.getvalue()).encode('utf-8')


def make_export(r, profile_name='Nguoi_choi'):
    lang=r.get('report_language','vi');period=r.get('period',{});out=BytesIO()
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
        for name,rows in tabs.items():z.writestr(name,csv_bytes(rows,lang=lang))
        notes=tr('Người chơi',lang)+': '+profile_name+'\n'+tr('samplePeriod',lang)+': '+period.get('start','')+' → '+period.get('end','')+'\n'+tr('snapshotStart',lang)+'\n'
        z.writestr('README.txt',notes.encode('utf-8'))
    return out.getvalue()


