"""Offline Excel export for the active profile (xlsxwriter, no cloud access).

The Python optimizer is the source of truth. Exported Excel has a concise
one-row-per-trading-day view, full daily ledger, event windows and audits.
"""
from __future__ import annotations
from datetime import datetime
from io import BytesIO
import xlsxwriter


def make_excel(result:dict, profile:str='Người chơi')->bytes:
    buf=BytesIO()
    book=xlsxwriter.Workbook(buf,{'in_memory':True})
    book.set_properties({'title':'Khoáng Thạch v5 - kế hoạch tài nguyên','subject':'Lịch sự kiện mở Thứ Ba','author':'KHOANG THACH local'})
    h=book.add_format({'bold':True,'font_color':'white','bg_color':'#26355E','border':0,'align':'center','valign':'vcenter'})
    title=book.add_format({'bold':True,'font_size':17,'font_color':'#26355E','bottom':2,'bottom_color':'#B8B8EA'})
    sub=book.add_format({'font_color':'#5C6476','italic':True})
    num=book.add_format({'num_format':'#,##0','align':'right'})
    datefmt=book.add_format({'num_format':'dd/mm/yyyy'})
    total_fmt=book.add_format({'bold':True,'bg_color':'#EDEDFB','num_format':'#,##0'})
    alertfmt=book.add_format({'bg_color':'#FEE2E2','font_color':'#AE1E24'})
    greenfmt=book.add_format({'bg_color':'#E3F4EC','font_color':'#166845'})
    headers={
       'Tong quan':['Chỉ số','Giá trị'],
       'Lich su kien':['Tuần','Boss thứ Hai','Mở sự kiện','Kết thúc thực tế','Hạn chót kế hoạch','Sự kiện','Ngày mua xong','Cốt lõi mua','Cốt lõi tối đa','Chợ mua thêm','Bạc chi','Đá chi','Trạng thái'],
       'Giao dich theo ngay':['Ngày','Sự kiện/hoạt động','Đá thu','Đá đổi bạc','Bạc nhận','Bạc chi','Đá chi sự kiện','Đá đổi vàng','Vàng nhận','Tổng đá tiêu','Đá cuối ngày','Bạc cuối ngày'],
       'Doi bac':['Ngày','Số đá đổi','Số bạc nhận','Đá sau giao dịch','Bạc sau giao dịch'],
       'Doi vang':['Ngày','Đá dùng đổi vàng','Số lượt','Vàng nhận','Đá sau giao dịch'],
       'Ton kho 532 ngay':['Ngày','Boss','Liên minh','Xưởng','Thu đá','Đổi bạc','Chi bạc','Chi đá sự kiện','Lượt vàng','Đá cuối ngày','Bạc cuối ngày','Cảnh báo'],
       'Theo thang':['Tháng','Đá thu','Bạc đổi','Bạc chi','Đá chi trực tiếp','Lượt vàng','Vàng nhận','Hạn mức bạc còn','Lượt vàng còn','Đá cuối tháng','Bạc cuối tháng'],
       'Boss':['Thứ Hai','Sự kiện','Sát thương (G)','Thưởng đá','Thực tế/dự báo'],
       'Chi tiet goc':['Ngày','Loại giao dịch','Sự kiện','Đá tiêu','Bạc tiêu','Bạc nhận','Vàng nhận','Đá còn','Bạc còn']
    }
    def make(name,data,widths=None):
        sh=book.add_worksheet(name)
        sh.hide_gridlines(2)
        sh.set_zoom(85)
        sh.set_row(0,29)
        sh.merge_range(0,0,0,len(headers[name])-1,'KHOÁNG THẠCH v5.0 · '+name,title)
        sh.write(1,0,'Người chơi: '+profile+' | 16/11/2026 - 30/04/2028 | Trường bắn T3-T7; khác T3-CN',sub)
        for k,col in enumerate(headers[name]):sh.write(3,k,col,h)
        sh.set_row(3,30)
        for ri,row in enumerate(data,4):
            for ci,val in enumerate(row):
                if val is None:continue
                if isinstance(val,bool):sh.write_boolean(ri,ci,val)
                elif isinstance(val,(float,int)):sh.write_number(ri,ci,val,num)
                elif isinstance(val,str) and len(val)==10 and val[4]=='-' and val[7]=='-':
                    try:sh.write_datetime(ri,ci,datetime.strptime(val,'%Y-%m-%d'),datefmt)
                    except ValueError:sh.write_string(ri,ci,val)
                else:sh.write_string(ri,ci,str(val))
        ends=4+len(data)
        sh.autofilter(3,0,max(3,ends-1),len(headers[name])-1)
        sh.freeze_panes(4,2 if len(headers[name])>4 else 0)
        for i,w in enumerate(widths or [18]*len(headers[name])):sh.set_column(i,i,w)
        return sh
    t=result['totals']
    overview=[
        ('Hồ sơ',profile),('Thời gian','16/11/2026 đến 30/04/2028'),
        ('Số sự kiện cốt lõi hoàn thành',t['core_complete']),('Tổng lượt sự kiện',t['core_total']),
        ('Số lượt mua bổ sung Chợ',t['bonus_bought']),('Tổng lượt bổ sung tối đa',t['bonus_max']),
        ('Khối vàng mua được',t['gold_gained']),('Tổng đá được phép dùng',t['quartz_total']),
        ('Đá dùng đổi bạc',t['silver_exchanged']),('Đá trực tiếp sự kiện',t['quartz_event_spent']),
        ('Đá dùng đổi vàng',t['gold_times']*5000),('Đá tím tồn cuối kỳ',t['quartz_end']),
        ('Bạc tồn cuối kỳ',t['silver_end']),('Quy tắc','Thứ Ba bắt đầu; Trường bắn kết thúc T7; còn lại CN; tuần cuối Chợ 25–30/04/2028.')
    ]
    make('Tong quan',overview,[39,95])
    e=result['events']
    make('Lich su kien',[[x['index'],x['date'],x['event_start'],x['event_end'],x['deadline'],x['event'],x['completion_date'],x['core_bought'],x['core_units'],x['bonus_bought'],x['silver_spent'],x['quartz_spent'],'Đủ' if x['core_complete'] else 'Thiếu'] for x in e],[9,16,17,18,18,26,18,14,16,15,14,14,14])
    tx=result['transaction_days']
    make('Giao dich theo ngay',[[x['date'],x['action'],x['quartz_income'],x['quartz_to_silver'],x['silver_gained'],x['silver_spent'],x['quartz_event_spent'],x['quartz_to_gold'],x['gold_gained'],x['quartz_to_silver']+x['quartz_event_spent']+x['quartz_to_gold'],x['quartz_end'],x['silver_end']] for x in tx],[15,35,14,14,14,14,14,14,14,16,17,17])
    trades=result['transactions']
    make('Doi bac',[[x['date'],x['quartz_used'],x['silver_gained'],x['quartz_left'],x['silver_left']] for x in trades if x['type']=='Đổi bạc'],[17,18,18,24,24])
    make('Doi vang',[[x['date'],x['quartz_used'],x.get('gold_times',x['gold_gained']//500),x['gold_gained'],x['quartz_left']] for x in trades if x['type']=='Mua vàng'],[17,22,16,16,24])
    d=result['daily']
    sh=make('Ton kho 532 ngay',[[x['date'],x['boss'],x['mission'],x['workshop'],x['quartz_income'],x['silver_exchanged'],x['event_silver'],x['event_quartz'],x['gold_times'],x['quartz_balance'],x['silver_balance'],None] for x in d],[17,16,15,15,16,17,15,17,15,19,19,15])
    for i,x in enumerate(d,4):
        sh.write_formula(i,11,f'=IF(OR(J{i+1}<0,K{i+1}<0),"THIẾU","OK")',greenfmt,'OK')
    sh.conditional_format(4,9,4+len(d)-1,10,{'type':'cell','criteria':'<','value':0,'format':alertfmt})
    make('Theo thang',[[x['month'],x['quartz_income'],x['silver_exchanged'],x['silver_spent'],x['quartz_spent'],x['gold_times'],x['gold_gained'],x['silver_quota_left'],x['gold_quota_left'],x['quartz_end'],x['silver_end']] for x in result['months']],[17,18,18,18,20,17,18,21,19,22,21])
    make('Boss',[[x['date'],x['event'],x['damage_g'],x['reward_boss'],x['damage_source']] for x in e],[18,30,21,20,23])
    make('Chi tiet goc',[[x['date'],x['type'],x.get('event',''),x['quartz_used'],x['silver_used'],x['silver_gained'],x['gold_gained'],x['quartz_left'],x['silver_left']] for x in trades],[18,24,28,19,19,18,19,20,20])
    book.close()
    return buf.getvalue()
