"""Khoáng Thạch v5.0: Tuesday-start events and correct daily deadlines.

Lexicographic MILP (SciPy/HiGHS) accounts for 532 real calendar days:
weekly boss on Monday; missions Monday-Saturday; workshop every day.
Core/bonus purchases may be made on any day inside the event. Constraints
only demand aggregate event payments by its deadline, a mathematically valid
representation because events have no intervening per-purchase deadline.
The result is then scheduled into real daily installment purchases using
remaining-capacity checks, without ever introducing a negative balance.

Silver is intentionally exchanged in 5,000-stone increments (a safe chosen
schedule, not a claim about game's exchange denomination). Costs and gold
purchases are also multiples of 5,000; arbitrary initial silver is supported.
"""
from __future__ import annotations
from datetime import date, timedelta
from collections import defaultdict
import math
import json
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
from scipy.sparse import coo_matrix
from reporting import group_transactions

START = date(2026, 11, 16)
END = date(2028, 4, 30)
NAMES = ('Trường bắn đoạt bảo', 'Chuẩn bị toàn diện', 'Thợ săn tiền thưởng', 'Chợ lấp lánh')
CORE_UNITS = (5, 2, 6, 6)
EVENT_KIND = ('silver', 'quartz', 'silver', 'silver')


def boss_reward(damage_g: float) -> int:
    """60 stones per complete damage milestone; no base reward before 1G."""
    if isinstance(damage_g, bool) or not isinstance(damage_g, (int,float)) or not math.isfinite(float(damage_g)) or damage_g < 0:
        raise ValueError('Sát thương boss phải là số không âm.')
    damage_m=int(round(float(damage_g)*1000))
    result=0
    for lo,hi,step in ((1000,1600,6),(1600,3500,19),(3500,5500,20),(5500,10000,45)):
        result+=max(0,min(hi,damage_m)-lo)//step*60
    return result


def validated(raw:dict)->dict:
    data=dict(raw)
    defaults=dict(initial_quartz=9052,initial_silver=0,silver_used_nov=70000,gold_used_nov=6,
                  damage_g=5.82,forecast_mode='fixed',monthly_growth_g=0.04,
                  boss_entries={},completion_mode='auto')
    for k,v in defaults.items():data.setdefault(k,v)
    for fld in ('initial_quartz','initial_silver','silver_used_nov','gold_used_nov'):
        try:n=float(data[fld])
        except (ValueError,TypeError):raise ValueError(f'{fld}: phải nhập số nguyên không âm.')
        if isinstance(data[fld],bool) or not math.isfinite(n) or int(n)!=n or not 0<=int(n)<=1000000000:
            raise ValueError(f'{fld}: phải nhập số nguyên không âm.')
        data[fld]=int(n)
    if data['silver_used_nov']>250000 or data['gold_used_nov']>24:
        raise ValueError('Hạn mức tháng 11 đã dùng vượt quy định.')
    try:damage=float(data['damage_g']);growth=float(data['monthly_growth_g'])
    except (ValueError,TypeError):raise ValueError('Sát thương và tốc độ tăng trưởng phải là số.')
    if not math.isfinite(damage) or not 0<=damage<=10:raise ValueError('Sát thương phải từ 0 đến 10G.')
    if not math.isfinite(growth) or not -1<=growth<=1:raise ValueError('Tốc độ tăng phải từ -1 đến 1 G/tháng.')
    data['damage_g']=damage;data['monthly_growth_g']=growth
    if data['forecast_mode'] not in ('fixed','growth','manual'):
        raise ValueError('Chế độ dự báo không hợp lệ.')
    if data['completion_mode'] not in ('auto','early','sunday'):
        raise ValueError('Chế độ hoàn thành phải là auto, early hoặc sunday.')
    entries=data['boss_entries']
    if not isinstance(entries,dict) or len(entries)>100:raise ValueError('Danh sách boss không hợp lệ.')
    clean={}
    for d,item in entries.items():
        try:day=date.fromisoformat(d)
        except Exception:raise ValueError('Ngày boss phải là YYYY-MM-DD.')
        if day.weekday()!=0 or not START<=day<=END:
            raise ValueError(f'{d} không phải thứ Hai hợp lệ trong kỳ.')
        if isinstance(item,list):
            if len(item)>20:raise ValueError('Tối đa 20 lượt đánh mỗi tuần.')
            hits=[float(x) for x in item if x is not None and str(x)!='']
            if not hits:continue
        else:hits=[float(item)]
        if any(not math.isfinite(x) or not 0<=x<=10 for x in hits):
            raise ValueError(f'{d}: sát thương mỗi lượt phải 0–10G.')
        clean[d]={'hits':hits,'best':max(hits),'mode':'thực tế'}
    data['boss_entries']=clean
    return data


