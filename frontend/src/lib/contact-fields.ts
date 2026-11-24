// Phones and emails (2026-11-24): shared checks for the browser and the server.

export type FieldKind = 'phone' | 'email';

/** Tidy and check a phone or email; returns the value to save or a reason it can't be. */
export function checkField(kind: FieldKind, raw: string): { value: string } | { error: string } {
	const value = raw.trim().replace(/\s+/g, ' ');
	if (!value) return { error: kind === 'phone' ? 'Type a phone number.' : 'Type an email address.' };
	if (value.length > 255) return { error: 'That is too long.' };
	if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { value } : { error: 'That does not look like an email address.' };
	const digits = value.replace(/\D/g, '').length;
	return /^\+?[\d\s().-]+$/.test(value) && digits >= 3 && digits <= 20 ? { value } : { error: 'Use digits, spaces, + ( ) - only.' };
}
