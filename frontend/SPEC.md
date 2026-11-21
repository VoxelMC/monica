# Monica Front End — Spec (orbit)

2026-11-21 · Trev Fox · rev. 2 (adapted to the server setup)

## Overview

Build a new, modern web front end for my self-hosted Monica 4 (v4.1.2, at `https://monica.trevfox.dev`) that talks only to Monica's REST API, lives in my fork of Monica, and never puts existing data at risk.

Monica stays the system of record. The new app is a second way to read and edit the same data. DAVx⁵ sync, birthdays and the old Monica UI keep working unchanged.

**In scope**

- A new UI for the pages I use most: contact list, contact page, dashboard
- Friendship-tracker features Monica lacks: catch-up timing, friend groups with stats, gift and souvenir planning
- A small backend that holds the API token and guards every write
- Deployment next to Monica on my server, reachable over Tailscale

**Not in scope (for now)**

- Changing Monica's PHP code, database schema or migrations
- Replacing Monica's DAV server
- Public internet access
- Multi-user support

**Working name:** `orbit` (rename freely).

## Data safety rules

No step of this project may lose, overwrite or corrupt existing Monica data; every rule below is a hard requirement, not a suggestion.

### Before writing any code

1. **Back up the database.** `mysqldump --single-transaction` of the Monica database (MySQL/MariaDB), compressed and dated.
2. **Back up the storage volume.** Copy Monica's `storage/` volume (photos, documents, avatars).
3. **Back up the `.env`.** It holds `APP_KEY`, which Monica needs to read encrypted fields. A database backup without the matching `APP_KEY` is not a full backup.
4. **Copy backups off the server.** At least one copy on another machine (NAS or laptop), not only on the server's disk.
5. **Test a restore once.** Restore the backup into a throwaway Monica container and check that contacts, notes and photos open. An untested backup does not count.
6. **Automate it.** A nightly cron job for steps 1–4, keeping 14 daily and 8 weekly copies.

**Status:** done by the starter bundle. `~/backups/monica/backup.sh` (user `ubc`) runs nightly at 03:17: `mariadb-dump --single-transaction`, the storage volume (tarred from inside the `app` container), `.env`, and `orbit-data/` once it exists; rsync to the NAS if `REMOTE` is set in `backup.conf`.

### Develop against a copy, never the real data

- **Staging Monica** lives in `~/repos/monica-staging` (user `ubc`): its own Compose project and database, the same image tag and `APP_KEY` as production, `APP_ENV=local`, mail to the log, and **no cron service** (no duplicate reminders). It listens only on `127.0.0.1:8081`.
- Refresh it from the newest backup with `~/repos/monica-staging/restore.sh` (owner runs it; it never touches production).
- Development happens as the Linux user **`orbit-dev`**: not in the `docker` group and unable to read `/home/ubc`, so neither production's `.env` nor its containers are reachable. Its `.env.development` holds only a staging token.
- The owner views the dev server and staging from the laptop through SSH tunnels: `ssh -L 5173:127.0.0.1:5173 -L 8081:127.0.0.1:8081 ubc`.

### Read-only first

- Slices 1–3 (see Features) are **read-only**. The backend refuses every non-GET request to Monica while `ORBIT_READ_ONLY=true`, which is the default.
- Writes are switched on per feature, only after they pass on staging.

### Write guards (in the backend)

| Rule | Why |
| --- | --- |
| **Fetch, merge, then send.** Every update first GETs the current record, changes only the fields being edited, then sends the whole object back. | Monica 4's `PUT` endpoints replace the record. Sending a partial object can blank fields that were left out. |
| **No DELETE calls** in v1 (except the merge feature in the backlog, behind confirmation). Deleting stays in the old Monica UI. | A bug cannot destroy anything. |
| **Allowlist of write endpoints.** The backend only forwards writes to endpoints explicitly listed in code. | No accidental writes through a generic proxy. |
| **Audit log.** Every write is recorded (time, endpoint, before JSON, after JSON) in the extension database. | Any change can be inspected and reversed by hand. |
| **Dry-run mode.** `ORBIT_DRY_RUN=true` logs what would be sent without sending it. | Check new write code safely. |
| **Conflict check.** Before sending, compare the record's `updated_at` with the value shown in the UI. If it changed, stop and ask. | Prevents overwriting a change made on the phone or in the old UI. |

