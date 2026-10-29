"""Frontend-only browser regressions with explicit API fixtures, no backend/model calls.

Run: python3 frontend/tests/browser_research.py (requires Playwright + Chromium).
"""
import json
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

FRONTEND = Path(__file__).resolve().parents[1]
ORIGIN = "http://127.0.0.1:5179"
KEY = "fin.research-profile.v1"
FEATURED = {"id": "bitcoin", "symbol": "btc", "name": "Bitcoin", "category": "crypto"}
CANDIDATE = {"id": "fixture-token", "symbol": "btc", "name": "Fixture Token", "category": "crypto", "platforms": {"ethereum": "0xcandidate"}}
DETAIL = {**CANDIDATE, "platforms": {"base": "0xfull-detail"}, "provider_url": "https://example.org/fixture-token"}
NOW = "2026-10-28T12:00:00Z"


def wait_for_server():
    for _ in range(60):
        try:
            with urlopen(ORIGIN, timeout=1) as response:
                if response.status == 200:
                    return
        except (URLError, TimeoutError):
            time.sleep(0.25)
    raise RuntimeError("Frontend did not start")


def main():
    process = subprocess.Popen(["node", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5179", "--strictPort"], cwd=FRONTEND, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for_server()
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1100})
            errors, calls, analyses, chats = [], [], [], []
            page.on("pageerror", lambda error: errors.append(str(error)))

            def api(route):
                request = route.request
                parsed = urlparse(request.url)
                path = parsed.path
                calls.append(path)
                if path == "/api/v1/assets":
                    payload = {"assets": [FEATURED]}
                elif path == "/api/v1/assets/search":
                    payload = {"assets": [CANDIDATE], "warnings": ["Fixture coverage warning"]}
                elif path == "/api/v1/assets/fixture-token":
                    payload = {"asset": DETAIL}
                elif path == "/api/v1/chat/config":
                    payload = {"enabled": True, "provider": "gemini", "model": "fixture-only-no-live-gemini-model", "max_question_chars": 2000, "profile_sharing": "disabled_free_tier"}
                elif path == "/api/v1/chat":
                    body = request.post_data_json
                    assert body["share_profile"] is False and "profile" not in body, "Free chat must never share profiles"
                    chats.append(body)
                    unrelated = body["question"] == "Unrelated fixture question"
                    payload = {"status": "out_of_scope" if unrelated else "answered", "answer": "<b>Plain fixture answer</b>", "citations": [{"source_id": "fixture", "title": "Fixture citation", "url": "https://example.org/fixture"}], "limitations": ["Test fixture, not a live model answer."], "model": "fixture-only-no-live-gemini-model", "profile_applied": False}
                elif path == "/api/v1/crypto-analysis":
                    body = request.post_data_json
                    analyses.append(body)
                    selected = DETAIL if body["asset_id"] == DETAIL["id"] else FEATURED
                    payload = {"asset": selected, "request_id": "fixture-request", "analysis_mode": "deterministic", "answer": "Fixture snapshot answer.", "submitted_question": body["question"], "answer_sections": [{"topic": "market", "title": "Fixture snapshot", "answer": "No real metrics in this fixture.", "status": "limited", "limitation": "Fixture only."}], "market_snapshot": {}, "key_points": [], "risks": [], "sources": [{"source_id": "fixture", "title": "Fixture evidence", "url": "https://example.org/evidence", "source_type": "market", "publisher": "Fixture", "published_at": NOW}], "meta": {"warnings": [], "generated_at": NOW, "data_as_of": NOW}, "applied_profile": body.get("profile"), "personalized_notes": [{"title": "Fixture tailored note", "detail": "Explanation preferences are not recommendations."}], "pros_cons": {"pros": [{"title": "Fixture consideration", "detail": "An interpretation for testing.", "interpretation": True, "source_ids": ["fixture"]}], "cons": [], "unknowns": []}}
                elif path.startswith("/api/v1/crypto-history/"):
                    timeframe = parse_qs(parsed.query)["timeframe"][0]
                    payload = {"asset_id": path.rsplit("/", 1)[1], "timeframe": timeframe, "currency": "USD", "points": [], "warnings": ["Empty fixture history"], "retrieved_at": NOW}
                else:
                    raise AssertionError(f"Unexpected API request: {path}")
                route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

            page.route("**/api/v1/**", api)
            page.goto(ORIGIN)
            chat = page.locator(".card--chat")
            expect(chat.get_by_role("button", name="Ask crypto chat")).to_be_disabled()
            expect(chat.get_by_text("fixture-only-no-live-gemini-model", exact=False)).to_be_visible()
            expect(page.locator(".card--answer")).to_have_count(0)
            expect(chat.get_by_label("Include this completed asset as context")).not_to_be_checked()
            expect(chat.get_by_role("checkbox")).to_have_count(1)
            expect(chat.get_by_text("Your saved research profile is not sent to Gemini free chat. Do not include personal, financial, confidential information in questions.", exact=True)).to_be_visible()
            terms = chat.get_by_role("link", name="official Gemini API terms")
            expect(terms).to_have_attribute("href", "https://ai.google.dev/gemini-api/terms")
            expect(terms).to_have_attribute("rel", "noopener noreferrer")
            expect(terms).to_have_attribute("target", "_blank")
            chat.get_by_label("Your crypto question").fill("What is crypto liquidity?")
            chat.get_by_role("button", name="Ask crypto chat").click()
            expect(chat.locator(".chat-turn")).to_have_count(1)
            assert "asset_id" not in chats[0] and "profile" not in chats[0]
            assert not chats[0]["share_profile"]
            expect(chat.get_by_text("<b>Plain fixture answer</b>", exact=True)).to_be_visible()
            assert chat.locator(".chat-reply b").count() == 0

            page.locator(".profile-panel > summary").click()
            page.get_by_label("Display name (optional)").fill("Completed learner")
            page.get_by_label("Willingness to accept losses").select_option("high")
            page.get_by_label("Ability to absorb losses").select_option("low")
            assert page.evaluate("localStorage.length") == 0
            page.get_by_label("Include my profile in snapshot research").check()
            page.get_by_label("Remember preferences in this browser").check()
            assert page.evaluate("key => JSON.parse(localStorage.getItem(key)).display_name", KEY) == "Completed learner"

            page.get_by_label("Search more assets by name, symbol, or ID").fill("btc")
            button = page.get_by_role("button", name="Select Fixture Token, BTC, ID fixture-token", exact=True)
            expect(button).to_be_visible()
            expect(page.locator(".selected-asset")).to_contain_text("Bitcoin")
            assert "/api/v1/assets/fixture-token" not in calls
            button.click()
            expect(page.locator(".selected-asset")).to_contain_text("0xfull-detail")
            page.get_by_label("Search more assets by name, symbol, or ID").fill("another")
            expect(button).to_be_visible()
            expect(page.locator(".selected-asset")).to_contain_text("fixture-token")
            page.get_by_role("button", name="Explore this asset").click()
            expect(page.locator(".card--profile")).to_contain_text("Completed learner")
            assert analyses[0]["asset_id"] == "fixture-token"
            assert analyses[0]["profile"]["loss_tolerance"] == "high"
            assert analyses[0]["profile"]["loss_capacity"] == "low"
            expect(page.locator(".card--arguments a")).to_have_attribute("href", "https://example.org/evidence")
            page.get_by_label("Display name (optional)").fill("New draft")
            expect(page.locator(".draft-notice")).to_be_visible()
            expect(page.locator(".card--profile")).not_to_contain_text("New draft")

            chat.get_by_label("Include this completed asset as context").check()
            expect(chat).not_to_contain_text("New draft")
            expect(chat.get_by_role("checkbox")).to_have_count(1)
            chat.get_by_label("Your crypto question").fill("Explain this asset context")
            chat.get_by_role("button", name="Ask crypto chat").click()
            expect(chat.locator(".chat-turn")).to_have_count(2)
            assert chats[1]["asset_id"] == "fixture-token"
            assert "profile" not in chats[1] and chats[1]["share_profile"] is False
            assert len(chats[1]["messages"]) == 0
            chat.get_by_role("button", name="Clear history").click()
            expect(chat.locator(".chat-turn")).to_have_count(0)
            expect(chat.get_by_label("Include this completed asset as context")).not_to_be_checked()
            chat.get_by_label("Your crypto question").fill("Unrelated fixture question")
            chat.get_by_role("button", name="Ask crypto chat").click()
            expect(chat.locator(".chat-status")).to_have_text("Out of scope")
            assert not chats[2]["messages"]

            page.set_viewport_size({"width": 390, "height": 844})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile overflow"
            expect(page.locator(".dolphin")).to_be_visible()
            page.emulate_media(reduced_motion="reduce")
            assert page.locator(".dolphin-body").evaluate("element => getComputedStyle(element).animationName") == "none"
            page.get_by_role("button", name="Reset profile and remove saved preferences").click()
            assert page.evaluate("key => localStorage.getItem(key)", KEY) is None
            page.reload()
            expect(page.locator(".card--chat")).to_be_visible()
            expect(page.locator(".chat-turn")).to_have_count(0)
            assert not errors, errors
            print(json.dumps({"fixture_only": True, "browser_errors": errors, "mobile_no_overflow": True, "search_detail_selection": True, "profile_opt_in_and_reset": True, "session_chat_and_asset_consent": True, "chat_profile_sharing_blocked": True, "live_model_calls": 0}, indent=2))
            browser.close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


if __name__ == "__main__":
    main()
