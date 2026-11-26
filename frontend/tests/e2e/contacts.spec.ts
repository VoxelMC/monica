import { expect, test } from '@playwright/test';

test('people list loads, search filters, no horizontal scroll', async ({ page }) => {
	await page.goto('/contacts');
	await page.waitForLoadState('networkidle'); // search filtering needs JS
	const cards = page.getByTestId('contact-card');
	await expect(cards.first()).toBeVisible();
	const total = await cards.count();
	expect(total).toBeGreaterThan(0);
	await expect(page.getByTestId('count')).toHaveText(`${total}`);

	// Search by a name taken from the first card.
	const firstName = (await cards.first().locator('[data-name]').innerText()).split(/\s+/)[0];
	await page.getByLabel('Search people').fill(firstName);
	await expect(page.getByTestId('count')).toContainText('of');
	await expect(cards.first()).toContainText(firstName);
	await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(firstName)}`));

	// Nonsense query shows the empty state.
	await page.getByLabel('Search people').fill('zzzz-no-such-person');
	await expect(page.getByText('Clear search')).toBeVisible();
	await page.getByText('Clear search').click();
	await expect(cards).toHaveCount(total);

	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
	expect(overflow).toBe(false);
});

test('search state survives a reload (URL)', async ({ page }) => {
	await page.goto('/contacts?sort=recent');
	await expect(page.getByLabel('Sort by')).toHaveValue('recent');
});

test('health page shows read-only on', async ({ page }) => {
	await page.goto('/health');
	await expect(page.getByText('on (writes refused)')).toBeVisible();
});

test('tapping a card opens the contact page, back returns to the list', async ({ page }) => {
	await page.goto('/contacts');
	const first = page.getByTestId('contact-card').first();
	const name = (await first.locator('[data-name]').evaluate((el) => el.firstChild?.textContent ?? '')).trim();
	await first.click();
	await expect(page).toHaveURL(/\/contacts\/\d+$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
	await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
	expect(overflow).toBe(false);
	await page.getByRole('link', { name: 'People' }).first().click();
	await expect(page).toHaveURL(/\/contacts$/);
});

test('unknown contact shows a 404 page', async ({ page }) => {
	const res = await page.goto('/contacts/99999999');
	expect(res?.status()).toBe(404);
	await expect(page.getByText('Back to People')).toBeVisible();
});

test('tags page links to a filtered list', async ({ page }) => {
	await page.goto('/tags');
	const first = page.getByTestId('tag-list').getByRole('link').first();
	await first.click();
	await expect(page).toHaveURL(/\/contacts\?tag=/);
	await expect(page.getByTestId('count')).toContainText('of');
});

test('select mode: select all shown, copy emails, cards do not navigate', async ({ page, context, browserName }) => {
	if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/contacts');
	await page.waitForLoadState('networkidle'); // the Select button needs JS
	await page.getByRole('button', { name: 'Select', exact: true }).click();
	const bar = page.getByTestId('bulk-bar');
	await expect(bar).toContainText('0 selected');
	await page.getByTestId('contact-card').first().click();
	await expect(page).toHaveURL(/\/contacts$/);
	await expect(bar).toContainText('1 selected');
	await page.getByRole('button', { name: /Select all \d+ shown/ }).click();
	const total = await page.getByTestId('contact-card').count();
	await expect(bar).toContainText(`${total} selected`);
	await bar.getByRole('button', { name: 'Copy emails' }).click();
	await expect(page.getByRole('status').or(page.getByRole('dialog'))).toBeVisible();
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(bar).toBeHidden();
});

test('log: pre-filled from a contact, preview shows the payload, nothing can be saved', async ({ page }) => {
	await page.goto('/contacts');
	await page.getByTestId('contact-card').first().click();
	await page.waitForLoadState('networkidle');
	await page.getByRole('link', { name: /Log a catch-up/ }).click();
	await expect(page).toHaveURL(/\/log\?people=\d+/);
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('picked').getByRole('button')).toHaveCount(1);
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

	// Validation before review
	await page.getByRole('button', { name: 'Review and save' }).click();
	await expect(page.getByText('Say what you did')).toBeVisible();

	await page.getByLabel('What did you do?').fill('Climbing at the gym');
	await page.getByRole('button', { name: 'Review and save' }).click();
	const pre = page.getByTestId('preview');
	await expect(pre).toContainText('POST /api/activities');
	await expect(pre).toContainText('"summary": "Climbing at the gym"');
	await expect(page.getByText('Nothing has been sent yet.')).toBeVisible();
	// The dev server is read-only: saving is refused and nothing reaches Monica
	await page.getByRole('button', { name: /Save to Monica/ }).click();
	await expect(page.getByTestId('save-outcome')).toContainText('read-only');
	await expect(page.getByTestId('save-outcome')).toContainText('Nothing was saved');
});

test('log: only the hangout action exists; malformed drafts are rejected before any write', async ({ request }) => {
	// (Cross-site form posts get 403 in production builds; the dev server skips that check.)
	const other = await request.post('/log', { form: { summary: 'x' }, headers: { origin: 'http://127.0.0.1:5173' } });
	expect(other.status()).toBeGreaterThanOrEqual(400); // no default action
	const bad = await request.post('/log?/hangout', { form: { draft: '{"contactIds":"nope"}' }, headers: { origin: 'http://127.0.0.1:5173' } });
	expect(bad.status()).toBe(400);
});

test('diary page loads with the Log button in the nav', async ({ page }) => {
	await page.goto('/diary');
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
	await expect(page.getByRole('heading', { name: 'Diary' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Log/ }).first()).toBeVisible();
});

test('log: a note for one person becomes a second request in the preview', async ({ page }) => {
	await page.goto('/log?people=1,3');
	await page.waitForLoadState('networkidle');
	const first = page.getByRole('button', { name: /^\+ Note on/ }).first();
	const who = (await first.innerText()).replace('+ Note on ', '').trim();
	await first.click();
	await page.getByPlaceholder('e.g. Starting a new job in March').fill('Moving to Lisbon in spring');
	await page.getByLabel('What did you do?').fill('Dinner');
	await page.getByRole('button', { name: 'Review and save' }).click();
	const pre = page.getByTestId('preview');
	await expect(pre).toContainText('POST /api/activities');
	await expect(pre).toContainText('POST /api/notes');
	await expect(pre).toContainText('From: Dinner');
	await expect(pre).toContainText('Moving to Lisbon in spring');
	await expect(pre).toContainText(`Note on ${who}`);
});

test('journal: @ mentions insert the full name and list the person', async ({ page }) => {
	await page.goto('/log?kind=journal');
	await page.waitForLoadState('networkidle');
	const box = page.getByRole('textbox', { name: 'Entry', exact: true });
	await box.click();
	await box.pressSequentially('Climbed with @');
	const option = page.getByRole('listbox', { name: 'Mention someone' }).getByRole('button').first();
	const name = (await option.innerText()).trim().split('\n').pop()!.trim(); // skip the avatar initials
	await box.pressSequentially(name.slice(0, 3));
	await page.getByRole('listbox', { name: 'Mention someone' }).getByRole('button', { name }).click();
	await expect(box).toHaveValue(`Climbed with @${name} `);
	await expect(page.getByTestId('mentions')).toContainText(name);
	await box.pressSequentially('today');
	await expect(box).toHaveValue(`Climbed with @${name} today`);
	// punctuation right after a mention snaps onto the name
	await box.pressSequentially(' and @');
	await page.getByRole('listbox', { name: 'Mention someone' }).getByRole('button').first().click();
	await box.press('.');
	await expect(box).toHaveValue(/@[^@]+[^ ]\.$/);
});

test('home dashboard shows its four sections and links to Health', async ({ page }) => {
	await page.goto('/');
	for (const id of ['birthdays', 'catch-up', 'tasks', 'recent']) await expect(page.getByTestId(id)).toBeVisible();
	await expect(page.getByTestId('recent').getByRole('link')).toHaveCount(5);
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('people: switch to lines, the choice is remembered, A–Z index jumps', async ({ page, isMobile }) => {
	await page.goto('/contacts');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Lines' }).click();
	await expect(page.getByRole('button', { name: 'Lines' })).toHaveAttribute('aria-pressed', 'true');
	await page.reload();
	await page.waitForLoadState('networkidle'); // the index needs JS
	await expect(page.getByRole('button', { name: 'Lines' })).toHaveAttribute('aria-pressed', 'true');
	const index = page.getByTestId('az-index');
	const target = index.locator('button:not([disabled])').last();
	const letter = (await target.innerText()).trim();
	await target.click();
	await expect(page.locator(`#letter-${letter === '#' ? '\\#' : letter}`)).toBeInViewport();
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('settings: picking a theme applies at once and survives a reload', async ({ page }) => {
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('dark-themes').getByRole('button', { name: /Everforest Dark/ }).click();
	await expect(page.locator('html')).toHaveAttribute('data-dark', 'everforest-dark');
	await expect(page.locator('html')).toHaveAttribute('data-mode', /dark|system/);
	await page.getByRole('radio', { name: 'EB Garamond' }).click();
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-dark', 'everforest-dark');
	await expect(page.locator('html')).toHaveAttribute('data-font', 'garamond');
	const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
	expect(bg.length).toBeGreaterThan(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('clickable controls show the pointer cursor', async ({ page, isMobile }) => {
	test.skip(isMobile, 'no cursor on touch screens');
	await page.goto('/contacts');
	const cursor = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).cursor);
	expect(await cursor('aside[aria-label="Filter by tag"] button')).toBe('pointer');
	expect(await cursor('[data-testid="az-index"] button:not([disabled])')).toBe('pointer');
	expect(await cursor('[data-testid="az-index"] button[disabled]')).toBe('default');
});

test('people header does not move when scrolling starts', async ({ page }) => {
	await page.goto('/contacts');
	await page.waitForLoadState('networkidle');
	const top = async (y: number) => {
		await page.evaluate((y) => window.scrollTo(0, y), y);
		await page.waitForTimeout(60);
		return Math.round(await page.locator('h1').evaluate((e) => e.getBoundingClientRect().top));
	};
	const atRest = await top(0);
	for (const y of [5, 20, 200]) expect(await top(y)).toBe(atRest);
});

test('reminders show open, above the timeline, with when they are next due', async ({ page }) => {
	await page.goto('/contacts?q=Maria');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('contact-card').first().click();
	const reminders = page.getByTestId('reminders');
	await expect(reminders).toBeVisible();
	await expect(reminders).toContainText(/In \d+ days|Today|Tomorrow/);
	const [r, t] = await Promise.all([reminders.boundingBox(), page.getByRole('heading', { name: 'Timeline' }).boundingBox()]);
	expect(r!.y).toBeLessThan(t!.y);
});

test('settings stay current after navigating away and back (no reload)', async ({ page }) => {
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('dark-themes').getByRole('button', { name: /Catppuccin Mocha/ }).click();
	await page.getByRole('radio', { name: 'Libre Baskerville' }).click();
	// In-app navigation only: People, then Home, then Settings (linked at the bottom of Home on phones)
	await page.locator('a[href="/contacts"]:visible').first().click();
	await page.waitForURL(/\/contacts$/);
	await page.locator('a[href="/"]:visible').first().click();
	await page.waitForURL(/\/$/);
	await page.locator('a[href="/settings"]:visible').first().click();
	await page.waitForURL(/\/settings$/);
	await expect(page.getByTestId('dark-themes').getByRole('button', { name: /Catppuccin Mocha/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('radio', { name: 'Libre Baskerville' })).toHaveAttribute('aria-checked', 'true');
});

test('people view stays current after navigating away and back', async ({ page }) => {
	await page.goto('/contacts');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Lines' }).click();
	await page.locator('a[href="/"]:visible').first().click();
	await page.waitForURL(/\/$/);
	await page.locator('a[href="/contacts"]:visible').first().click();
	await page.waitForURL(/\/contacts$/);
	await expect(page.getByRole('button', { name: 'Lines' })).toHaveAttribute('aria-pressed', 'true');
});

test('birthdays: Home card has clear sections and links to the birthdays page', async ({ page }) => {
	await page.goto('/');
	const card = page.getByTestId('birthdays');
	await expect(card.getByRole('heading', { name: 'Next 30 days' })).toBeVisible();
	await card.getByRole('link', { name: /All birthdays/ }).click();
	await expect(page).toHaveURL(/\/birthdays$/);
	await expect(page.getByRole('heading', { name: 'The year ahead' })).toBeVisible();
});

test('birthdays: quick entry validates, previews the exact request, cannot save', async ({ page }) => {
	await page.goto('/birthdays');
	await page.waitForLoadState('networkidle');
	const row = page.getByTestId('missing').locator('li').first();
	const name = (await row.locator('a span.truncate').innerText()).trim();
	await row.getByLabel(`Month for ${name}`).selectOption('2');
	await row.getByLabel(`Day for ${name}`).selectOption('29');
	await row.getByLabel(`Year for ${name} (optional)`).fill('2001');
	await expect(row).toContainText('does not exist');
	await row.getByLabel(`Year for ${name} (optional)`).fill('2000');
	await expect(row).toContainText('Ready');
	await page.getByTestId('birthday-bar').getByRole('button', { name: 'Save…' }).click();
	const pre = page.getByTestId('preview');
	await expect(pre).toContainText('PUT /api/contacts/');
	await expect(pre).toContainText('"birthdate_month": 2');
	await expect(pre).toContainText('"birthdate_day": 29');
	await expect(pre).not.toContainText('last_name');
	// read-only dev server: refused, nothing saved
	await page.getByRole('button', { name: /Save to Monica/ }).click();
	await expect(page.getByTestId('birthday-outcome')).toContainText('read-only');
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('birthdays: only the save action exists; malformed drafts are rejected', async ({ request }) => {
	const other = await request.post('/birthdays', { form: { x: '1' }, headers: { origin: 'http://127.0.0.1:5173' } });
	expect(other.status()).toBeGreaterThanOrEqual(400);
	const bad = await request.post('/birthdays?/save', { form: { draft: '{"entries":"nope"}' }, headers: { origin: 'http://127.0.0.1:5173' } });
	expect(bad.status()).toBe(400);
});

test('bulk tags: picker previews who changes; read-only refuses', async ({ page }) => {
	await page.goto('/contacts');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Select', exact: true }).click();
	const cards = page.getByTestId('contact-card');
	await cards.nth(0).click();
	await cards.nth(1).click();
	await page.getByTestId('bulk-bar').getByRole('button', { name: 'Add tag…' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('textbox', { name: 'Tag' }).fill('orbit-e2e-tag');
	await expect(dialog.getByTestId('tag-preview')).toContainText('to 2 people');
	await dialog.getByRole('button', { name: 'Add to 2 people' }).click();
	await expect(page.getByRole('status').first()).toContainText('read-only');
});

test('journal: save is offered and refused while read-only', async ({ page }) => {
	await page.goto('/log?kind=journal');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Title').fill('e2e entry');
	await page.getByRole('textbox', { name: 'Entry', exact: true }).fill('Nothing to see');
	await page.getByRole('button', { name: 'Review and save' }).click();
	await expect(page.getByTestId('preview')).toContainText('POST /api/journal');
	await page.getByRole('button', { name: /Save to Monica/ }).click();
	await expect(page.getByTestId('save-outcome')).toContainText('read-only');
});

test('contact page: notes have their own section, separate from the timeline', async ({ page }) => {
	await page.goto('/contacts/7');
	await page.waitForLoadState('networkidle');
	const timeline = page.getByTestId('timeline');
	const notes = page.getByTestId('notes');
	await expect(notes).toBeVisible();
	await expect(notes).toContainText('Pursuing registered massage therapist');
	if (await timeline.count()) await expect(timeline).not.toContainText('Pursuing registered massage therapist');
	// Notes fold away and stay folded after a reload (remembered on this device)
	const section = page.getByTestId('notes-section');
	await section.locator('summary').click();
	await expect(notes).toBeHidden();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('notes')).toBeHidden();
	await page.getByTestId('notes-section').locator('summary').click();
	await expect(page.getByTestId('notes')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('remove: confirmation is required, shows what goes, and read-only refuses it', async ({ page }) => {
	await page.goto('/contacts/7');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('notes').getByRole('button', { name: 'Remove…' }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'Remove this note?' })).toBeVisible();
	await expect(dialog.getByTestId('remove-details')).not.toBeEmpty();
	const go = dialog.getByRole('button', { name: 'Remove permanently' });
	await expect(go).toBeDisabled();
	await dialog.getByLabel(/I understand this removes the note/).check();
	await expect(go).toBeEnabled();
	await go.click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');
	await expect(page.getByTestId('notes')).toBeVisible(); // still there
});

test('photo: crop preview before anything is sent; read-only refuses the save', async ({ page }) => {
	await page.goto('/contacts/3');
	await page.waitForLoadState('networkidle');
	// A portrait JPEG made in the browser
	const jpeg = await page.evaluate(() => {
		const c = document.createElement('canvas');
		c.width = 600;
		c.height = 900;
		const g = c.getContext('2d')!;
		g.fillStyle = '#2f5d50';
		g.fillRect(0, 0, 600, 900);
		return c.toDataURL('image/jpeg', 0.9).split(',')[1];
	});
	await page.getByTestId('photo-input').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByTestId('photo-preview')).toBeVisible();
	await expect(dialog.getByText('Move the square up or down')).toBeVisible();
	const src = await dialog.getByTestId('photo-preview').getAttribute('src');
	expect(src).toMatch(/^data:image\/jpeg;base64,/);
	await dialog.getByTestId('photo-save').click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');
});

test('photo: the server refuses anything that is not a real JPEG/PNG/WebP', async ({ request }) => {
	const headers = { origin: 'http://127.0.0.1:5173' };
	const svg = await request.post('/contacts/3?/photo', { form: { contactId: '3', updatedAt: 'x', photo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, headers });
	expect(svg.status()).toBe(400);
	const fake = await request.post('/contacts/3?/photo', { form: { contactId: '3', updatedAt: 'x', photo: 'data:image/png;base64,' + 'A'.repeat(400) }, headers });
	expect(fake.status()).toBe(400);
});

test('reminders: set one from a contact page, see it, remove it (orbit only, never Monica)', async ({ page }, info) => {
	const note = `e2e test reminder ${info.project.name} ${Date.now()}`; // projects run in parallel
	await page.goto('/contacts/2');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('remind-me').click();
	const dialog = page.getByRole('dialog');
	const save = dialog.getByTestId('remind-save');
	await expect(save).toBeDisabled(); // no time yet
	await dialog.getByRole('button', { name: 'In 3 hours' }).click();
	await dialog.getByTestId('remind-note').fill(note);
	await save.click();
	await expect(page.getByTestId('remove-notice')).toContainText('Reminder set for');
	await expect(page).toHaveURL(/\/contacts\/2$/); // stays on the page
	const list = page.getByTestId('reminders').getByTestId('reminder-list');
	const item = list.locator('li', { hasText: note });
	await expect(item).toContainText(/in (3 h|2 h 5\d min)/);
	await item.getByRole('button', { name: 'Remove reminder' }).click();
	await expect(page.getByText(note)).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('reminders: past times and unknown people are refused', async ({ request }) => {
	const headers = { origin: 'http://127.0.0.1:5173' };
	const past = await request.post('/reminders?/create', { form: { contactId: '2', dueAt: '2020-01-01T00:00:00.000Z', timeZone: 'UTC', note: '' }, headers });
	expect(past.status()).toBe(400);
	const nobody = await request.post('/reminders?/create', { form: { contactId: '999999', dueAt: new Date(Date.now() + 3600_000).toISOString(), timeZone: 'UTC', note: '' }, headers });
	expect(nobody.status()).toBe(400);
});

test('tags on a contact page: "+ Add tag" even with no tags; read-only refuses', async ({ page }) => {
	await page.goto('/contacts/13'); // no tags on staging
	await page.waitForLoadState('networkidle');
	const tags = page.getByTestId('contact-tags');
	await tags.getByRole('button', { name: '+ Add tag' }).click();
	const form = page.getByTestId('add-tag-form');
	await expect(form.getByTestId('add-tag-save')).toBeDisabled();
	await form.getByLabel('Existing tags').locator('button').first().click();
	await form.getByTestId('add-tag-save').click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');
	await expect(tags.locator('a')).toHaveCount(0); // nothing added
});

test('tags on a contact page: several existing tags at once, plus a typed new one, previewed first', async ({ page }) => {
	await page.goto('/contacts/13');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('add-tag').click();
	const form = page.getByTestId('add-tag-form');
	const chips = form.getByRole('group', { name: 'Existing tags' }).locator('button');
	await chips.nth(0).click();
	await chips.nth(1).click();
	await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
	await form.getByLabel('Filter tags or type a new one').fill('Brand New Tag');
	await expect(page.getByTestId('add-tag-preview')).toContainText('Brand New Tag (new)');
	await expect(form.getByTestId('add-tag-save')).toHaveText('Add 3');
	await form.getByLabel('Filter tags or type a new one').fill(''); // back to the two ticked tags
	await expect(form.getByTestId('add-tag-save')).toHaveText('Add 2');
	await form.getByTestId('add-tag-save').click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');
});

test('birthday: correct an existing one; shows old and new, refuses no-op and impossible dates; read-only refuses', async ({ page }) => {
	await page.goto('/contacts/1'); // has a birthday on staging
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('birthday')).toContainText(/\d{4}\s+·\s+\d+ y\/o\s+·\s+Edit/);
	await page.getByTestId('edit-birthday').click();
	const dialog = page.getByRole('dialog');
	const save = dialog.getByTestId('bday-save');
	await expect(save).toBeDisabled(); // unchanged
	await dialog.getByTestId('bday-day').fill('31');
	await dialog.getByLabel('Month').selectOption('2');
	await expect(dialog.getByRole('alert')).toContainText('does not exist');
	await expect(save).toBeDisabled();
	await dialog.getByTestId('bday-day').fill('14');
	await expect(dialog.getByTestId('bday-compare')).toContainText('New');
	await expect(dialog.getByTestId('bday-compare')).toContainText('February 14');
	await save.click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');
});

test('contact page: add note, edit/add phone and email; read-only refuses each, nothing changes', async ({ page }) => {
	await page.goto('/contacts/13');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('add-note').click();
	await expect(page.getByTestId('note-save')).toBeDisabled();
	await page.getByTestId('note-body').fill('read-only test');
	await page.getByTestId('note-save').click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');

	const phoneBefore = await page.getByTestId('field-edit').first().getAttribute('aria-label');
	await page.getByTestId('field-edit').first().click();
	await page.getByTestId('field-value').fill('not a phone');
	await expect(page.getByTestId('field-form').getByRole('alert')).toContainText('digits');
	await expect(page.getByTestId('field-save')).toBeDisabled();
	await page.getByTestId('field-value').fill('+1 604 555 0199');
	await page.getByTestId('field-save').click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');
	await page.reload();
	await page.waitForLoadState('networkidle');
	expect(await page.getByTestId('field-edit').first().getAttribute('aria-label')).toBe(phoneBefore);

	await page.getByTestId('add-email').click();
	await page.getByTestId('field-value').fill('someone@example.com');
	await page.getByTestId('field-save').click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');
});

test('refresh: reloads from Monica and stays on the page', async ({ page }) => {
	await page.goto('/contacts/13');
	await page.waitForLoadState('networkidle');
	const res = page.waitForResponse((r) => r.url().endsWith('/refresh') && r.status() === 204);
	await page.getByTestId('refresh').click();
	await res;
	await expect(page).toHaveURL(/\/contacts\/13$/);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('tags page: rename and merge are offered; read-only refuses; clashes suggest merge', async ({ page }) => {
	await page.goto('/tags');
	await page.waitForLoadState('networkidle');
	const row = page.getByTestId('tag-list').locator('li').first();
	await row.getByTestId('tag-edit').click();
	const editor = page.getByTestId('tag-editor');
	const second = (await page.getByTestId('tag-list').locator('li').nth(1).locator('a .truncate').innerText()).trim();
	await editor.getByLabel('Rename').fill(second);
	await editor.getByRole('button', { name: 'Rename' }).click();
	await expect(page.getByTestId('tags-notice')).toContainText('Merge');
	await editor.getByLabel('Rename').fill('Renamed by e2e');
	await editor.getByRole('button', { name: 'Rename' }).click();
	await expect(page.getByTestId('tags-notice')).toContainText('read-only');
	await page.getByTestId('tag-editor').getByLabel('Merge into').selectOption({ index: 1 }); // editor stays open after a refusal
	await expect(page.getByTestId('tag-editor')).toContainText('stays as an unused tag');
	await page.getByTestId('tag-merge').click();
	await expect(page.getByTestId('tags-notice')).toContainText('read-only');
});

test('tab icon follows the theme chosen in Settings', async ({ page, context }) => {
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	const icon = () => page.locator('link[rel="icon"]').getAttribute('href');
	await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Light' }).click();
	await page.getByTestId('light-themes').getByRole('button', { name: /Paper/ }).click();
	await expect.poll(async () => decodeURIComponent((await icon())!)).toContain('#2f6f5e'); // Paper's green
	const before = await icon();
	await page.getByTestId('light-themes').getByRole('button', { name: /Ayu Light/ }).click();
	await expect.poll(icon).not.toBe(before);
	expect(decodeURIComponent((await icon())!)).not.toContain('prefers-color-scheme'); // light mode: light theme only
	await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Match system' }).click();
	await expect.poll(async () => decodeURIComponent((await icon())!)).toContain('prefers-color-scheme:dark');
	await context.clearCookies(); // leave the default theme for other tests
});

test('gifts: idea form is offered; read-only refuses saving it', async ({ page }) => {
	await page.goto('/contacts/26');
	await page.waitForLoadState('networkidle');
	await page.locator('summary', { hasText: 'Gifts' }).click().catch(() => {});
	await page.getByTestId('add-gift').click();
	await expect(page.getByTestId('gift-save')).toBeDisabled();
	await page.getByTestId('gift-name').fill('Read-only gift');
	await page.getByTestId('gift-save').click();
	await expect(page.getByTestId('remove-notice')).toContainText('read-only');
});

test('catch-up target: set and clear (orbit only, works while read-only)', async ({ page }) => {
	await page.goto('/contacts/26');
	await page.waitForLoadState('networkidle');
	const box = page.getByTestId('catchup');
	await box.getByTestId('catchup-edit').click();
	await box.getByTestId('catchup-choice').selectOption('14');
	await box.getByTestId('catchup-save').click();
	await expect(box).toContainText('Catch up every 2 weeks');
	await box.getByTestId('catchup-edit').click();
	await box.getByTestId('catchup-clear').click();
	await expect(box).toContainText('+ Catch up every…');
});

test('groups and trips: create, use, delete (orbit only)', async ({ page }, info) => {
	const name = `e2e ${info.project.name} ${Date.now()}`;
	await page.goto('/groups');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-group').click();
	await page.getByTestId('group-form').getByLabel('Name').fill(name);
	await page.getByTestId('member-picker').locator('label').nth(0).click();
	await page.getByTestId('member-picker').locator('label').nth(1).click();
	await expect(page.getByTestId('picked-count')).toHaveText('2 picked');
	await page.getByTestId('group-create').click();
	await expect(page.getByTestId('group-name')).toHaveText(name);
	await expect(page.getByTestId('group-members').locator('li')).toHaveCount(2);
	await expect(page.getByRole('link', { name: /Log a hangout with everyone/ })).toHaveAttribute('href', /\/log\?people=\d+,\d+/);
	const groupUrl = page.url();

	await page.goto('/trips');
	await page.waitForLoadState('networkidle');
	await page.getByTestId('new-trip').click();
	await page.getByTestId('trip-form').getByLabel('Trip').fill(name);
	await page.getByTestId('trip-create').click();
	await page.waitForURL(/\/trips\/\d+/);
	await page.waitForLoadState('networkidle');
	await page.getByTestId('trip-add').click();
	await page.getByLabel('Add a whole group').selectOption({ label: `${name} (2)` });
	await page.getByRole('button', { name: 'Add group' }).click();
	await expect(page.getByTestId('souvenirs').locator('li')).toHaveCount(2);
	await page.getByTestId('souvenir-tick').first().click();
	await expect(page.getByText('1 of 2 done')).toBeVisible();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByLabel('I understand').check();
	await page.getByRole('button', { name: 'Delete trip' }).click();
	await page.waitForURL(/\/trips$/);

	await page.goto(groupUrl);
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByLabel('I understand').check();
	await page.getByRole('button', { name: 'Delete group' }).click();
	await page.waitForURL(/\/groups$/);
	await expect(page.getByText(name)).toHaveCount(0);
});

test('cache sync: shows "Checking Monica…" while a re-check runs and reloads the data when it changed', async ({ page }) => {
	let answer = { busy: false, changed: false };
	await page.route('**/fresh?*', async (route) => {
		await new Promise((r) => setTimeout(r, 1200)); // a slow background re-check
		await route.fulfill({ json: { now: Date.now(), ...answer } });
	});
	await page.goto('/contacts');
	const pill = page.getByTestId('cache-sync');
	await expect(pill).toHaveText(/Checking Monica/);
	await expect(pill).toBeHidden({ timeout: 5000 });

	// Next page: the re-check says something changed, so the page data is reloaded
	answer = { busy: true, changed: true };
	const reloaded = page.waitForRequest((r) => r.url().includes('__data.json'));
	await page.getByRole('link', { name: 'Home' }).first().click();
	await expect(pill).toHaveText(/Checking Monica/);
	await reloaded;
	await expect(pill).toHaveText(/Updated/);
	await expect(pill).toBeHidden({ timeout: 5000 });
});

test('duplicates page loads (read-only: merge buttons only where nothing blocks)', async ({ page }) => {
	await page.goto('/duplicates');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Duplicates');
	const groups = page.getByTestId('dup-groups').getByTestId('dup-group');
	if ((await groups.count()) === 0) await expect(page.getByTestId('dup-none')).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
	expect(overflow).toBe(false);
});