### Upgrades

- Take a fresh backup before any Monica image upgrade.
- Pin the Monica image to an exact version tag; never use `latest`. Production and staging both use `monica:4.1.2-apache`.
- Do not run Monica 5 against this database.

## Architecture

orbit is a separate container that reads and writes Monica only through its REST API, so Monica's code, database and DAV sync stay exactly as they are.

```text
Browser (phone/laptop) ──HTTPS──> orbit (SvelteKit pages + server; holds token, guards writes)
                                    │                │
                                    │ REST + token   └──> Extension DB (SQLite: groups, gifts, audit log)
                                    v
Phone (DAVx⁵ + Samsung apps) ──────> Monica 4 (/api REST · /dav CardDAV+CalDAV · old web UI)
                                    │
                                    v
                               MySQL + storage volume (source of truth)

Nightly backup: Monica DB, storage, .env, extension DB → off-server copy
All of the above runs on my server (Docker Compose), reachable over Tailscale.
```

The browser never talks to Monica directly: orbit's server side holds the token and applies the write guards. The extension DB holds only orbit's own features and the audit log.

## Fork and repo setup

The new app lives in a `frontend/` folder of my own fork of `monicahq/monica`, on a branch cut from Monica's `4.x` branch, so Monica's own code stays untouched and upstream fixes stay easy to pull.

### Steps

The starter bundle's `4-orbit-dev-setup.sh` does steps 2–4 as `orbit-dev` (clone in `~/orbit`, branch `orbit` from tag `v4.1.2`). Step 1 is done by hand first. Production builds from a **separate clone owned by `ubc`** at `~/repos/orbit`, pulled from GitHub, so the dev user never touches deployment files.

1. On GitHub, fork `monicahq/monica` to my account (`VoxelMC/monica`). Untick "Copy the main branch only": `main` is the unfinished Monica 5 rewrite, and v4 lives on `4.x`.
2. Clone and set up remotes:

```bash
git clone git@github.com:VoxelMC/monica.git
cd monica
git remote add upstream https://github.com/monicahq/monica.git
git fetch upstream
git checkout -b orbit upstream/4.x
```

3. Confirm the branch matches the version I run (4.1.2; compare with the image tag in my compose file). If my server runs a tagged release, branch from that tag instead: `git checkout -b orbit v4.1.2`.
4. Create `frontend/` at the repo root and scaffold the app there (see Tech stack).
5. Push: `git push -u origin orbit`.

### Branch layout

| Branch | Purpose | Rule |
| --- | --- | --- |
| `4.x` | Mirror of upstream v4 | Never commit here; only fast-forward from `upstream/4.x` |
| `orbit` | My working branch: upstream v4 + `frontend/` | All new work lands here via small feature branches |
| `orbit/<feature>` | One slice or fix at a time | Merge into `orbit` after it passes on staging |

### Rules for the fork

- **Do not edit Monica's PHP, migrations or `database/` in this project.** Everything new goes in `frontend/`. That keeps upstream merges conflict-free and the database schema exactly as Monica expects.
- Keep running the **official Monica Docker image** in production. The fork is where my front end's code lives, not a custom Monica build.
- Pulling upstream fixes later:

```bash
git fetch upstream
git checkout orbit
git merge upstream/4.x
```

- If Monica's own templates ever need changing, that is a separate, later decision with its own backup and staging test.

## Tech stack and project structure

One SvelteKit app in TypeScript does both the pages and the small backend, and ships as one Docker container next to Monica.

| Layer | Choice | Reason |
| --- | --- | --- |
| Framework | SvelteKit + TypeScript | Pages and server routes in one project; server code keeps the token out of the browser |
| Styling | Tailwind CSS | Fast, consistent, modern look; easy dark mode |
| UI parts | shadcn-svelte (or Bits UI) | Accessible dialogs, menus, inputs without building them from scratch |
| Data fetching | SvelteKit `load` functions on the server | All Monica calls happen server-side |
| Validation | Zod schemas for every Monica response | Catches API surprises before they reach the UI or a write |
| Extension DB | SQLite via Drizzle ORM | Small, file-based, easy to back up; holds only my extra features and the audit log |
| Tests | Vitest (unit) + Playwright (pages) | Safe refactoring; write guards are tested |
| Package manager | pnpm | Fast, strict |
| Runtime | Node 22 LTS in Docker (`adapter-node`) | Simple to deploy beside Monica |

