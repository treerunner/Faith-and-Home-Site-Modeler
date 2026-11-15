// Who may do what. Committees own sites; members edit them; leads also manage the committee
// and delete its sites; the Faith & Home team (the team committee's members) may do anything
// anywhere. A site's view link is open to anyone when the site is public. Pure, so it's tested.

export type Role = 'lead' | 'member';

export interface Viewer {
	id: string;
	isTeam: boolean;
	memberships: { committeeId: string; role: Role }[];
}

export interface SiteAccess {
	committeeId: string | null;
	visibility: 'public' | 'members';
}

const roleIn = (user: Viewer | null, committeeId: string | null): Role | null =>
	(user && committeeId && user.memberships.find((m) => m.committeeId === committeeId)?.role) || null;

export function canView(site: SiteAccess, user: Viewer | null): boolean {
	return site.visibility === 'public' || canEdit(site, user);
}

export function canEdit(site: SiteAccess, user: Viewer | null): boolean {
	return !!user && (user.isTeam || roleIn(user, site.committeeId) !== null);
}

export function canDeleteSite(site: SiteAccess, user: Viewer | null): boolean {
	return !!user && (user.isTeam || roleIn(user, site.committeeId) === 'lead');
}

// Invite and remove members, change roles, rename, move sites out
export function canManageCommittee(committeeId: string, user: Viewer | null): boolean {
	return !!user && (user.isTeam || roleIn(user, committeeId) === 'lead');
}

export function canSaveInto(committeeId: string, user: Viewer | null): boolean {
	return !!user && (user.isTeam || roleIn(user, committeeId) !== null);
}
