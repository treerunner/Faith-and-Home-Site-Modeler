// Site URLs are `<title>-<shortId>`, e.g. /modeler/grace-church-7f3k9q.
// Only the short id identifies the site; the title part is cosmetic and
// redirects to the current name, so renaming never breaks a link.

// No 0/o, 1/l/i, to keep ids readable aloud
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const SHORT_ID_LENGTH = 6;
const MAX_TITLE_LENGTH = 50;

export function newShortId(): string {
	let id = '';
	const bytes = new Uint8Array(1);
	while (id.length < SHORT_ID_LENGTH) {
		crypto.getRandomValues(bytes);
		// Reject the top of the byte range so every character is equally likely
		if (bytes[0] < 256 - (256 % ALPHABET.length)) id += ALPHABET[bytes[0] % ALPHABET.length];
	}
	return id;
}

export function slugify(name: string): string {
	const slug = name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // strip accents
		.toLowerCase()
		.replace(/['’]/g, '') // "St. Mary's" -> "st-marys"
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (slug.length <= MAX_TITLE_LENGTH) return slug || 'untitled';
	// Cut at a word boundary when one is reasonably close
	const cut = slug.slice(0, MAX_TITLE_LENGTH);
	const lastDash = cut.lastIndexOf('-');
	return (lastDash > MAX_TITLE_LENGTH / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

export function siteSlug(name: string, shortId: string): string {
	return `${slugify(name)}-${shortId}`;
}

// The short id is whatever follows the last dash. Returns null if it isn't a valid id.
export function parseShortId(slug: string): string | null {
	const id = slug.slice(slug.lastIndexOf('-') + 1).toLowerCase();
	return /^[a-z0-9]{6,12}$/.test(id) ? id : null;
}
