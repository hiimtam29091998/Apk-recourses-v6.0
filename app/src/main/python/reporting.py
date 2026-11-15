"""Read-only reporting of optimal trades, one summary row per transaction day.

The optimizer remains the source of truth for exact transaction order and balances.
This module changes only presentation/export, never any trade or objective.
"""
from __future__ import annotations
from collections import defaultdict


def group_transactions(transactions: list[dict], daily: list[dict]) -> list[dict]:
    """Group all same-day transactions, maintaining accurate end-of-day stocks.

    Numeric movements are summed; stock balances are *not* summed. Instead they
    come directly from the optimizer's reconciled daily ledger.
    """
    by_day = defaultdict(list)
    ledger = {d['date']: d for d in daily}
    for tx in transactions:
        if tx['date'] not in ledger:
            raise AssertionError('Giao dịch ngoài kỳ báo cáo: ' + tx['date'])
        by_day[tx['date']].append(tx)
    rows = []
    for d in daily:
        date = d['date']
        txs = by_day.get(date)
        if not txs:
            continue  # Keep the daily-income-only days in the existing daily ledger.
        q_to_s = sum(x['quartz_used'] for x in txs if x['type'] == 'Đổi bạc')
        s_get = sum(x['silver_gained'] for x in txs)
        s_spent = sum(x['silver_used'] for x in txs)
        q_event = sum(x['quartz_used'] for x in txs if x['type'].startswith('Mua ') and x['type'] != 'Mua vàng')
        q_to_g = sum(x['quartz_used'] for x in txs if x['type'] == 'Mua vàng')
        g_gain = sum(x['gold_gained'] for x in txs)
        g_times = sum(x.get('gold_times', 0) for x in txs)
        event_names = list(dict.fromkeys(x.get('event', '') for x in txs if x.get('event')))
        core = sum(x['quartz_used']//5000 + x['silver_used']//5000 for x in txs if x['type'] == 'Mua Cốt lõi')
        bonus = sum(x['silver_used']//10000 for x in txs if x['type'] == 'Mua Chợ bổ sung')
        labels = []
        if q_to_s:labels.append('Đổi bạc')
        labels.extend(event_names)
        if g_times:labels.append('Mua vàng')
        row = dict(date=date, event='; '.join(event_names) if event_names else '·',
            action=' + '.join(labels) if labels else '·',
            quartz_income=d['quartz_income'], quartz_to_silver=q_to_s,
            silver_gained=s_get, silver_spent=s_spent,
            quartz_event_spent=q_event, quartz_to_gold=q_to_g,
            gold_times=g_times, gold_gained=g_gain,
            quartz_end=d['quartz_balance'], silver_end=d['silver_balance'],
            core_units=core, bonus_units=bonus, transaction_count=len(txs),
            details=txs)
        if (q_to_s != d['silver_exchanged'] or s_get != q_to_s or
            s_spent != d['event_silver'] or q_event != d['event_quartz'] or
            q_to_g != d['gold_times'] * 5000 or
            g_times != d['gold_times'] or g_gain != d['gold_gained'] or
            txs[-1]['quartz_left'] != d['quartz_balance'] or
            txs[-1]['silver_left'] != d['silver_balance']):
            raise AssertionError('Lệch khi gộp giao dịch ngày ' + date)
        rows.append(row)
    if len(rows) != len(by_day):
        raise AssertionError('Ngày giao dịch không có trong dòng tiền')
    # A second, whole-period check protects against accidental column mix-ups.
    if (sum(r['quartz_to_silver'] for r in rows) != sum(d['silver_exchanged'] for d in daily) or
        sum(r['silver_spent'] for r in rows) != sum(d['event_silver'] for d in daily) or
        sum(r['quartz_event_spent'] for r in rows) != sum(d['event_quartz'] for d in daily) or
        sum(r['gold_gained'] for r in rows) != sum(d['gold_gained'] for d in daily)):
        raise AssertionError('Lệch tổng toàn kỳ sau khi gộp giao dịch')
    return rows


def export_daily_transactions(rows: list[dict]) -> list[dict]:
    """Vietnamese-friendly report without nested raw details (those have their own CSV)."""
    return [{
        'Ngày': r['date'], 'Hoạt động': r['action'],
        'Sự kiện': r['event'], 'Đá nhận trong ngày': r['quartz_income'],
        'Đá đổi bạc': r['quartz_to_silver'], 'Bạc nhận': r['silver_gained'],
        'Bạc chi sự kiện': r['silver_spent'],
        'Đá chi trực tiếp': r['quartz_event_spent'],
        'Đá đổi vàng': r['quartz_to_gold'],
        'Số lượt vàng': r['gold_times'], 'Vàng nhận': r['gold_gained'],
        'Đá cuối ngày': r['quartz_end'], 'Bạc cuối ngày': r['silver_end'],
        'Lượt cốt lõi': r['core_units'], 'Lượt Chợ bổ sung': r['bonus_units'],
        'Số giao dịch gốc': r['transaction_count']
    } for r in rows]
