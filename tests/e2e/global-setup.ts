import { mkdirSync, writeFileSync } from 'node:fs';
import { makeUser, teamCommitteeId } from './auth';

// The test run signs in as a member of the Faith & Home team committee, which may do anything:
// most tests work as before. Tests about access sign in as other users themselves.
export const STATE = '.playwright/team.json';

export default async function globalSetup() {
	const user = await makeUser('team', [{ committeeId: await teamCommitteeId(), role: 'member' }]);
	mkdirSync('.playwright', { recursive: true });
	writeFileSync(STATE, JSON.stringify({ cookies: [user.cookie], origins: [] }));
	writeFileSync('.playwright/team-user.json', JSON.stringify({ id: user.id }));
	// The connection stays open for teardown, which runs in this same process
}
