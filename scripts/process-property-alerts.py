"""Run only after the complete successful daily ingestion matrix. No DB or email key."""
import json
import os
import time
import urllib.error
import urllib.request


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    secret = os.environ.get("FINDER_ALERTS_CRON_SECRET", "")
    if len(secret) < 32:
        raise SystemExit("Missing FINDER_ALERTS_CRON_SECRET; no notification request sent")
    opener = urllib.request.build_opener(NoRedirects())
    failures = 0
    for _ in range(100):
        request = urllib.request.Request(
            "https://love-live-myoko.com/api/property-alerts/process",
            data=b"{}", method="POST",
            headers={"Authorization": "Bearer " + secret, "Content-Type": "application/json"},
        )
        try:
            with opener.open(request, timeout=90) as response:
                result = json.load(response)
            if not isinstance(result.get("more"), bool):
                raise ValueError("Invalid processing response")
            failures = 0
            print("Property alerts processed:", int(result.get("processed", 0)), "accepted:", int(result.get("sent", 0)), flush=True)
            if not result["more"]:
                return
            time.sleep(max(1, min(60, int(result.get("retryAfterSeconds", 1)))))
        except (urllib.error.URLError, ValueError, TimeoutError):
            failures += 1
            if failures >= 5:
                raise SystemExit("Notification processing failed; pending jobs retained for safe retry") from None
            time.sleep(60)
    raise SystemExit("Notification processing remains pending; inspect sanitized Pages logs before retrying")


if __name__ == "__main__":
    main()
