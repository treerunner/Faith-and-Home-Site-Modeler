import { describe, it, expect } from 'vitest';
import { canDeleteSite, canEdit, canManageCommittee, canSaveInto, canView, type Viewer } from './access';
import { hashToken, newToken, normalEmail, safeNext } from './tokens';

const A = 'committee-a', B = 'committee-b';
const team: Viewer = { id: 't', isTeam: true, memberships: [{ committeeId: 'team', role: 'member' }] };
const lead: Viewer = { id: 'l', isTeam: false, memberships: [{ committeeId: A, role: 'lead' }] };
const member: Viewer = { id: 'm', isTeam: false, memberships: [{ committeeId: A, role: 'member' }] };
const outsider: Viewer = { id: 'o', isTeam: false, memberships: [{ committeeId: B, role: 'lead' }] };
const pub = { committeeId: A, visibility: 'public' as const };
const priv = { committeeId: A, visibility: 'members' as const };

describe('access', () => {
	it('lets anyone view a public site, only members and the team a private one', () => {
		for (const u of [team, lead, member, outsider, null]) expect(canView(pub, u)).toBe(true);
		expect([team, lead, member, outsider, null].map((u) => canView(priv, u))).toEqual([true, true, true, false, false]);
	});

	it('lets members and the team edit; leads and the team delete and manage', () => {
		expect([team, lead, member, outsider, null].map((u) => canEdit(pub, u))).toEqual([true, true, true, false, false]);
		expect([team, lead, member, outsider, null].map((u) => canDeleteSite(pub, u))).toEqual([true, true, false, false, false]);
		expect([team, lead, member, outsider, null].map((u) => canManageCommittee(A, u))).toEqual([true, true, false, false, false]);
		expect([team, lead, member, outsider, null].map((u) => canSaveInto(A, u))).toEqual([true, true, true, false, false]);
	});

	it('gives a site with no committee to the team alone', () => {
		const orphan = { committeeId: null, visibility: 'members' as const };
		expect([team, lead, null].map((u) => canEdit(orphan, u))).toEqual([true, false, false]);
	});
});

describe('tokens', () => {
	it('makes random tokens and stores only their hash', async () => {
		const t = newToken();
		expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(t).not.toBe(newToken());
		expect(await hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashToken(t)).toBe(await hashToken(t));
	});

	it('only sends you to paths on this site after sign-in', () => {
		expect(safeNext('/modeler/st-tims')).toBe('/modeler/st-tims');
		for (const bad of ['https://evil.example', '//evil.example', '/\\evil', '', null]) expect(safeNext(bad)).toBe('/modeler/sites');
	});

	it('normalizes email addresses', () => {
		expect(normalEmail('  Kel723@Lehigh.EDU ')).toBe('kel723@lehigh.edu');
		expect(normalEmail('not an email')).toBeNull();
	});
});
