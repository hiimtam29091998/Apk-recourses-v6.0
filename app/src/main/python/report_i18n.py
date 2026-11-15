"""Internationalized export labels (local files, no network)."""
import json,re
from pathlib import Path
CAT=json.loads((Path(__file__).parent/'report_locales.json').read_text(encoding='utf8'))
REVERSE={v:k for k,v in CAT['vi'].items()}
TECH={'date':'Ngày','month':'Tháng','event':'Sự kiện','type':'Loại','action':'Sự kiện / hoạt động',
'core_bought':'Cốt lõi','core_units':'Cốt lõi','bonus_bought':'Chợ thêm','bonus_missed':'Lượt Chợ bỏ',
'silver_exchanged':'Bạc đổi','silver_spent':'Bạc chi','gold_gained':'Vàng nhận','quartz_income':'Thu đá',
'quartz_balance':'Đá cuối ngày','silver_balance':'Bạc cuối ngày','quartz_end':'Đá cuối ngày',
'silver_end':'Bạc cuối ngày','event_silver':'Bạc chi sự kiện','event_quartz':'Đá chi sự kiện',
'quartz_to_silver':'Đá đổi bạc','silver_gained':'Bạc nhận','quartz_to_gold':'Đá đổi vàng',
'quartz_event_spent':'Đá chi sự kiện','gold_times':'Lượt đổi vàng','quartz_used':'Đá sử dụng',
'silver_used':'Bạc sử dụng','quartz_left':'Đá còn','silver_left':'Bạc còn',
'damage_g':'Boss (G)','reward_boss':'Đá boss','core_complete':'Đủ phần thưởng cốt lõi',
'bonus_units':'Chợ thêm','core_units_max':'Cốt lõi','initial_quartz':'Đá tím đầu kỳ',
'initial_silver':'Bạc đầu kỳ','silver_quota_left':'Hạn mức bạc còn','gold_quota_left':'Lượt vàng còn',
'week_end':'Hạn chót','event_start':'Ngày mở','event_end':'Hạn chót','deadline':'Hạn chót',
'core_total':'Sự kiện tuần được hoàn thành','silver_event_spent':'Bạc chi sự kiện',
'quartz_total':'Đá tím có thể sử dụng','quartz_spent':'Đá chi','mission':'Liên minh','workshop':'Xưởng',
'index':'Tuần','weekday':'Thứ','core_planned':'Cốt lõi','bonus_planned':'Chợ thêm',
'completion_date':'Hoàn thành ngày','purchase_days':'Số ngày mua','income_quartz':'Thu đá'}
SHEETS={'Tong quan':['Tổng quan','Overview','總覽','概要'],
'Lich su kien':['Lịch sự kiện','Event Schedule','活動日程','イベント予定'],
'Giao dich theo ngay':['Giao dịch theo ngày','Daily Trades','每日交易','日別取引'],
'Doi bac':['Đổi bạc','Silver Exchanges','兌換銀塊','銀の交換'],
'Doi vang':['Đổi vàng','Gold Exchanges','兌換黃金','金の交換'],
'Ton kho hang ngay':['Tồn kho hằng ngày','Daily Balances','每日餘額','日別残高'],
'Theo thang':['Theo tháng','Monthly','每月統計','月別集計'],
'Boss':['Boss','Boss','首領','ボス'],
'Chi tiet goc':['Chi tiết gốc','Raw Trades','交易明細','取引明細']}
LANGS=('vi','en','zh-Hant','ja')
def tr(value,lang='vi'):
 if not isinstance(value,str):return value
 if lang not in LANGS:lang='vi'
 key=REVERSE.get(value,TECH.get(value,value))
 if key in CAT[lang]:return CAT[lang][key]
 if ' + ' in value or '; ' in value:
  return re.sub(r'[^;+]+',lambda m:(' ' if m.group(0).startswith(' ') else '')+tr(m.group(0).strip(),lang)+(' ' if m.group(0).endswith(' ') else ''),value)
 return value
def sheet_name(key,lang):return SHEETS.get(key,[key]*4)[LANGS.index(lang if lang in LANGS else 'vi')]
