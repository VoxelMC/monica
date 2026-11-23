// Sending a notification through ntfy (https://ntfy.sh, or a self-hosted
// server). Uses JSON publishing so names with accents work. The topic URL is
// ORBIT_NTFY_URL (e.g. https://ntfy.example.ts.net/orbit-reminders); the
// optional ORBIT_NTFY_TOKEN is an ntfy access token. Neither is ever logged.

export interface NtfyConfig {
	/** Server origin, e.g. https://ntfy.sh */
	server: string;
	topic: string;
	token?: string;
}

export interface Notification {
	title: string;
	message: string;
	/** Opened when the notification is tapped. */
	click?: string;
	tags?: string[];
	priority?: 1 | 2 | 3 | 4 | 5;
}

/** Parse ORBIT_NTFY_URL: an http(s) origin plus exactly one path segment (the topic). */
export function parseNtfyUrl(value: string | undefined): { server: string; topic: string } | undefined {
	if (!value || !value.trim()) return undefined;
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error('ORBIT_NTFY_URL is not a valid URL');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('ORBIT_NTFY_URL must use http or https');
	if (url.username || url.password || url.search || url.hash) throw new Error('ORBIT_NTFY_URL must be the topic URL only, e.g. https://ntfy.sh/my-topic');
	const topic = url.pathname.replace(/^\/|\/$/g, '');
	if (!/^[\w-]{1,64}$/.test(topic)) throw new Error('ORBIT_NTFY_URL must end in a topic name (letters, digits, - or _), e.g. https://ntfy.sh/my-topic');
	return { server: url.origin, topic };
}

export async function sendNtfy(cfg: NtfyConfig, n: Notification, fetchImpl: typeof fetch = fetch): Promise<void> {
	const res = await fetchImpl(cfg.server + '/', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}) },
		body: JSON.stringify({ topic: cfg.topic, title: n.title, message: n.message, click: n.click, tags: n.tags, priority: n.priority ?? 4 }),
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw new Error(`ntfy answered ${res.status}`);
}
