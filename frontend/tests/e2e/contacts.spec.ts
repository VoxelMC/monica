import { expect, test } from '@playwright/test';

test('people list loads, search filters, no horizontal scroll', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/contacts$/);
	const cards = page.getByTestId('contact-card');
	await expect(cards.first()).toBeVisible();
	const total = await cards.count();
	expect(total).toBeGreaterThan(0);
	await expect(page.getByTestId('count')).toHaveText(`${total} people`);

	// Search by a name taken from the first card.
	const firstName = (await cards.first().locator('p').first().innerText()).split(/\s+/)[0];
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
