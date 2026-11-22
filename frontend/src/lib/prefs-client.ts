// Browser-only: save a preference change and refresh the preference data every
// page reads, so navigating away and back shows the current choice.
import { invalidate } from '$app/navigation';
import { savePrefs, type Prefs } from './prefs';

export async function updatePrefs(p: Prefs): Promise<void> {
	savePrefs(p); // cookie + <html> attributes: applies at once
	await invalidate('orbit:prefs');
}
