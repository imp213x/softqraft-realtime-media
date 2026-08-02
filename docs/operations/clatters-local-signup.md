# Clatters local signup — verification code

## Symptom

You register a local account but never receive an email / “token” to verify.

## Cause

In `NODE_ENV=development`, Clatters **does not send real email**.  
`server/utils/emailUtils.js` stubs Resend/SES and only logs to the **server terminal**.

Previously it logged only `To` + `Subject`, **not** the 6-digit code. That is fixed to print the code and body in dev.

This is **not** a JWT misconfiguration for SoftQraft LiveKit. JWT secrets in `.env` are for Clatters session auth; verification uses a **one-time email code**.

## How to get the code

1. Restart Clatters after the emailUtils fix:

```powershell
cd C:\Dev\The_Scholar
npm run dev
```

2. Register or click **resend verification** in the UI.

3. Watch the **same terminal** where `npm run dev` runs. Look for:

```text
[Email][dev] To=you@example.com Subject=...
[Email][dev] Verification/code: 123456
[Email][dev] Body: Welcome to Clatters... Your verification code is: 123456...
```

4. Enter that 6-digit code in the UI.

## If the log still has no code

- Confirm `NODE_ENV=development` in `.env`.
- Request a new code (wait 60s if rate-limited).
- Optional: verify user in Mongo (dev only):

```javascript
// mongosh
use the_scholar_dev
db.users.findOne({ email: "you@example.com" }, { email: 1, verified: 1, emailVerificationToken: 1 })
// code is hashed — prefer console log, not DB
```

Or mark verified in Mongo for pure local testing (dev only):

```javascript
db.users.updateOne({ email: "you@example.com" }, { $set: { verified: true } })
```

## SoftQraft LiveKit env

Only needed after you can log in. Signup verification is independent of LiveKit/MinIO.
