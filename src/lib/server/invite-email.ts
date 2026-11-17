import type { Email } from './email';

export const INVITE_NOTE_MAX = 500;

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// An invitation's email. The note is the inviter's own words, quoted under their name.
export function inviteEmail(to: string, committee: string, link: string, from: string, rawNote = ''): Email {
	const note = rawNote.trim().slice(0, INVITE_NOTE_MAX);
	const noteHtml = note
		? `<p>${escapeHtml(from)} wrote:</p><blockquote style="margin:0 0 1em;padding-left:0.75em;border-left:3px solid #d2d9ea;white-space:pre-wrap">${escapeHtml(note)}</blockquote>`
		: '';
	return {
		to,
		subject: `You're invited to ${committee} on the Faith & Home site modeler`,
		text: `You've been invited to join ${committee}, to work on its sites and plans together.\n\n${note ? `${from} wrote:\n${note}\n\n` : ''}Open this link to accept and sign in (it works for 14 days):\n${link}`,
		html: `<p>You've been invited to join <strong>${escapeHtml(committee)}</strong>, to work on its sites and plans together.</p>${noteHtml}<p><a href="${link}">Accept and sign in</a> (the link works for 14 days)</p>`,
	};
}
