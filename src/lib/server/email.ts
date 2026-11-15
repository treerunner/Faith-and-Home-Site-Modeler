import { EMAIL_FROM, RESEND_API_KEY } from '$app/env/private';

// Sends an email through Resend's API (plain fetch). Without a key it prints the email to the
// server log, so sign-in works in development before an account is set up.

export interface Email {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

// The last emails printed instead of sent, for development (not kept in production)
export const outbox: Email[] = [];

export async function sendEmail(email: Email): Promise<void> {
	if (!RESEND_API_KEY) {
		outbox.push(email);
		if (outbox.length > 20) outbox.shift();
		console.log(`[email, not sent: RESEND_API_KEY unset] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
		return;
	}
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ from: EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
}
