import { expect, test } from '@playwright/test';

test('people list loads, search filters, no horizontal scroll', async ({ page }) => {
	await page.goto('/contacts');
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

	// Validation before preview
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByText('Say what you did')).toBeVisible();

	await page.getByLabel('What did you do?').fill('Climbing at the gym');
	await page.getByRole('button', { name: 'Preview' }).click();
	const pre = page.getByTestId('preview');
	await expect(pre).toContainText('POST /api/activities');
	await expect(pre).toContainText('"summary": "Climbing at the gym"');
	await expect(page.getByText('Nothing has been sent.')).toBeVisible();
	await page.getByRole('button', { name: 'Back to editing' }).click();
	await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('log page has no server action (POST is refused)', async ({ request }) => {
	const res = await request.post('/log', { form: { summary: 'x' }, headers: { origin: 'http://127.0.0.1:5173' } });
	expect([403, 404, 405]).toContain(res.status());
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
	await page.getByRole('button', { name: 'Preview' }).click();
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
