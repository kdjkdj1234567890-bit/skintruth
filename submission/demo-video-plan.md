# Demo video plan (1:45-2:30, PUBLIC YouTube - upload only after the user's yes)

Recording: screen-capture the live site (OBS or Chrome recorder), 1080p, English voiceover,
no background music (trademark/copyright rule), generic sample product names only.

0:00-0:15  Hook: "Skincare runs on hope. You use a serum for a month and judge it by bathroom
           lighting. SkinTruth makes it measurable - and honest about what it can't prove."
0:15-0:40  Check tab LIVE: upload a selfie, click "Analyze my skin", watch the real YouCam AI
           Skin Analysis API return 8 scores. Point out the live API-units counter in the header.
0:40-1:00  Progress tab: click "view a sample 4-week journey" - show the badge on screen and say
           out loud: "this sample history is illustrative; it never feeds verdicts. Only your own
           live analyses count."
1:00-1:25  Products tab: log a product with target concerns and a start date.
1:25-1:55  Verdict tab - the honesty demo: with only one real check, the app says exactly what it
           needs ("no check from before you started it", "too early to tell") and explains why:
           minimum tracking windows, pre-product baseline, association-not-proof wording, and the
           ingredient pointers for concerns that are not moving.
1:55-2:15  Architecture: browser -> Vercel serverless (API key hidden, rate-limited) -> YouCam
           API; history on-device, nothing stored server-side.
2:15-2:30  Close: repo + live URL on screen. "SkinTruth: trends you can trust, limits you can see."