### Folder layout

```text
frontend/
  src/
    lib/
      server/
        monica/        # API client: one file per resource (contacts, notes, ...)
          client.ts    # fetch wrapper: auth header, pagination, rate limit, retries
          guards.ts    # read-only switch, write allowlist, fetch-merge-send, dry run
          schemas.ts   # Zod schemas for Monica responses
        db/            # Drizzle schema + migrations for the extension DB
        audit.ts       # writes the audit log
      components/      # UI components
      stores/          # client-side UI state only (no secrets)
    routes/
      +layout.svelte
      contacts/
        +page.server.ts   # list + search
        [id]/+page.server.ts
      dashboard/
      api/             # internal endpoints the pages call; never a raw Monica proxy
  tests/
  Dockerfile
  .env.example
  README.md
```

### Environment variables

| Variable | Example | Notes |
| --- | --- | --- |
| `MONICA_URL` | `http://127.0.0.1:8081` | Staging in dev; `http://127.0.0.1:80` in production (same network namespace as Monica) |
| `MONICA_TOKEN` | (secret) | Personal access token; server-side only |
| `ORBIT_READ_ONLY` | `true` | Default `true`; blocks all writes |
| `ORBIT_DRY_RUN` | `false` | Log writes instead of sending |
| `ORBIT_DB_PATH` | `/data/orbit.sqlite` | Extension DB file, on a backed-up volume (`./data/orbit.sqlite` in dev) |
| `HOST`, `PORT` | `127.0.0.1`, `3000` | adapter-node listen address in production |
| `ORIGIN` | `https://orbit.trevfox.dev` | Required by SvelteKit for form actions behind the proxy |

Never commit `.env`. Commit `.env.example` with placeholder values only.

## Monica API

The app uses Monica 4's REST API at `/api`, authenticated with a personal access token, and must check every endpoint and field below against my running instance before relying on it.

### Authentication

- Create the token in Monica: **Settings → API → Personal access tokens**. Make one for staging and a separate one for production.
- Send it on every request: `Authorization: Bearer <MONICA_TOKEN>`, plus `Accept: application/json`.
- The token has full access to my account. It lives only in the server's environment, never in the browser, logs or Git.
- First call to verify setup: `GET /api/me`.

### Conventions

- **Pagination:** list endpoints take `?page=` and `?limit=` (max 100) and return `data`, `links` and `meta`. The client walks pages by number until `meta.last_page` and **never follows `links`**: Monica builds those URLs from the request host, and in production orbit calls it as `http://127.0.0.1:80`.
- **Search:** `GET /api/contacts?query=<text>`.
- **Sorting:** `?sort=updated_at` or `?sort=-updated_at` where supported.
- **Extra data:** `GET /api/contacts?with=contactfields` includes phones and emails in one call.
- **Rate limit:** Monica throttles API calls per minute (configurable in its `.env`); a bulk migration script hit it once. The client queues requests, honours `429` and `Retry-After`, and caches lists for a short time.

### Known from the 2026-11-21 migration (verified on my instance)

- `GET /api/contacts`, `GET /api/contacts/{id}`, `GET /api/contacts/{id}/contactfields`, `GET /api/genders`, `GET /api/contactfieldtypes`, `GET /api/me` work as documented.
- `POST /api/contacts`, `POST /api/contactfields` and `PUT /api/contacts/{id}` (birthday via fetch-merge-send, needs `gender_id`) work.
- `POST /api/photos` (multipart: `contact_id`, `photo`) and `PUT /api/contacts/{id}/avatar` (`{"source":"photo","photo_id":…}`) work.
- The migration scripts (`migrate.py`, `photos.py`) in the NAS archive are working reference code for these calls.

### Found on staging 2026-11-21: some reads write

