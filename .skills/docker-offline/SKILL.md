---
name: docker-offline
description: Keeps the portal one-command and offline. Use when editing docker-compose, adding dependencies, object storage, auth, email, or any third-party SDK.
---

# Docker offline

Allowed local services: PostgreSQL, MinIO, Redis, Mailpit, api, web.

## Ban list (runtime)

Neon, PlanetScale, hosted Supabase, AWS S3, Cloudinary, Clerk, Auth0, Firebase, Okta, SendGrid, Postmark, Stripe, OpenAI/Anthropic/Gemini inside the running app.

## Checks

- New dependency: does `docker compose up` still work with network off after images are pulled?
- Auth: sessions + Argon2 only.
- Files: MinIO.
- Mail: Mailpit.
- If a library phones home, do not add it.
