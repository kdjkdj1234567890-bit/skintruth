# SkinTruth - Is your skincare actually working?

## Inspiration
Skincare runs on hope. People buy a serum, use it for
weeks, and decide whether it "works" by looking in the bathroom mirror under
different lighting every day. There is no measurement, so marketing claims win
by default. SkinTruth gives regular people an objective, repeatable skin score built on
Perfect Corp's market-tested Skin AI - so they can see whether their skin
scores actually moved while using a product.

## What it does
SkinTruth is a web app that answers one question honestly: is your skincare
actually working?

1. **Check** - Take or upload a front-facing selfie. SkinTruth calls the
   YouCam AI Skin Analysis API and returns 8 objective scores (moisture, oil
   balance, redness, acne, pores, texture, wrinkles, radiance), each 0-100.
2. **Progress** - Every check is stored on your device. Sparkline charts show
   how each concern moved since your baseline, with the delta ("+13 vs
   baseline"). (In the demo video and screenshots, the multi-week history is
   clearly labeled sample data for illustration - only the live analysis is a
   real API measurement.)
3. **Products** - Log the products you are using and the concerns each one
   targets.
4. **Verdict** - SkinTruth compares scores before and after you started each
   product and reports the trend honestly: "scores up since you started (an
   association, not proof)", "no clear change", or "worth reviewing your
   routine" - plus an "ingredients often used for this concern" pointer so the
   loop continues into retail discovery. Sample data never feeds verdicts, a
   product needs a pre-start baseline and minimum tracking windows (about 3
   days for surface concerns, 14 for deeper ones), and the 5-point cutoff is
   labeled an unvalidated heuristic, not statistical significance.

The live API unit balance is shown in the header, so the integration is
transparent and auditable.

## How we built it
- **YouCam AI Skin Analysis API** (Perfect Corp) for the 8 skin concern
  scores (ui_score fields, where higher means healthier skin), via the File
  upload flow: presigned upload, task creation, polling.
- **Node.js serverless functions** on Vercel (`/api/analyze`, `/api/result`,
  `/api/balance`) hold the API key server-side - the browser never sees it.
- **Zero-dependency front end** (vanilla HTML/CSS/JS). All history and
  products live in the browser's localStorage: no accounts, no tracking, no
  database. Photos are sent to the SkinTruth backend only to be forwarded to
  the YouCam API for analysis; nothing is stored server-side.
- The verdict engine compares latest vs baseline scores per concern with a
  ±5-point significance threshold.

## Challenges we ran into
- The API requires the face to cover most of the frame, so the app guides
  framing up front ("face should fill most of the frame") and resizes images
  client-side before upload.
- Units are only consumed on successful tasks, so the app is careful to create
  one task per check and poll efficiently - important on the free tier.
- Skin scores fluctuate day to day; the verdict threshold had to be strict
  enough to avoid "your cream works!" noise.

## Accomplishments that we're proud of
- A real end-to-end product in the hackathon window: live deployment, real API
  integration, real measurements. Demo history is visibly badged as sample
  data in the app itself; we do not present simulated trends as real results.
- Privacy by architecture: no sign-up, no server-side photos, no database.
- The verdict phrasing is honest - "no measurable effect yet" is a first-class
  result, not an error.

## What we learned
- The YouCam API's concern set (13 SD actions) and its task/polling model, and
  how to budget free-tier units (~4.5 units per concern).
- How much framing/face-size constraints matter for consumer selfie flows.

## What's next for SkinTruth
- Before/after overlays using the API's concern heat-map masks.
- Capture-condition matching (lighting/framing consistency score vs baseline)
  to cut measurement noise.
- Rolling averages across repeated checks and a confidence indicator.
- Export/import of on-device history, reminders to re-check, optional sync.
