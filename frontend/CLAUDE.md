# orbit — rules for Claude Code

You are building a new front end for a self-hosted Monica 4 instance (v4.1.2).
The full spec is in SPEC.md next to this file.
The owner's data must never be lost, overwritten or corrupted.

## Environment (this server)
- You run as the Linux user `orbit-dev`, in ~/orbit (a fork of monicahq/monica, branch `orbit`).
- Staging Monica: http://127.0.0.1:8081 (a restored copy). This is the only Monica you may call.
- Production Monica runs on this same machine under another user. You cannot and must not reach it:
  never read or edit anything under /home/ubc, never run docker, sudo, mysql or mariadb.
- You have no Docker access. If a task needs Docker (building the image, restoring staging),
  write the exact commands for the owner to run and stop.
- Dev server: `pnpm dev --host 127.0.0.1` (port 5173). The owner views it through an SSH tunnel.

## Hard rules
- Work only inside frontend/. Never edit Monica's PHP, migrations, database/ or config.
- Never connect to the production Monica. Use MONICA_URL from .env.development (staging).
- Never run SQL against Monica's database. Use the REST API only.
- Never send DELETE requests to Monica (the only future exception is the merge feature in the backlog, which needs explicit owner confirmation per merge).
- All Monica writes go through lib/server/monica/guards.ts:
  read-only switch, allowlist, fetch-merge-send, conflict check, audit log.
- Never add a generic proxy that forwards arbitrary requests to Monica.
- Never log, print or commit MONICA_TOKEN.
- Paginate with `?page=` until `meta.last_page`. Never follow the absolute URLs in `links`:
  in production orbit calls Monica as http://127.0.0.1:80, so those URLs are wrong.
- Before adding a new write endpoint: write its guard test first, run it on staging,
  show the owner the before/after JSON from the audit log, and wait for approval.

## Workflow
- Build one slice at a time, in order (SPEC.md: Features by slice).
- Verify every API path and payload on staging with a small script before building UI on it.
- Run pnpm test and pnpm check before every commit.
- Small commits on orbit/<feature> branches; never commit to 4.x.
- Mobile first and Firefox included: test every page in Firefox at phone size.
- The production server listens on 127.0.0.1:3000 (adapter-node, HOST and PORT env vars).
- When unsure whether something could change data, stop and ask.