- Monica's `HasUuid` trait gives a record a `uuid` the first time it is read if it has none, and saves it. `save(['timestamps' => false])` does not stop Laravel from updating `updated_at`, and contact fields and addresses also touch their contact.
- Seen once on staging: the first `GET /api/contacts?with=contactfields` filled in the uuid of 3 contact fields created 17:35–17:38 that day and moved `updated_at` on them and on their 2 contacts. No content changed. Later reads changed nothing.
- So orbit is not strictly zero-write: the first read of a record without a uuid writes the uuid and a new `updated_at`. Expect DAVx⁵ to re-sync such contacts once, and the conflict check to stop once if this happens between loading and saving (fails safe).
- orbit cannot prevent this without changing Monica's PHP (out of scope). Take a fresh backup before orbit first reads production.

### Endpoints by feature

| Feature | Read | Write (only after its slice is approved) |
| --- | --- | --- |
| Contact list, search | `GET /api/contacts` | — |
| Contact page | `GET /api/contacts/{id}`, `GET /api/contacts/{id}/contactfields` | `PUT /api/contacts/{id}` (fetch-merge-send) |
| Phones, emails, socials | `GET /api/contactfields`, `GET /api/contactfieldtypes` | `POST /api/contactfields`, `PUT /api/contactfields/{id}` |
| Notes | `GET /api/contacts/{id}/notes` | `POST /api/notes`, `PUT /api/notes/{id}` |
| Activities (catch-ups) | `GET /api/contacts/{id}/activities`, `GET /api/activitytypes` | `POST /api/activities` |
| Calls, conversations | `GET /api/contacts/{id}/calls`, `GET /api/contacts/{id}/conversations` | `POST /api/calls` |
| Reminders, birthdays | `GET /api/reminders` | `POST /api/reminders` |
| Tasks | `GET /api/contacts/{id}/tasks` | `POST /api/tasks`, `PUT /api/tasks/{id}` |
| Gifts | `GET /api/contacts/{id}/gifts` | `POST /api/gifts`, `PUT /api/gifts/{id}` |
| Relationships | `GET /api/contacts/{id}/relationships` | — (use old UI) |
| Tags | `GET /api/tags` | `POST /api/contacts/{id}/setTags` |
| Addresses | `GET /api/contacts/{id}/addresses` | `PUT /api/addresses/{id}` |
| Photos, avatar | `GET /api/contacts/{id}/photos` | `POST /api/photos`, `PUT /api/contacts/{id}/avatar` |
| Reference lists | `GET /api/genders`, `GET /api/countries` | — |

**Open question:** confirm each remaining path and payload on staging with a quick script before building its page. Anything missing from the API stays in the old Monica UI or the extension DB.

## Features by slice

Work ships in six slices: the first three only read data, and writing starts in slice 4 after the read-only app has run cleanly for at least a week.

### Slice 0 — Safety and plumbing (no UI)

- Backups, restore test and staging Monica in place (Data safety rules)
- API client with pagination, rate limiting, Zod validation
- Guards: read-only switch, write allowlist, dry run, audit log table
- `GET /api/me` health page

**Done when:** the restore test has passed, and a test proves that every non-GET request is refused while `ORBIT_READ_ONLY=true`.

### Slice 1 — Contact list and search (read-only)

- List all contacts as cards: avatar or initials, name, nickname, tags, last activity date
- Instant search (name, nickname, email, phone)
- Filter by tag; sort by name, last contacted, recently added
- Responsive: works one-handed on my phone

**Done when:** the list count matches Monica's, search finds a contact by phone number, and the page loads in under 1 s with a warm cache.

### Slice 2 — Contact page (read-only)

- Header: name, photo, birthday with age and days until next
- Contact fields: phones, emails, socials, addresses (tap to call, mail, map)
- Timeline: notes, activities, calls and conversations, newest first
- Side panels: relationships, tasks, gifts, reminders
- "Open in Monica" link to the same contact in the old UI

**Done when:** for 10 sampled contacts, every field shown matches the old UI.

### Slice 3 — Dashboard (read-only)

- Birthdays in the next 30 days
- "Catch up soon": contacts past their target interval since the last activity
- Recently added or updated contacts
- Open tasks across contacts

**Done when:** the birthday list matches the Monica calendar on my phone for the next 30 days.

### Slice 4 — First writes

- Log a catch-up (activity) from the contact page in two taps
- Add a note
- Edit phones and emails

