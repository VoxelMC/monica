# Monica patch: no more duplicate people from phone sync

Image: `monica:4.1.2-orbit1` = `monica:4.1.2-apache` + two changed files.
Written 2026-11-26 at the owner's request (CLAUDE.md, "Monica patch").

## The problem

Samsung Contacts can save an edit (e.g. a new photo) as a new linked contact. It
reaches Monica as a new card with a new UID. Monica 4.1.2 tries to match new cards
to existing people by UID, email, then name, but the name lookup is broken
(`existingContactWithName` discards the result of `importNames()`), so a card with
only a name and photo always became a new person: same name, the photo, no tags.
Reproduced on staging 2026-11-26 (contacts 42 and 43, removed after).

Upstream's import also *replaces*: a card without CATEGORIES removes every tag,
and missing emails/phones are deleted. So simply fixing the lookup would have wiped
the original's tags.

## The patch (`git diff v4.1.2 -- app/`)

Only for cards a phone uploads into the main address book (`UpdateVCard` passes
`match_new_cards`); Settings → Import and subscribed address books are unchanged.

1. The name lookup works (exact first, middle and last name; not partial contacts;
   oldest match first).
2. A new card matched to an existing person (by UID, email or name) is merged in
   **add-only** (`addToExistingContact`): its photo becomes the profile photo,
   emails and phones the person lacks are added, categories are added as tags.
   Nothing is changed or removed. The person's own card is then re-exported, so the
   phone gets the result on its next sync.
3. Cards for a person's own URI (normal edits) behave exactly as before.

Known limit: two different people with exactly the same name are treated as one
when the phone sends a new card for the second.

## Build and run

Staging first, then production, from `~/repos/orbit` after `git pull`:

    docker build -t monica:4.1.2-orbit1 -f monica-patch/Dockerfile .

Then change `monica:4.1.2-apache` to `monica:4.1.2-orbit1` for every service in the
Compose file and `docker compose up -d`. Undo: change the tag back and `up -d`.

The PHPUnit tests are in `tests/Unit/Services/VCard/ImportVCardTest.php`
(`orbit_*`); the official image has no dev dependencies, so they are not run in the
build. The check is the staging CardDAV script (orbit-dev scratchpad `dav.py`).