def get_weeks(data):
    weeks=[]
    for i in range(((END-START).days+1)//7):
        monday=START+timedelta(days=7*i)
        shift=(monday.year-2026)*12+monday.month-11
        base=data['damage_g']+(shift*data['monthly_growth_g'] if data['forecast_mode']=='growth' else 0)
        forecast=max(0,min(10,base))
        actual=data['boss_entries'].get(monday.isoformat())
        damage=actual['best'] if actual else round(forecast,4)
        # The Monday is only the weekly anchor / boss date. In-game buying
        # begins on Tuesday. Shooting range closes Saturday; others Sunday.
        event_start=monday+timedelta(days=1)
        event_end=monday+timedelta(days=5 if i%4==0 else 6)
        weeks.append(dict(index=i+1,date=monday.isoformat(),week_end=(monday+timedelta(days=6)).isoformat(),
            event_start=event_start.isoformat(),event_end=event_end.isoformat(),
            deadline=min(event_end,END).isoformat(),event=NAMES[i%4],kind=EVENT_KIND[i%4],
            core_units=CORE_UNITS[i%4],reward_boss=boss_reward(damage),damage_g=damage,
            damage_source=actual['mode'] if actual else 'dự báo',hits=actual['hits'] if actual else []))
    return weeks


def month_last_day(y,m):
    return date(y+1,1,1)-timedelta(days=1) if m==12 else date(y,m+1,1)-timedelta(days=1)


class LPBuilder:
    def __init__(self):self.cols=[];self.rows=[];self.lows=[];self.highs=[]
    def add(self,name,lo,hi):
        i=len(self.cols);self.cols.append((name,lo,hi));return i
    def rule(self,terms,lo=-np.inf,hi=np.inf):
        self.rows.append(terms);self.lows.append(lo);self.highs.append(hi)
    def solve(self,objective,extra=(),timeout=65):
        rows=self.rows+[r for r,_,_ in extra]
        rs=[];cs=[];vs=[]
        for i,row in enumerate(rows):
            for j,c in row.items():
                if c:rs.append(i);cs.append(j);vs.append(c)
        A=coo_matrix((vs,(rs,cs)),shape=(len(rows),len(self.cols))).tocsr()
        c=np.zeros(len(self.cols),dtype=float)
        for j,v in objective.items():c[j]=v
        return milp(c,integrality=np.ones(len(self.cols)),bounds=Bounds(
            [x[1] for x in self.cols],[x[2] for x in self.cols]),
            constraints=LinearConstraint(A,np.array(self.lows+[x[1] for x in extra],float),
                                           np.array(self.highs+[x[2] for x in extra],float)),
            options={'time_limit':timeout,'mip_rel_gap':0.0})


def optimize(raw):
    data=validated(raw)
    weeks=get_weeks(data)
    days=[START+timedelta(days=i) for i in range((END-START).days+1)]
    months=list(dict.fromkeys(d.strftime('%Y-%m') for d in days))
    m_index={m:i for i,m in enumerate(months)}
    day_index={d:i for i,d in enumerate(days)}
    deadline_index=[day_index[date.fromisoformat(w['deadline'])] for w in weeks]
    monday_week={date.fromisoformat(w['date']):w for w in weeks}
    earned=[];monthly_income=defaultdict(int)
    for d in days:
        inc=1176+(9000 if d.weekday()<6 else 0)
        if d in monday_week:inc+=monday_week[d]['reward_boss']
        earned.append(inc);monthly_income[d.strftime('%Y-%m')]+=inc
    model=LPBuilder()
    core=[model.add('core_'+str(i+1),0,w['core_units']) for i,w in enumerate(weeks)]
    full=[model.add('full_'+str(i+1),0,1) for i in range(len(weeks))]
    extras={i:model.add('extra_'+str(i+1),0,15) for i,w in enumerate(weeks) if w['event']=='Chợ lấp lánh'}
    # Whole 5,000-stone transactions are a deliberate practical schedule choice.
    silver={j:model.add('silver_'+d.isoformat(),0,50) for j,d in enumerate(days)
            if d.weekday() in (0,5,6) or d.day==1 or d==month_last_day(d.year,d.month) or d==END}
    gold={m:model.add('gold_'+m,0,24-(data['gold_used_nov'] if m=='2026-11' else 0)) for m in months}
    for i,w in enumerate(weeks):
        model.rule({core[i]:1,full[i]:-w['core_units']},0,np.inf)
        if i in extras:model.rule({extras[i]:1,full[i]:-15},-np.inf,0)
    for m in months:
        quota=(250000-(data['silver_used_nov'] if m=='2026-11' else 0))//5000
        model.rule({j:1 for di,j in silver.items() if days[di].strftime('%Y-%m')==m},-np.inf,quota)
    # Bound cumulative balances by each day's end, after earning today's fixed income,
    # completing event purchases whose deadline is today, and buying gold on month-end.
    income=0
    q_terms={};s_terms={}
    weekly_at_deadline=defaultdict(list)
    for i,idx in enumerate(deadline_index):weekly_at_deadline[idx].append(i)
    for di,d in enumerate(days):
        income+=earned[di]
        if di in silver:
            var=silver[di]
            q_terms[var]=-5000;s_terms[var]=5000
        for i in weekly_at_deadline[di]:
            if weeks[i]['kind']=='quartz':q_terms[core[i]]=-5000
            else:s_terms[core[i]]=-5000
            if i in extras:s_terms[extras[i]]=-10000
        if d==month_last_day(d.year,d.month) or d==END:
            q_terms[gold[d.strftime('%Y-%m')]]=-5000
        model.rule(q_terms.copy(),-data['initial_quartz']-income,np.inf)
        model.rule(s_terms.copy(),-data['initial_silver'],np.inf)
    objectives=({j:-1 for j in full},{j:-1 for j in core},
                {j:-1 for j in extras.values()},{j:-1 for j in gold.values()})
    extra=[];stages=[];sol=None
    for stage,objective in enumerate(objectives):
        res=model.solve(objective,extra)
        if res.x is None or res.status!=0:
            raise RuntimeError(f'Giai đoạn tối ưu {stage+1} chưa chứng minh được nghiệm: {res.message}')
        sol=np.rint(res.x).astype(int)
        score=int(round(-sum(sol[j]*v for j,v in objective.items())))
        stages.append(score)
        extra.append(({j:-v for j,v in objective.items()},score,score))
    # Tie-break: prioritize gold in earlier reset windows. If solver times out,
    # preserve certified lexicographically optimal base solution.
    earlier={gold[m]:-(len(months)-i) for i,m in enumerate(months)}
    res=model.solve(earlier,extra,timeout=20)
    if res.x is not None and res.status==0:sol=np.rint(res.x).astype(int)
    # Recover exact daily balances of the deferred-to-deadline plan.
    daily=[];q=data['initial_quartz'];s=data['initial_silver'];gold_total=0
    for di,d in enumerate(days):
        m=d.strftime('%Y-%m')
        b=monday_week.get(d)
        boss=b['reward_boss'] if b else 0
        mission=9000 if d.weekday()<6 else 0
        workshop=1176
        q+=earned[di]
        sx=int(sol[silver[di]])*5000 if di in silver else 0
        q-=sx;s+=sx
        due=weekly_at_deadline.get(di,[])
        sc=0;qc=0
        for i in due:
            core_cost=int(sol[core[i]])*5000
            bonus_cost=int(sol[extras[i]])*10000 if i in extras else 0
            if weeks[i]['kind']=='quartz':qc+=core_cost
            else:sc+=core_cost+bonus_cost
        q-=qc;s-=sc
        gold_times=int(sol[gold[m]]) if d==month_last_day(d.year,d.month) or d==END else 0
        q-=gold_times*5000;gold_total+=gold_times*500
        daily.append(dict(date=d.isoformat(),month=m,weekday=d.weekday(),boss=boss,mission=mission,workshop=workshop,
            quartz_income=earned[di],silver_exchanged=sx,gold_times=gold_times,gold_gained=gold_times*500,
            event_silver=sc,event_quartz=qc,quartz_balance=q,silver_balance=s))
        if min(q,s)<0:raise AssertionError('Âm tài nguyên tại '+d.isoformat())
    # For core and bonus purchases we can shift installments earlier within
    # their own week, as long as every intermediate balance remains nonnegative.
    # This works with crossing-month weeks and preserves monthly gold quotas.
    baseline={resource:[r[resource+'_balance'] for r in daily] for resource in ('quartz','silver')}
    purchases=[]
    for i,w in enumerate(weeks):
        begin=day_index[date.fromisoformat(w['event_start'])];deadline=deadline_index[i]
        core_n=int(sol[core[i]]);bonus_n=int(sol[extras[i]]) if i in extras else 0
        kinds=[('Cốt lõi',5000,core_n,w['kind']),('Chợ bổ sung',10000,bonus_n,'silver')]
        for cat,cost,count,resource in kinds:
            for _ in range(count):
                # All possible purchase days belong to the actual opening window.
                # Auto favors Saturday when available, then earlier days.
                # The 'sunday' legacy mode means the actual final allowed day
                # (Saturday for Shooting Range, Friday for the last event).
                if data['completion_mode']=='sunday':order=[deadline]
                elif data['completion_mode']=='auto':
                    saturday=min(deadline,day_index[date.fromisoformat(w['date'])]+5)
                    order=[saturday]+list(range(begin,saturday))+list(range(saturday+1,deadline+1))
                else:order=list(range(begin,deadline+1))
                chosen=deadline
                for di in order:
                    if di==deadline or (min(baseline[resource][di:deadline])>=cost):
                        chosen=di;break
                purchases.append({'date':days[chosen].isoformat(),'event_index':w['index'],
                    'event':w['event'],'category':cat,'resource':resource,'cost':cost})
                for di in range(chosen,deadline):baseline[resource][di]-=cost
    # Correct real balances from advance purchases; baseline final daily ledger.
    bought_by_day=defaultdict(list)
    for p in purchases:bought_by_day[p['date']].append(p)
    for i,r in enumerate(daily):
        r['event_silver']=sum(p['cost'] for p in bought_by_day[r['date']] if p['resource']=='silver')
        r['event_quartz']=sum(p['cost'] for p in bought_by_day[r['date']] if p['resource']=='quartz')
        r['quartz_balance']=baseline['quartz'][i]
        r['silver_balance']=baseline['silver'][i]
        if min(r['quartz_balance'],r['silver_balance'])<0:raise AssertionError('Giao dịch sớm gây âm số dư')
    # Do not allow even a single event purchase on a forbidden weekday.
    for p in purchases:
        ev=weeks[p['event_index']-1]
        if not ev['event_start']<=p['date']<=ev['deadline']:
            raise AssertionError('Mua ngoài thời gian sự kiện: '+str(p))
        wd=date.fromisoformat(p['date']).weekday()
        if wd==0 or (ev['event']=='Trường bắn đoạt bảo' and wd==6):
            raise AssertionError('Mua vào thứ không hợp lệ: '+str(p))
    # Transactions are replayed in real order with accurate post-transaction
    # balances, rather than repeating the final balance for every same-day tx.
    transactions=[]
    q_replay=data['initial_quartz'];s_replay=data['initial_silver']
    for r in daily:
        d=r['date'];q_replay+=r['quartz_income']
        if r['silver_exchanged']:
            x=r['silver_exchanged'];q_replay-=x;s_replay+=x
            transactions.append(dict(date=d,moment='Sau thu nhập trong ngày',type='Đổi bạc',
                quartz_used=x,silver_used=0,silver_gained=x,gold_gained=0,
                quartz_left=q_replay,silver_left=s_replay))
        for purchase in bought_by_day[d]:
            cost=purchase['cost'];res=purchase['resource']
            if res=='silver':s_replay-=cost
            else:q_replay-=cost
            transactions.append(dict(date=d,moment='Trong thời gian sự kiện',
                type='Mua '+purchase['category'],event=purchase['event'],
                quartz_used=cost if res=='quartz' else 0,
                silver_used=cost if res=='silver' else 0,
                silver_gained=0,gold_gained=0,quartz_left=q_replay,silver_left=s_replay))
        if r['gold_times']:
            amount=r['gold_times']*5000;q_replay-=amount
            transactions.append(dict(date=d,moment='Cuối ngày, trước reset',type='Mua vàng',
                quartz_used=amount,silver_used=0,silver_gained=0,gold_gained=r['gold_gained'],
                gold_times=r['gold_times'],quartz_left=q_replay,silver_left=s_replay))
        if min(q_replay,s_replay)<0 or q_replay!=r['quartz_balance'] or s_replay!=r['silver_balance']:
            raise AssertionError('Lệch sổ giao dịch ngày '+d)
    event_results=[]
    for i,w in enumerate(weeks):
        idxs=range(day_index[date.fromisoformat(w['date'])],deadline_index[i]+1)
        week_rows=[daily[d] for d in idxs]
        event_purchases=[p for p in purchases if p['event_index']==w['index']]
        spent_s=sum(p['cost'] for p in event_purchases if p['resource']=='silver')
        spent_q=sum(p['cost'] for p in event_purchases if p['resource']=='quartz')
        last=week_rows[-1]
        event_results.append({**w,'core_bought':int(sol[core[i]]),'core_complete':int(sol[core[i]])==w['core_units'],
            'bonus_bought':int(sol[extras[i]]) if i in extras else 0,
            'silver_spent':spent_s,'quartz_spent':spent_q,
            'quartz_after_event':last['quartz_balance'],'silver_after_event':last['silver_balance'],
            'completion_date':max((p['date'] for p in event_purchases),default=None),
            'purchase_days':len(set(p['date'] for p in event_purchases)),
            'mission_income':sum(r['mission'] for r in week_rows),
            'workshop_income':sum(r['workshop'] for r in week_rows),
            'income_total':sum(r['quartz_income'] for r in week_rows)})
    monthly=[]
    for m in months:
        rows=[r for r in daily if r['month']==m]
        evs=[e for e in event_results if e['date'][:7]==m]
        end=rows[-1]
        sx=sum(r['silver_exchanged'] for r in rows);gt=sum(r['gold_times'] for r in rows)
        monthly.append(dict(month=m,quartz_income=sum(r['quartz_income'] for r in rows),
            silver_exchanged=sx,gold_times=gt,gold_gained=gt*500,
            core_complete=sum(e['core_complete'] for e in evs),core_total=len(evs),
            market_bonus=sum(e['bonus_bought'] for e in evs),
            silver_spent=sum(r['event_silver'] for r in rows),quartz_spent=sum(r['event_quartz'] for r in rows),
            silver_quota_left=250000-(data['silver_used_nov'] if m=='2026-11' else 0)-sx,
            gold_quota_left=24-(data['gold_used_nov'] if m=='2026-11' else 0)-gt,
            quartz_end=end['quartz_balance'],silver_end=end['silver_balance']))
    q_end=daily[-1]['quartz_balance'];s_end=daily[-1]['silver_balance']
    total_silver=sum(m['silver_exchanged'] for m in monthly)
    total_quartz_event=sum(m['quartz_spent'] for m in monthly)
    total_silver_event=sum(m['silver_spent'] for m in monthly)
    gt=sum(m['gold_times'] for m in monthly)
    income_total=sum(earned)
    assert q_end==data['initial_quartz']+income_total-total_silver-total_quartz_event-gt*5000
    assert s_end==data['initial_silver']+total_silver-total_silver_event
    assert all(m['silver_quota_left']>=0 and m['gold_quota_left']>=0 for m in monthly)
    # The last event ends on Sunday 30 April 2028; no partial event is needed.
    totals=dict(initial_quartz=data['initial_quartz'],initial_silver=data['initial_silver'],
        income_quartz=income_total,quartz_total=data['initial_quartz']+income_total,
        core_complete=sum(e['core_complete'] for e in event_results),core_total=len(event_results),
        core_units_bought=sum(e['core_bought'] for e in event_results),
        core_units_max=sum(e['core_units'] for e in event_results),
        bonus_bought=sum(e['bonus_bought'] for e in event_results),bonus_max=len(extras)*15,
        silver_exchanged=total_silver,gold_times=gt,gold_gained=gt*500,
        quartz_event_spent=total_quartz_event,silver_event_spent=total_silver_event,
        quartz_end=q_end,silver_end=s_end,
        note='Sự kiện chỉ mở từ thứ Ba. Trường bắn kết thúc thứ Bảy; ba sự kiện còn lại Chủ nhật. Thu nhập boss thứ Hai, thu liên minh và xưởng trong ngày; vàng cuối tháng. Sự kiện cuối kết thúc trọn vẹn Chủ nhật 30/04/2028.')
    return {'input':{k:v for k,v in data.items() if k!='boss_entries'},'boss_entries':data['boss_entries'],
        'totals':totals,'events':event_results,'months':monthly,'transactions':transactions,
        'transaction_days':group_transactions(transactions,daily),
        'purchases':purchases,'checkpoints':daily,'daily':daily,'stages':stages,'months_count':len(months)}


if __name__=='__main__':
    import sys,time
    start=__import__('time').time()
    raw=json.loads(open(sys.argv[1],encoding='utf8').read()) if len(sys.argv)>1 else {}
    out=optimize(raw)
    print(json.dumps({'totals':out['totals'],'months':out['months'],'stages':out['stages'],'seconds':round(__import__('time').time()-start,2)},ensure_ascii=False,indent=2))
