"""Optional real-browser integration check. Requires playwright + Chromium.

Run from project root: python3 frontend/tests/browser_smoke.py
Launches local backend/frontend processes and shuts them down in finally.
Live provider availability is reported, not assumed. Source metrics are never mocked.
"""
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(__file__).resolve().parent


def wait_for(url):
    for _ in range(60):
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (URLError, TimeoutError):
            time.sleep(0.25)
    raise RuntimeError(f"Server did not start: {url}")


def main():
    processes = []
    try:
        processes.append(subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], cwd=ROOT / "backend", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        processes.append(subprocess.Popen(["node", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], cwd=ROOT / "frontend", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        wait_for("http://127.0.0.1:8000/api/v1/health")
        wait_for("http://127.0.0.1:5173")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1100})
            errors = []
            calls = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: calls.append(request.url))
            page.goto("http://127.0.0.1:5173")
            page.locator("#asset option[value='bitcoin']").wait_for(state="attached")
            page.get_by_role("button", name="Explore this asset").click()
            page.locator(".card--answer").wait_for(timeout=22000)
            page.locator(".history-meta").wait_for(timeout=22000)
            initial_analyses = len([url for url in calls if url.endswith("/api/v1/crypto-analysis")])
            frames = {}
            for label in ("1 day", "1 month", "1 year", "1 week"):
                page.get_by_role("button", name=label, exact=True).click()
                page.locator(".history-meta").wait_for(timeout=22000)
                frames[label] = {"chart_visible": page.locator("svg.price-chart").count() > 0, "warnings": page.locator(".chart-warnings").inner_text() if page.locator(".chart-warnings").count() else ""}
            assert len([url for url in calls if url.endswith("/api/v1/crypto-analysis")]) == initial_analyses == 1
            page.screenshot(path=str(ARTIFACTS / "fin-desktop.png"), full_page=True)
            page.set_viewport_size({"width": 390, "height": 844})
            page.screenshot(path=str(ARTIFACTS / "fin-mobile.png"), full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Mobile horizontal overflow"
            page.emulate_media(reduced_motion="reduce")
            animation = page.locator(".dolphin-body").evaluate("element => getComputedStyle(element).animationName")
            assert animation == "none", f"Reduced motion was not respected: {animation}"
            assert not errors, errors
            report = {"browser_errors": errors, "timeframe_checks": frames, "analysis_calls": initial_analyses, "mobile_no_overflow": True, "reduced_motion": True}
            (ARTIFACTS / "browser-smoke-result.json").write_text(json.dumps(report, indent=2))
            print(json.dumps(report, indent=2))
            browser.close()
    finally:
        for process in reversed(processes):
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
