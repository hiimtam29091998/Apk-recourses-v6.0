"""Run on desktop, no Android SDK: checks Python engine and Android bridge contracts."""
import sys, json, base64, io, zipfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'app/src/main/python'))
from optimizer import optimize, boss_reward
from android_bridge import optimize_json, excel_base64, csv_base64

class BridgeContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config={"initial_quartz":9052,"initial_silver":0,"silver_used_nov":70000,"gold_used_nov":6,"damage_g":5.82,"forecast_mode":"fixed","monthly_growth_g":0.04,"boss_entries":{},"completion_mode":"auto"}
        cls.raw=json.dumps(cls.config)
        cls.desktop=optimize(cls.config)

    def test_identical_python_optimizer(self):
        mobile=json.loads(optimize_json(self.raw))
        self.assertEqual(mobile['totals'],self.desktop['totals'])
        self.assertEqual(mobile['stages'],self.desktop['stages'])
        self.assertEqual(mobile['daily'],self.desktop['daily'])
        self.assertEqual(mobile['transaction_days'],self.desktop['transaction_days'])

    def test_milp_results(self):
        totals=self.desktop['totals']
        self.assertEqual(totals['core_total'],76)
        self.assertEqual(totals['core_complete'],76)
        self.assertEqual(totals['bonus_bought'],281)
        self.assertEqual(totals['gold_gained'],152000)
        self.assertEqual(len(self.desktop['daily']),532)
        self.assertEqual(self.desktop['events'][-1]['deadline'],'2028-04-30')

    def test_excel_export(self):
        raw=base64.b64decode(excel_base64(self.raw,'Người chơi A'))
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            self.assertIn('xl/workbook.xml',z.namelist())
            self.assertIn('xl/worksheets/sheet1.xml',z.namelist())

    def test_csv_zip_export(self):
        raw=base64.b64decode(csv_base64(self.raw,'Người chơi A'))
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names=z.namelist()
            self.assertIn('04_Giao_dich_theo_ngay.csv',names)
            self.assertIn('09_Chi_tiet_giao_dich.csv',names)

    def test_boss_rewards(self):
        self.assertEqual([boss_reward(x) for x in [5.5,5.82,5.96]], [18000,18420,18600])

if __name__=='__main__':unittest.main(verbosity=2)
