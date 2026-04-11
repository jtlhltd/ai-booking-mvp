from __future__ import annotations

import csv
import re
import sys
from pathlib import Path


def norm(phone: str) -> str:
    return re.sub(r"[^0-9+]", "", str(phone or "").strip())


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: python scripts/tmp_filter_new_leads.py <sheet-extract-csv> <crm-export-csv> [out-csv]")
        return 2

    sheet_csv = Path(sys.argv[1])
    crm_csv = Path(sys.argv[2])
    out_csv = Path(sys.argv[3]) if len(sys.argv) >= 4 else Path("data/_tmp_sheet_new_only.csv")
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    crm_phones: set[str] = set()
    with crm_csv.open("r", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            crm_phones.add(norm(r.get("Phone", "")))

    written = 0
    skipped_existing = 0
    skipped_invalid = 0
    seen: set[str] = set()

    with sheet_csv.open("r", encoding="utf-8", newline="") as f_in, out_csv.open(
        "w", encoding="utf-8", newline=""
    ) as f_out:
        r = csv.DictReader(f_in)
        w = csv.writer(f_out)
        w.writerow(["name", "phone", "service", "source"])
        for row in r:
            name = str(row.get("name") or "").strip().strip('"')
            raw_phone = str(row.get("phone") or "").strip()
            p = norm(raw_phone)
            if not p:
                continue
            if not (10 <= len(p) <= 15):
                skipped_invalid += 1
                continue
            if p in seen:
                continue
            seen.add(p)
            if p in crm_phones:
                skipped_existing += 1
                continue
            w.writerow([name, p, "Lead Follow-Up", "Import"])
            written += 1

    print(
        "wrote",
        out_csv,
        "new",
        written,
        "skipped_existing",
        skipped_existing,
        "skipped_invalid",
        skipped_invalid,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

