from __future__ import annotations

import csv
import os
import re
import sys
from pathlib import Path

import requests


def norm(s: str) -> str:
    return re.sub(r"[^0-9+]", "", str(s or "").strip())


def main() -> int:
    extract_csv = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/_tmp_1_50_new_only_extract.csv")
    client_key = os.environ.get("AB_CLIENT_KEY", "d2d-xpress-tom")
    base = os.environ.get("AB_BASE_URL", "https://ai-booking-mvp.onrender.com").rstrip("/")
    limit = int(os.environ.get("AB_IMPORT_LIMIT", "0") or "0")  # 0 = no limit (import all valid)

    rows = list(csv.DictReader(extract_csv.open("r", encoding="utf-8", newline="")))
    leads = []
    for r in rows:
        p = norm(r.get("phone", ""))
        if not p:
            continue
        if not (10 <= len(p) <= 15):
            continue
        leads.append(
            {
                "name": str(r.get("name") or "").strip().strip('"'),
                "phone": p,
                "service": str(r.get("service") or "Lead Follow-Up").strip(),
                "source": str(r.get("source") or "Import").strip(),
            }
        )
        if limit > 0 and len(leads) >= limit:
            break

    if not leads:
        print("ERROR: no valid leads found", file=sys.stderr)
        return 2

    payload = {"clientKey": client_key, "leads": leads}
    r = requests.post(f"{base}/api/leads/import", json=payload, timeout=60)
    print("status", r.status_code)
    print(r.text)
    return 0 if r.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

