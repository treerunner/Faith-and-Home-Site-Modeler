import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Railway Postgres connection string',
		schema: (value) => {
			if (!value) throw new Error('DATABASE_URL is not set');
			return value;
		},
	},
	// Sign-in and invitation emails go through Resend. Without a key, they're printed to the
	// server log instead (development, and before the account is set up).
	RESEND_API_KEY: {
		description: 'Resend API key for sending sign-in and invitation emails (optional)',
		schema: (value) => value ?? '',
	},
	EMAIL_FROM: {
		description: 'Sender for emails, e.g. "Faith & Home <noreply@example.org>" (a domain verified in Resend)',
		schema: (value) => value ?? '',
	},
});
