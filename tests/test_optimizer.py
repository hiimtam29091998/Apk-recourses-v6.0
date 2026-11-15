"""Khoáng Thạch v5: full-period, deadlines, quota, boss and export regression."""
import csv
import sys
import unittest
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "app/src/main/python"))
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "reference"))
from optimizer_scipy import optimize, validated, boss_reward, START, END
from csv_export_mobile import make_export
from excel_export import make_excel

class PlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan=optimize({})
    def test_period_532_days(self):
        self.assertEqual((END-START).days+1,532)
        self.assertEqual(END,date(2028,4,30))
        self.assertEqual(END.weekday(),6)
        self.assertEqual(len(self.plan['daily']),532)
    def test_76_events_19_each(self):
        p=self.plan
        self.assertEqual(len(p['events']),76)
        from collections import Counter
        self.assertEqual(sorted(Counter(e['event'] for e in p['events']).values()),[19]*4)
        self.assertEqual(p['totals']['core_total'],76)
        self.assertEqual(p['totals']['core_complete'],76)
    def test_last_market(self):
        e=self.plan['events'][-1]
        self.assertEqual(e['date'],'2028-04-24')
        self.assertEqual(e['event_start'],'2028-04-25')
        self.assertEqual(e['event_end'],'2028-04-30')
        self.assertEqual(e['deadline'],'2028-04-30')
        self.assertEqual(e['event'],'Chợ lấp lánh')
        self.assertEqual(e['core_bought'],6)
        self.assertEqual(e['bonus_bought'],15)
    def test_exact_calendar_months(self):
        self.assertEqual(len(self.plan['months']),18)
        self.assertEqual(self.plan['months'][0]['month'],'2026-11')
        self.assertEqual(self.plan['months'][-1]['month'],'2028-04')
        self.assertIn('2028-02-29',[x['date'] for x in self.plan['daily']])
    def test_exact_sources(self):
        p=self.plan
        self.assertEqual(sum(x['workshop'] for x in p['daily']),532*1176)
        self.assertEqual(sum(x['mission'] for x in p['daily']),76*6*9000)
        self.assertEqual(sum(x['boss'] for x in p['daily']),76*18420)
    def test_boss_thresholds(self):
        for g,v in [(1,0),(1.006,60),(1.6,6000),(3.5,12000),(5.5,18000),(5.82,18420),(5.96,18600),(10,24000)]:
            self.assertEqual(boss_reward(g),v)
    def test_every_purchase_open_days(self):
        evs={x['index']:x for x in self.plan['events']}
        for x in self.plan['purchases']:
            e=evs[x['event_index']]
            self.assertLessEqual(e['event_start'],x['date'])
            self.assertLessEqual(x['date'],e['deadline'])
            weekday=date.fromisoformat(x['date']).weekday()
            self.assertNotEqual(weekday,0)
            if e['event']=='Trường bắn đoạt bảo':self.assertLessEqual(weekday,5)
    def test_shooting_window(self):
        self.assertEqual((self.plan['events'][0]['event_start'],self.plan['events'][0]['deadline']),('2026-11-17','2026-11-21'))
    def test_nov_quota_reduced(self):
        x=self.plan['months'][0]
        self.assertLessEqual(x['silver_exchanged'],180000)
        self.assertLessEqual(x['gold_times'],18)
    def test_monthly_quotas(self):
        for m in self.plan['months']:
            self.assertGreaterEqual(m['silver_quota_left'],0)
            self.assertGreaterEqual(m['gold_quota_left'],0)
            self.assertLessEqual(m['silver_exchanged'],180000 if m['month']=='2026-11' else 250000)
            self.assertLessEqual(m['gold_times'],18 if m['month']=='2026-11' else 24)
    def test_no_negative_balances(self):
        self.assertTrue(all(x['quartz_balance']>=0 and x['silver_balance']>=0 for x in self.plan['daily']))
        self.assertTrue(all(x['quartz_left']>=0 and x['silver_left']>=0 for x in self.plan['transactions']))
    def test_accounting(self):
        p=self.plan;t=p['totals']
        self.assertEqual(t['quartz_total'],t['silver_exchanged']+t['quartz_event_spent']+t['gold_times']*5000+t['quartz_end'])
        self.assertEqual(t['initial_silver']+t['silver_exchanged'],t['silver_event_spent']+t['silver_end'])
    def test_priority_result(self):
        t=self.plan['totals']
        self.assertEqual((t['core_complete'],t['bonus_bought'],t['gold_gained']),(76,281,152000))
        self.assertEqual((t['silver_exchanged'],t['quartz_end']),(4425000,3604))
    def test_units_not_exceed_market(self):
        t=self.plan['totals']
        self.assertEqual(t['bonus_max'],285)
        self.assertLessEqual(t['bonus_bought'],t['bonus_max'])
    def test_jan_and_feb_events_2028(self):
        x=[e for e in self.plan['events'] if e['date'].startswith('2028-02')]
        self.assertGreaterEqual(len(x),4)
        self.assertEqual(date(2028,2,29).weekday(),1)
    def test_boss_actual_highest(self):
        p=optimize({'boss_entries':{'2028-04-24':[5.50,5.82,5.96,5.73]}})
        self.assertEqual(p['events'][-1]['reward_boss'],18600)
        self.assertEqual(p['events'][-1]['damage_g'],5.96)
    def test_low_resources_no_invalid_trades(self):
        p=optimize({'damage_g':0,'initial_quartz':0,'silver_used_nov':0,'gold_used_nov':24})
        self.assertTrue(all(x['quartz_balance']>=0 and x['silver_balance']>=0 for x in p['daily']))
    def test_sunday_mode_uses_last_day(self):
        p=optimize({'completion_mode':'sunday'})
        self.assertEqual(p['events'][0]['completion_date'],'2026-11-21')
        self.assertEqual(p['events'][-1]['completion_date'],'2028-04-30')
        self.assertEqual(p['totals']['gold_gained'],self.plan['totals']['gold_gained'])
    def test_early_mode(self):
        p=optimize({'completion_mode':'early'})
        self.assertEqual(p['totals']['core_complete'],76)
        self.assertEqual(p['totals']['bonus_bought'],281)
        self.assertTrue(all(x['quartz_balance']>=0 for x in p['daily']))
    def test_exact_daily_rollup(self):
        p=self.plan
        self.assertEqual(len(p['transaction_days']),len({x['date'] for x in p['transaction_days']}))
        self.assertEqual(sum(x['quartz_to_silver'] for x in p['transaction_days']),p['totals']['silver_exchanged'])
        self.assertEqual(sum(x['quartz_to_gold'] for x in p['transaction_days']),p['totals']['gold_times']*5000)
        self.assertEqual(sum(x['quartz_event_spent'] for x in p['transaction_days']),p['totals']['quartz_event_spent'])
    def test_csv_includes_532_days(self):
        with ZipFile(BytesIO(make_export(self.plan)), 'r') as z:
            self.assertIn('08_Ton_kho_tung_ngay.csv',z.namelist())
            daily=list(csv.DictReader(z.read('08_Ton_kho_tung_ngay.csv').decode('utf-8-sig').splitlines()))
            self.assertEqual(len(daily),532)
            self.assertEqual(daily[-1]['date'],'2028-04-30')
    def test_xlsx_export_valid(self):
        with ZipFile(BytesIO(make_excel(self.plan,'Người chơi A'))) as z:
            self.assertIn('xl/workbook.xml',z.namelist())
            self.assertIn('xl/worksheets/sheet6.xml',z.namelist())
    def test_validation(self):
        for raw in [{'silver_used_nov':250001},{'gold_used_nov':25},{'boss_entries':{'2028-04-25':5.82}},{'boss_entries':{'2028-04-24':[5.8]*21}}]:
            with self.assertRaises(ValueError):validated(raw)
if __name__=='__main__':unittest.main()