**Done when:** each write passes on staging; the audit log shows correct before and after JSON; a write made on the phone in between triggers the conflict check; DAVx⁵ shows the change on the phone.

**Tags and batch editing (requested 2026-11-21; owner chose: read-only parts now, writes with this slice)**

Read-only parts, already built: tag overview page with counts, tag chips (any/all, untagged), select mode with "select all shown", copy emails/phones, personal sections folded on the contact page.

Writes, in this order, each with its own guard test and owner approval of real staging audit entries:

| Action | Monica call (verified in v4.1.2 source) | Notes |
| --- | --- | --- |
| Add tag to many | `POST /api/contacts/{id}/setTags` `{"tags":["name"]}`, one per contact | Additive only; creates the tag if missing |
| Log a catch-up with many | `POST /api/activities` with several `contacts` | One write for the whole group |
| Rename a tag | `PUT /api/tags/{id}` `{"name":…}` | One write; contacts keep the tag |
| Merge tag A into B | `setTags` B, then `unsetTag` A, per contact | Deleting the empty tag A stays in the old UI (no DELETE) |
| Remove tag from many | `POST /api/contacts/{id}/unsetTag` `{"tags":[tag_id]}`, one per contact | Detaches only; the tag remains |

**Logging hangouts and journal entries (requested 2026-11-21; read-only parts built, saving with this slice)**

Built: a **Log** button in the middle of the phone tab bar (top of the sidebar on desktop) opening `/log`; "Log a catch-up" on each contact page and "Log catch-up…" in select mode open it with those people filled in; a **Diary** page lists activities and journal entries, newest first. Save is disabled; Preview shows the exact request.

| Entry | Monica call (from v4.1.2 source) | Notes |
| --- | --- | --- |
| Hangout | `POST /api/activities` `{summary, happened_at (Y-m-d), contacts:[ids], activity_type_id?, description?}` | One write for any number of people; shows on each timeline and updates "last activity" |
| Journal entry | `POST /api/journal` `{title, post}` | Check on staging whether `date` is accepted (the controller mass-assigns the request) |

**Per-person notes and journal mentions (requested 2026-11-21; owner chose readable text + orbit link)**

- A hangout can carry a note per person ("what I learned about them"). Each becomes `POST /api/notes` `{contact_id, body}` with a first line `From: <summary> · <date>`, sent after the activity, so it shows on that person's page in orbit and in Monica.
- In journal entries, typing `@` offers people; picking one inserts plain `@Full Name` into the text, so Monica and its old UI read normally. orbit stores which contact was meant in the extension DB, after Monica returns the entry id:

| Table | Columns | Purpose |
| --- | --- | --- |
| `journal_mentions` | `journal_entry_id`, `monica_contact_id`, `name`, `created_at` | Exact links from a journal entry to the people mentioned; lets the contact page show "Mentioned in journal" |

- A batch here is several requests (activity, then notes): stop at the first error, show which were saved, never retry one that may have reached Monica.

Payloads come from `src/lib/log.ts` (`hangoutPayload`, `journalPayload`), so the preview and the real write cannot drift apart. `/log` has no form action until this slice is approved.

Never allowlist `POST /api/contacts/{id}/unsetTags` (removes every tag) or `DELETE /api/tags/{id}`.

Batch rules: show the exact list of contacts and the change before sending; one audit row per contact; stop at the first error and report which contacts were done; stay under Monica's rate limit (60/min) with a visible progress count; a batch never retries a write that may have reached Monica.

### Slice 5 — My own features (extension DB)

- Target catch-up interval per contact (e.g. every 3 weeks)
- Friend groups with stats: last time together, total activities, who is overdue
- Gift ideas per person with status (idea, bought, given)
- Souvenir reminders tied to trips: "bring something back for" lists

**Done when:** these work without writing anything new into Monica's database, and the extension DB is in the nightly backup.

### Backlog — features found while using Monica

- **Merge duplicate contacts.** Monica 4.1.2 has no merge button, so duplicates (e.g. from a DAVx⁵ sync) must be fixed by hand and deleted. Build a merge screen: pick two contacts side by side, choose which value wins per field, move notes, activities, reminders, gifts and tags onto the kept contact, then delete the other. Uses fetch-merge-send for the kept contact, logs both records in the audit log, and needs explicit confirmation — this is the one place the app is allowed to delete, and only after everything has been moved.
- **Photos and avatars.** Show contact photos and allow uploading or replacing one (API verified, see above).

