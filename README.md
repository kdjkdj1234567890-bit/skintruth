# SkinTruth — is your skincare actually working?

SkinTruth turns the YouCam **AI Skin Analysis API** into a proof loop for skincare buyers.
Instead of trusting marketing, users take a front-facing selfie every couple of weeks;
SkinTruth scores 8 skin concerns per check, tracks the trend, and answers one question
per product: **keep it, or drop it.**

## Why

People buy skincare on promises and judge results by mirror vibes. The moment of doubt —
"is this serum actually doing anything?" — happens right before a repurchase decision.
SkinTruth meets that moment with measured before/after data, so consumers stop paying
for products that don't work for them, and retailers sell on evidence instead of hype.

## Features

- **Skin check** — camera or upload; the YouCam AI Skin Analysis API scores
  moisture, oil balance, redness, acne, pores, texture, wrinkles and radiance (0–100).
- **Progress** — per-concern trend charts against your baseline, with deltas.
- **Products** — log what you use and which concerns it targets.
- **Verdict** — per product: "Keep using — it is working" / "No measurable effect yet" /
  "Consider dropping", computed from your measured deltas (±5 pts over the period).
- **Unit transparency** — the header shows remaining API units in real time.

## Tech

- Static frontend (`public/`, no build step, no framework).
- Serverless API (`api/`, Node, zero dependencies) that keeps the API key server-side:
  - `POST /api/analyze` — image data URL → YouCam File API → pre-signed upload → task.
  - `GET /api/result?task_id=` — task status / scores (client polls; units are only
    consumed on success, never on running or error).
  - `GET /api/balance` — remaining API units (free endpoint).
- History and products live in `localStorage` — no database, no sign-up, nothing leaves
  the device except the selfie sent to the YouCam API for analysis.

## Run locally

```bash
export YOUCAM_API_KEY=sk-...        # from https://yce.perfectcorp.com/api-console/
node tools/dev-server.js            # http://localhost:3456
```

## Deploy (Vercel, free)

```bash
npm i -g vercel
vercel env add YOUCAM_API_KEY       # paste the key
vercel deploy --prod
```

## Photo tips (from the API's requirements)

Front-facing selfie, hair down, even lighting. The face must cover >60% of the image
width — the app crops for you, but a close framing works best.

## API unit economics (measured)

~4.5 units per concern per check → an 8-concern panel costs ~36 units.
The hackathon's 1,000 free units cover ~25+ full checks.

## Hackathon

Built for the YouCam API Skin AI & eCommerce VTO Hackathon (Perfect Corp, Devpost, 2026).
