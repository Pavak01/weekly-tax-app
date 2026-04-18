# Security To-Do List

## Done now
- [x] Add two-step verification using authenticator codes
- [x] Require a second code before completing sign-in when 2-step verification is enabled
- [x] Protect stored 2-step secrets with server-side encryption

## Next priorities
- [x] Restrict CORS to trusted app and admin origins only
- [x] Add rate limiting for sign-in, reset-password, and upload endpoints
- [x] Remove internal stack or database details from production API error responses
- [x] Add basic security headers for API responses
- [ ] Move mobile auth tokens to secure device storage where available
- [ ] Add backup recovery codes for locked-out users
- [ ] Add sign-in and admin action audit logs
- [ ] Add alerting for repeated failed sign-in attempts
- [ ] Add session revocation on password reset and 2-step verification changes
- [ ] Review receipt malware scanning and content validation for uploads
- [ ] Schedule dependency and secret rotation reviews quarterly
