"""Android exports only. MILP runs in bundled HiGHS WASM in WebView worker.

Chaquopy embeds Python + pure-Python XlsxWriter but no SciPy/NumPy.
"""
from __future__ import annotations
import base64
import json


def excel_base64_result(result_json: str, profile: str) -> str:
    from excel_export import make_excel
    result = json.loads(result_json)
    return base64.b64encode(make_excel(result, profile)).decode('ascii')


def csv_base64_result(result_json: str, profile: str) -> str:
    from csv_export_mobile import make_export
    result = json.loads(result_json)
    return base64.b64encode(make_export(result, profile)).decode('ascii')
