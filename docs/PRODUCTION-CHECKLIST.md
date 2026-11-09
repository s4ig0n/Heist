# Production and submission checklist

## Verified locally on November 9, 2026

- [x] `npm ci` completes from the root lockfile.
- [x] `npm test` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` completes without a network font dependency.
- [x] Legacy mock pages redirect to the real Arena, Replay, and Report.
- [x] The app works without an AG Studio license, with the trial watermark.
- [x] License and model keys are server-side environment variables and are not committed.
- [x] Render is configured with `DATA_MODE=live`, `PAYPAL_ENVIRONMENT=SANDBOX`, serialized run protection, and a daily cap.
- [x] The Forensics Analyst is wired through `/api/analyst` with all four required custom tools.
- [x] Arena and Report expose keyboard focus plus explicit loading, empty, error, and retry states.
- [x] Discarded preview routes and their unverified-number fixtures are absent from the repository.

## Requires deployment access

- [ ] Add the AG Studio trial license to the Render `AG_STUDIO` secret.
- [ ] Add the analyst model key to `AG_STUDIO_OPENAI_API_KEY`.
- [ ] Confirm `GET /api/replays` is healthy on the production URL.
- [ ] Open `/heist/arena`, `/heist/replay`, and `/heist/report` in an incognito window.
- [ ] Replay `baseline-run` at 4× and confirm the Vault Meter reaches $167.00.
- [ ] Confirm Time Traveler shows the verified $96.00 refund and recorded PayPal read-back.
- [ ] Ask the Forensics Analyst “Which persona cost us most? Chart it.” and confirm it creates a chart.
- [ ] Open the patched report and confirm $0.00 leaked, score 100, and Honest Hannah refunded $129.00.
- [ ] Check the browser console and network panel for errors, failed requests, or hydration warnings.
- [ ] Test keyboard-only navigation and a narrow mobile viewport.

## Submission assets

- [x] Devpost description and runtime AI disclosure are in `docs/DEVPOST.md`.
- [x] The 2:45 demo script and storyboard are in `docs/VIDEO-SCRIPT.md`.
- [ ] Record the final take from the production URL.
- [ ] Upload the video publicly and add its URL to Devpost.
- [ ] Add production URL, public repository URL, screenshots, and video URL to Devpost.
- [ ] Complete a final incognito pass before submitting.

Do not mark an unchecked item complete without observing it directly.
