import { describe, expect, it } from 'vitest';
import { checkField } from '../contact-fields';
import { addField, editField } from './contact-fields-save';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';

const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const types = [{ id: 1, type: 'email' }, { id: 2, type: 'phone' }, { id: 3, type: null }];
const FIELD = { data: { id: 29, content: '+1 778-363-4155', contact_field_type: { id: 2, name: 'Phone', type: 'phone' }, contact: { id: 13 }, updated_at: 'T1' } };
const fields = [{ id: 29, type: 'phone', content: '+1 778-363-4155' }, { id: 31, type: null, content: 'fb.me/x' }];
function setup(readOnly = false) {
	const f = fakeFetch(() => ({ body: FIELD }));
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly, fetch: f.fetch, ...fakeClock() });
	return { ...f, guards: createGuards({ transport, readOnly, dryRun: false, audit: memoryAudit().audit, allowlist: WRITE_ALLOWLIST }) };
}

describe('checkField', () => {
	it('tidies and checks', () => {
		expect(checkField('phone', ' +33  7 82 45 ')).toEqual({ value: '+33 7 82 45' });
		expect(checkField('phone', 'call me')).toHaveProperty('error');
		expect(checkField('phone', '12')).toHaveProperty('error');
		expect(checkField('email', 'a@b.fr')).toEqual({ value: 'a@b.fr' });
		expect(checkField('email', 'a@b')).toHaveProperty('error');
	});
});

describe('addField', () => {
	it('adds a phone with Monica’s phone type', async () => {
		const { guards, calls } = setup();
		expect(await addField(guards, 13, fd({ kind: 'phone', value: '+1 604 555 0101' }), types)).toMatchObject({ ok: true });
		expect(calls[0].body).toEqual({ contact_id: 13, contact_field_type_id: 2, data: '+1 604 555 0101' });
	});
	it('refuses bad values and unknown kinds before sending; read-only says so', async () => {
		const { guards, calls } = setup();
		expect((await addField(guards, 13, fd({ kind: 'email', value: 'nope' }), types)).ok).toBe(false);
		expect((await addField(guards, 13, fd({ kind: 'facebook', value: 'x' }), types)).ok).toBe(false);
		expect(calls).toHaveLength(0);
		const ro = setup(true);
		expect((await addField(ro.guards, 13, fd({ kind: 'phone', value: '123' }), types)).message).toMatch(/read-only/);
	});
});

describe('editField', () => {
	it('changes only the text of this contact’s phone', async () => {
		const { guards, calls } = setup();
		expect(await editField(guards, fd({ fieldId: '29', value: '+1 778 363 0000', updatedAt: 'T1' }), fields)).toMatchObject({ ok: true });
		expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
		expect(calls[1].body).toEqual({ contact_id: 13, contact_field_type_id: 2, data: '+1 778 363 0000' });
	});
	it('refuses other contacts’ fields, social links, no-ops; conflicts say so', async () => {
		const { guards, calls } = setup();
		expect((await editField(guards, fd({ fieldId: '99', value: '123', updatedAt: 'T1' }), fields)).message).toMatch(/not on this contact/);
		expect((await editField(guards, fd({ fieldId: '31', value: 'x', updatedAt: 'T1' }), fields)).ok).toBe(false);
		expect((await editField(guards, fd({ fieldId: '29', value: ' +1 778-363-4155 ', updatedAt: 'T1' }), fields)).message).toMatch(/Nothing changed/);
		expect(calls).toHaveLength(0);
		expect((await editField(guards, fd({ fieldId: '29', value: '123 456', updatedAt: 'T0' }), fields)).message).toMatch(/changed in Monica/);
	});
});
