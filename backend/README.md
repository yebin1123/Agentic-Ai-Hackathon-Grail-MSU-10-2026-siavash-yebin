# Stock Research Buddy Backend

This backend implements the MVP research API described in the shared contract.

## Features
- `GET /api/v1/health`
- `POST /api/v1/stock-analysis`
- Validates ticker and question inputs
- Returns a structured research summary with key points, risks, and sources
- Pulls market snapshot data and fallback news when live providers are unavailable
- Includes macro context fields describing volatility, volume, and broader market conditions

## Run locally

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then test:

```bash
curl http://localhost:8000/api/v1/health
curl -X POST http://localhost:8000/api/v1/stock-analysis \
  -H "Content-Type: application/json" \
  -d '{"ticker":"NVDA","question":"What are the biggest risks and growth drivers?"}'
```

## Notes
- Market and news calls are intentionally resilient: if a provider fails, the API still returns a valid response with warnings instead of crashing.
- The app avoids inventing live numbers or sources; when a live source is unavailable, it returns warnings and partial data.
