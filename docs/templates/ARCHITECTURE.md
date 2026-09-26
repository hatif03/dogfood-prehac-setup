# ARCHITECTURE

Purpose: the shape of the system and why. Read by Dogfood judges. Carries Adoptability and Code Quality weight.

Status: template — copy to repo root after `plans/01-stack-and-runtime.md` is implemented.

Non-goals: tutorial, framework praise, diagrams without a decision.

## Contract

A senior reviewer should know: process boundaries, trust boundaries, where RBAC lives, where files live, how seed works, what happens if Redis or MinIO is down.

## Shape

```
browser → web (Next.js standalone)
       → api (FastAPI)
            → postgres
            → redis
            → minio
            → mailpit (dev SMTP)
```

## Why this stack

- FastAPI: OpenAPI for free (API First bonus), Python for Bradley-Terry / robust z-score
- Next.js standalone: self-hosted UI, no Vercel required
- Postgres: one database a DBA can defend
- MinIO: S3-compatible uploads without AWS
- Redis: rate limits and webhook retry, local
- Mailpit: email-gated votes without SendGrid

## Trust boundaries

- Session cookie, HttpOnly, SameSite, secure flag off only for local HTTP
- RBAC in API service layer (see `context/role-isolation.md`)
- Object URLs are not public-guessable; gallery uses API-mediated or signed local URLs

## Failure modes

| Dependency | If down |
| --- | --- |
| Postgres | Portal down (expected) |
| Redis | Rate limits fail closed; document behavior |
| MinIO | Uploads fail; metadata still readable |
| Mailpit | Email-gated voting cannot send; log the message |

## Worked example

Organizer creates event → participant submits before deadline → judge scores own ballot → organizer runs normalization → results stay hidden until publish.

## Open questions

- [ ] Exact service names in compose
- [ ] Where Next.js calls FastAPI (server-side vs browser)
