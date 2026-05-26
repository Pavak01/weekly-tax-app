# Security To-Do List

## Done now
- [x] Add two-step verification using authenticator codes
- [x] Require a second code before completing sign-in when 2-step verification is enabled
- [x] Protect stored 2-step secrets with server-side encryption
- [x] Run dependency audit and remediate backend production vulnerabilities (0 remaining as of 2026-05-26)

## Next priorities
- [x] Restrict CORS to trusted app and admin origins only
- [x] Add rate limiting for sign-in, reset-password, and upload endpoints
- [x] Remove internal stack or database details from production API error responses
- [x] Add basic security headers for API responses
- [x] Move mobile auth tokens to secure device storage where available
- [ ] Add backup recovery codes for locked-out users (Owner: Backend/Auth, Due: 2026-06-14)
- [ ] Add sign-in and admin action audit logs (Owner: Backend/API, Due: 2026-06-10)
- [ ] Add alerting for repeated failed sign-in attempts (Owner: Ops/Monitoring, Due: 2026-06-08)
- [ ] Add session revocation on password reset and 2-step verification changes (Owner: Backend/Auth, Due: 2026-06-12)
- [ ] Review receipt malware scanning and content validation for uploads (Owner: Backend/Storage, Due: 2026-06-16)
- [ ] Schedule dependency and secret rotation reviews quarterly (Owner: Security/Ops, Due: 2026-06-20)
- [ ] Upgrade Expo SDK/toolchain to clear current mobile advisory set (mobile: 20, mobile-release: 19 as of 2026-05-26) (Owner: Mobile/Release, Due: 2026-06-18)
- [ ] Add a monthly dependency audit task with owner and due date in ops runbook (Owner: DevOps, Due: 2026-06-07)

## Immediate operational priorities
- [ ] Enable and verify daily database backups + point-in-time recovery (PITR) (Owner: Ops/DBA, Due: 2026-06-05)
- [ ] Run and document monthly restore drill in Railway (Owner: Ops/SRE, Due: 2026-06-09)
- [ ] Add alerting for API 5xx spikes, auth failures, and receipt download failures (Owner: Ops/Monitoring, Due: 2026-06-06)

## Security pass status (2026-05-26)
- Backend npm audit (production deps): 0 vulnerabilities after updates and audit fix
- Mobile npm audit (production deps): 13 high, 7 moderate (total 20)
- Mobile-release npm audit (production deps): 13 high, 6 moderate (total 19)
- Release recommendation: keep backend releasable, track mobile advisories as accepted temporary risk until SDK upgrade branch is validated
