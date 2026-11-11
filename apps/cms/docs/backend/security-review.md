# Security review (handoff 09 step 2): threat model and mitigations

STRIDE-lite over the surfaces the CMS exposes. "Test" names the automated check that holds the line.
Still to do before a paid pilot: Aikido scan + AI pentest on staging (step 3), results appended here.

| Threat | Surface | Mitigation | Test |
|---|---|---|---|
| Cross-tenant read/write | every public function | Wrapped `siteQuery/siteMutation/siteAction` (site in the caller's active org + role); same answer for missing / foreign / no membership | `access.test.ts` (f) static sweep; `authzSweep.test.ts` calls every site function as an outsider and anonymously |
| Clerk JWT / org claim confusion | auth | Active org from the `org_id` claim decides the workspace; a member of two orgs sees only the active one | `access.test.ts` "a JWT for W2 cannot reach W1's sites" |
| Webhook forgery / replay | `/clerk/webhook`, `/github/webhook`, `/polar/webhook` | svix, `X-Hub-Signature-256`, Standard Webhooks HMAC over the raw body; deliveries deduped in `webhookEvents`; tenant only from installation + repo (GitHub) or our own signed checkout metadata (Polar) | `gitHooks.test.ts`, `billing.test.ts`, `lib/git.test.ts` |
| Install / OAuth state forgery | `/github/setup`, `/oauth/google/callback` | HMAC-signed, expiring install state bound to site + user; Google state single-use + expiring, PKCE verifier sealed; redirect allowlist (own settings page only) | `lib/git.test.ts`, `gsc.test.ts` |
| Repo writes outside scope | `gitNode.openPr` | `assertWritable` on every path (contentDir/**, assetDir/**, index files; no traversal, `.github`, package/lock/build/env); branch can never be the base; tokens scoped to one repo, minted per call | `lib/git.test.ts` allowlist cases |
| Merging unvalidated code | `mergePr`, auto-merge | Merge passes the CI-validated head SHA (GitHub refuses if moved); auto-merge only autopost + green CI + gate still green; no-CI repos merge only on explicit confirm | `slots.test.ts` MR refusals, `pipeline.test.ts` |
| SSRF | MCP URLs, image downloads, fact sources | https only (localhost on dev); DNS resolved and private/loopback/link-local/metadata/CGNAT refused on every hop; manual redirects | `connectionsNode.privateAddress` (unit via `assertPublicUrl`) |
| Prompt injection (scraped pages, MCP output, site text) | agents | Retrieved content marked as data in every contract; tools can't change site, budget, repo or gate; the no-invention guard drops edits that add numbers/URLs; fact markers re-checked by the on-page audit after every edit | `agents/editor.test.ts`, `agents/agents.test.ts` |
| Template / SVG XSS | templates, diagrams, uploads | `stripUnsafe` in the renderer; preview iframe without scripts; `/tpl` serves HTML as text/plain + nosniff; `sanitizeSvg` on every SVG before storage | `render.test.ts`, `svg.test.ts` |
| Path traversal in bundles | template zips | `safeBundlePath` on every entry; caps on bytes/files | `serialize.test.ts` (zip with `../evil.html`) |
| Secret exfiltration | prompts, logs, responses | Keys sealed per tenant (AES-GCM, AAD = site + owner); never returned (hasSecret + hint only); never placed in prompts; Google tokens and PKCE verifier sealed | `lib/crypto.test.ts` |
| Cost exhaustion | agent runs | Hold the worst case before any call; atomic cap check; settle once; replay guard; no workflow retry on paid steps; scheduled spend needs a second opt-in | `agents/agents.test.ts`, `spend.test.ts`, `billing.test.ts` |
| Stale lock abuse | editor | Locks older than 2 minutes are ignored | `postEdits.test.ts` |
| Data lifecycle | delete / export | Admin + slug confirm; background purge of every table and stored file; retention for webhook deliveries and presence | `ops.test.ts` |

## Known gaps (tracked)

- Langfuse traces and Sentry capture are not wired (no keys yet); failures land in run rows + audit.
- Per-site agent rate limits (beyond caps) not added; caps bound spend, not request rate.
- Autumn metering deferred (D3/D4/D15).
- Image search relevance is weak for licensed sources; a person always picks before shipping (autopost picks the first).