## Extension database

Features Monica lacks are stored in a separate SQLite file owned by the new app, linked to Monica only by contact ID; nothing is ever written into Monica's own database.

| Table | Columns | Purpose |
| --- | --- | --- |
| `contact_meta` | `monica_contact_id` (PK), `catchup_interval_days`, `pinned`, `updated_at` | Catch-up targets and pins |
| `groups` | `id`, `name`, `colour`, `created_at` | Friend groups |
| `group_members` | `group_id`, `monica_contact_id` | Who is in each group |
| `gift_ideas` | `id`, `monica_contact_id`, `title`, `link`, `occasion`, `status` (idea, bought, given), `price`, `currency`, `created_at` | Gift planning |
| `trips` | `id`, `name`, `destination`, `start_date`, `end_date` | Trips for souvenir lists |
| `souvenir_list` | `trip_id`, `monica_contact_id`, `note`, `done` | Who to bring something back for |
| `audit_log` | `id`, `at`, `method`, `endpoint`, `monica_id`, `before_json`, `after_json`, `dry_run`, `result` | Every write sent (or not sent) to Monica |

**Rules**

- Use Drizzle migrations; never edit tables by hand.
- Store the file on a Docker volume included in the nightly backup.
- If a Monica contact is deleted, its extension rows are kept and flagged, not deleted, until I clean them up by hand.
- Never copy Monica data into this database except inside `audit_log` snapshots. Monica stays the single source for names, fields and history.

## Design system and UI guidelines

The look is calm, modern and phone-first: soft cards, generous spacing, one accent colour, and dark mode from day one.

| Element | Guideline |
| --- | --- |
| Layout | Mobile first; a single column on phones, list + detail side by side from 1024 px |
| Navigation | Bottom tab bar on phone (Dashboard, People, Groups, Search); left sidebar on desktop |
| Type | Inter or the system UI font; 16 px body, 14 px secondary, clear heading steps |
| Colour | Neutral greys, one accent (pick one; e.g. teal), status colours only for meaning (overdue, birthday soon) |
| Shape | 12 px corner radius on cards, 8 px on inputs; thin borders instead of heavy shadows |
| Dark mode | Follows the system setting, with a manual toggle |
| Avatars | Photo if present, else initials on a colour derived from the name |
| Motion | Short, subtle transitions (150–200 ms); none that delay an action |
| Empty states | Say what is missing and offer the next action ("No catch-ups yet. Log one") |
| Accessibility | Keyboard navigable, visible focus, contrast ratio at least 4.5:1, labels on all inputs |
| Language | Plain, positive wording; dates as "in 12 days" plus the full date on hover or tap |

**Write actions look different from reading.** Every save shows what will change and confirms before sending, and shows a clear "Saved" or a readable error afterwards.

### Mobile first, Firefox included

The app must feel like a native app on my phone and work fully in Firefox (Android and desktop), not only in Chrome.

- **Installable PWA:** web manifest, app icon, standalone display, so it opens from the home screen without browser bars. Firefox for Android supports "Add to home screen".
- **Touch first:** tap targets at least 44 × 44 px; primary actions in thumb reach (bottom of the screen); swipe on a contact card for quick actions (log catch-up, call).
- **Bottom sheets instead of modals** on phones for forms and pickers.
- **Safe areas:** respect the notch and gesture bar with `env(safe-area-inset-*)`; use `100dvh`, not `100vh`, so the layout does not jump when the address bar hides.
- **Inputs:** correct `type` and `inputmode` (tel, email, search) so the right keyboard opens; no zoom on focus (inputs at least 16 px).
- **Fast on mobile data:** server-rendered first view, small JS bundles, lazy-loaded avatars, cached lists.
- **Offline-friendly:** show the last loaded data with an "offline" badge instead of an error screen; never queue writes offline in v1.
- **Standards only:** no Chrome-only APIs; test each feature in Firefox before calling it done. Avoid features Firefox lacks or gates, and use progressive enhancement where support differs.

## Deployment

