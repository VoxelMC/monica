import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Production: node build listening on HOST/PORT (127.0.0.1:3000).
			adapter: adapter()
		})
	],
	test: {
		projects: [
			{
				extends: true,
				test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: ['tests/e2e/**'], environment: 'node' }
			},
			{
				// Read-only checks against staging Monica. Run with `pnpm test:staging`.
				extends: true,
				test: { name: 'staging', include: ['tests/staging/**/*.test.ts'], environment: 'node', testTimeout: 120_000 }
			}
		]
	}
});
