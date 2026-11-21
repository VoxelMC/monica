# orbit

A read-first front end for a self-hosted Monica 4.1.2. Rules: `CLAUDE.md`. Spec: `SPEC.md`.

## Develop

```bash
pnpm install
pnpm dev --host 127.0.0.1      # http://127.0.0.1:5173, /health checks GET /api/me
pnpm test                      # unit tests (client, guards, config)
pnpm test:staging              # read-only checks against staging Monica
pnpm test:e2e                  # Playwright, Firefox + Chromium, phone + desktop
pnpm check                     # svelte-check / TypeScript
pnpm db:generate               # new Drizzle migration after editing src/lib/server/db/schema.ts
```

Config comes from `.env.development` (never committed; see `.env.example`). In dev, orbit refuses
to start unless `MONICA_URL` is staging (`http://127.0.0.1:8081`).

## Layout

- `src/env.ts`: environment variables, validated at startup (`ORBIT_READ_ONLY` defaults to `true`)
- `src/lib/server/monica/client.ts`: transport (auth, rate limit, 429, refuses DELETE and read-only writes) and the read client (pagination by `?page=`, cache, Zod)
- `src/lib/server/monica/guards.ts`: the only write path (read-only, allowlist, fetch-merge-send, conflict check, dry run, audit log). The allowlist is empty until slice 4.
- `src/lib/server/monica/contacts.ts`, `contact-page.ts`: read-only loaders for the People list and contact page
- `src/lib/contacts.ts`, `src/lib/contact.ts`: client-safe search, sort, birthday and link helpers
- `src/lib/server/audit.ts`, `src/lib/server/db/`: extension DB (SQLite + Drizzle); migrations in `drizzle/`

### Playwright without sudo

The host lacks `libasound2t64`. Without root, unpack it into your home folder and point the browsers at it:

```bash
D=~/.local/libasound; mkdir -p $D/deb && (cd $D/deb && apt-get download libasound2t64) && dpkg -x $D/deb/libasound2t64_*.deb $D/root
LD_LIBRARY_PATH=$D/root/usr/lib/x86_64-linux-gnu PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 pnpm test:e2e
```

(Or, as an admin: `sudo apt-get install libasound2t64`.)