orbit runs as one extra container in Monica's Compose project (`~/repos/monica`), inside the Tailscale sidecar's network namespace like Monica and Caddy. Caddy terminates HTTPS for `orbit.trevfox.dev` with the existing Porkbun DNS-01 setup. Tailscale, certificates, Monica, the database and DAV are not changed.

```text
browser ──HTTPS──> Caddy :443 ── orbit.trevfox.dev  ──> orbit 127.0.0.1:3000 ──> Monica 127.0.0.1:80
                              └─ monica.trevfox.dev ──> Monica 127.0.0.1:80
```

Ports already used in that namespace: 80 (Monica/Apache), 443 and 8080 (Caddy). orbit uses 3000.

```yaml
# added to ~/repos/monica/compose.yaml; Monica's own services stay as they are
  orbit:
    build: ../orbit/frontend          # ubc's deploy clone, not orbit-dev's
    network_mode: service:tailscale   # app has no hostname on the Docker network
    depends_on: [tailscale, app]
    env_file: ./orbit.env             # MONICA_TOKEN (production), ORBIT_READ_ONLY=true
    environment:
      HOST: 127.0.0.1
      PORT: "3000"
      ORIGIN: https://orbit.trevfox.dev
      MONICA_URL: http://127.0.0.1:80
      ORBIT_DB_PATH: /data/orbit.sqlite
    volumes:
      - ./orbit-data:/data            # picked up by backup.sh automatically
    restart: unless-stopped
```

Caddyfile: move the existing `tls { dns porkbun … }` block into a `(porkbun)` snippet, use `import porkbun` in the `monica.trevfox.dev` site, and add:

```text
orbit.trevfox.dev {
	import porkbun
	reverse_proxy 127.0.0.1:3000
}
```

No `/api` route is needed: the browser never calls Monica; orbit's server side does.

**Steps (owner, as `ubc`)**

1. Take a fresh backup: `~/backups/monica/backup.sh`.
2. Check the slice on staging (dev server against `127.0.0.1:8081`).
3. Porkbun: add `A` record `orbit` → `100.69.133.121` (the Monica Tailscale node).
4. `git clone` (first time) or `git pull` the fork into `~/repos/orbit`, branch `orbit`.
5. Create `~/repos/monica/orbit.env` (mode 600) with the production token and `ORBIT_READ_ONLY=true`.
6. `docker compose up -d --build orbit`, then `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`. Nothing else restarts.
7. Keep `ORBIT_READ_ONLY=true` in production until slice 4 is approved.
8. Check the next night's backup contains `orbit-data.tar.gz`.

**Rollback:** `docker compose rm -sf orbit`. Monica, its data and DAVx⁵ are unaffected, because the new app never changes Monica's code or schema.

## Testing and verification

Every slice is tested against staging before it touches production, and the write guards have their own tests that must always pass.

**Automated**

- Unit tests for the API client: pagination, `429` handling, Zod validation failures
- Guard tests: non-GET refused when read-only; non-allowlisted endpoint refused; DELETE always refused; dry run sends nothing; fetch-merge-send keeps untouched fields
- A "round-trip" test on staging: read a contact, save it with no changes, read again, compare. The two must be identical.
- Playwright smoke tests in Firefox and Chromium, at phone (390 × 844) and desktop sizes: list loads, search works, contact page renders

**Manual checklist per slice**

- [ ] Fresh backup taken and restore test still passes
- [ ] Slice works on staging with real (copied) data
- [ ] Spot-check 10 contacts against the old UI, using Firefox on my phone
- [ ] Phone (DAVx⁵) still syncs and shows the same data
- [ ] Audit log entries look right (write slices only)
- [ ] Deployed to production with `ORBIT_READ_ONLY` set as intended

## Instructions for Claude Code

See `CLAUDE.md` (save it as `frontend/CLAUDE.md` in the fork).

**First prompt to give Claude Code:**

> Read frontend/CLAUDE.md and frontend/SPEC.md. Start slice 0: scaffold the SvelteKit app in frontend/ (keep the existing CLAUDE.md, SPEC.md, .gitignore and .env.development), build the Monica API client and guards with tests, and a health page calling GET /api/me against staging at http://127.0.0.1:8081. Do not build any write features. The backups, staging and restore test are already done by the owner.
