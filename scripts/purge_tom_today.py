from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request

import requests


BASE = os.environ.get("AB_BASE_URL", "https://ai-booking-mvp.onrender.com").rstrip("/")
CLIENT = os.environ.get("AB_CLIENT_KEY", "d2d-xpress-tom")


def export_count() -> int:
    data = urllib.request.urlopen(
        f"{BASE}/api/export/leads?clientKey={CLIENT}", timeout=60
    ).read()
    return max(0, len(data.splitlines()) - 1)


def main() -> int:
    api_key = os.environ.get("AB_API_KEY", "").strip()
    if not api_key:
        print("ERROR: AB_API_KEY env var is required", file=sys.stderr)
        return 2

    created_after = os.environ.get("AB_CREATED_AFTER", "2026-04-07T00:00:00+01:00")
    created_before = os.environ.get("AB_CREATED_BEFORE") or dt.datetime.now(
        dt.timezone.utc
    ).isoformat()

    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json",
    }

    before = export_count()
    print(json.dumps({"before_export_rows": before}))

    # Clear call queue first (stop any outbound side effects).
    r = requests.post(
        f"{BASE}/admin/clear-call-queue",
        headers=headers,
        json={"clientKey": CLIENT},
        timeout=60,
    )
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:200]}
    print(json.dumps({"clear_call_queue_status": r.status_code, "body": body}))

    # Purge newly inserted leads for the window, by source (two calls).
    purge_results = []
    for source in ("Import", "Test"):
        rp = requests.post(
            f"{BASE}/admin/purge-leads",
            headers=headers,
            json={
                "clientKey": CLIENT,
                "createdAfter": created_after,
                "createdBefore": created_before,
                "source": source,
            },
            timeout=60,
        )
        try:
            payload = rp.json()
        except Exception:
            payload = {"raw": rp.text[:500]}
        purge_results.append({"source": source, "status": rp.status_code, "payload": payload})

    print(json.dumps({"purge_results": purge_results}, indent=2))

    after = export_count()
    print(json.dumps({"after_export_rows": after, "delta": after - before}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

