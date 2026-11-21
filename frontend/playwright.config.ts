import { defineConfig, devices } from '@playwright/test';

// Smoke tests against the dev server, which talks to STAGING Monica (read-only).
export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	use: { baseURL: 'http://127.0.0.1:5173' },
	webServer: {
		command: 'pnpm dev --host 127.0.0.1 --port 5173 --strictPort',
		url: 'http://127.0.0.1:5173/health',
		reuseExistingServer: true,
		timeout: 60_000
	},
	projects: [
		{ name: 'firefox-phone', use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 }, hasTouch: true } },
		{ name: 'chromium-phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
		{ name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
		{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }
	]
});
