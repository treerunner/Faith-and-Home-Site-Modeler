import { describe, it, expect } from 'vitest';
import { inviteEmail, INVITE_NOTE_MAX } from './invite-email';

describe('invitation email', () => {
	const link = 'https://example.test/auth/invite?token=t';

	it('without a note, just the invitation and the link', () => {
		const e = inviteEmail('a@example.test', 'St. Tim’s committee', link, 'Kevin');
		expect(e.text).not.toContain('wrote');
		expect(e.text).toContain(link);
		expect(e.html).not.toContain('blockquote');
	});

	it('quotes the note under the inviter’s name, escaped in HTML', () => {
		const e = inviteEmail('a@example.test', 'St. Tim’s', link, 'Kevin', '  Join us Tuesday <7pm> & bring ideas.  ');
		expect(e.text).toContain('Kevin wrote:\nJoin us Tuesday <7pm> & bring ideas.\n\n');
		expect(e.html).toContain('<p>Kevin wrote:</p>');
		expect(e.html).toContain('Join us Tuesday &lt;7pm&gt; &amp; bring ideas.');
	});

	it('keeps the note to its limit', () => {
		const e = inviteEmail('a@example.test', 'C', link, 'K', 'x'.repeat(INVITE_NOTE_MAX + 50));
		expect(e.text).toContain('x'.repeat(INVITE_NOTE_MAX) + '\n');
		expect(e.text).not.toContain('x'.repeat(INVITE_NOTE_MAX + 1));
	});
});
