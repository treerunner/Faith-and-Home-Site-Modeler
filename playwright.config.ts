import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}',
	// Saves go to the remote dev database (~140 ms per round trip from a laptop, about ten per
	// first save). With parallel workers that can pass the 5 s and 30 s defaults, so allow more.
	expect: { timeout: 15000 },
	timeout: 60000
});
