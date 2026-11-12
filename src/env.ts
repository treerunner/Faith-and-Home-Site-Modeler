import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Railway Postgres connection string',
		schema: (value) => {
			if (!value) throw new Error('DATABASE_URL is not set');
			return value;
		},
	},
});
