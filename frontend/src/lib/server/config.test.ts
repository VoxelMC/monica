import { describe, expect, it } from 'vitest';
import { assertDevTargetsStaging, parseDryRun, parseMonicaUrl, parseReadOnly, parseToken } from './config';

describe('ORBIT_READ_ONLY', () => {
	it('defaults to true when unset or empty', () => {
		expect(parseReadOnly(undefined)).toBe(true);
		expect(parseReadOnly('')).toBe(true);
	});
	it('is false only for an explicit "false"', () => {
		expect(parseReadOnly('false')).toBe(false);
		expect(parseReadOnly(' FALSE ')).toBe(false);
		expect(parseReadOnly('true')).toBe(true);
	});
	it('rejects typos instead of guessing', () => {
		for (const v of ['0', 'no', 'off', 'flase', 'yes']) expect(() => parseReadOnly(v)).toThrow();
	});
});

describe('ORBIT_DRY_RUN', () => {
	it('defaults to false', () => expect(parseDryRun(undefined)).toBe(false));
	it('parses true', () => expect(parseDryRun('true')).toBe(true));
});

describe('MONICA_URL', () => {
	it('returns the origin', () => {
		expect(parseMonicaUrl('http://127.0.0.1:8081')).toBe('http://127.0.0.1:8081');
		expect(parseMonicaUrl('http://127.0.0.1:8081/')).toBe('http://127.0.0.1:8081');
	});
	it('rejects paths, credentials and odd schemes', () => {
		expect(() => parseMonicaUrl(undefined)).toThrow();
		expect(() => parseMonicaUrl('http://127.0.0.1:8081/api')).toThrow();
		expect(() => parseMonicaUrl('http://u:p@127.0.0.1:8081')).toThrow();
		expect(() => parseMonicaUrl('ftp://127.0.0.1')).toThrow();
		expect(() => parseMonicaUrl('not a url')).toThrow();
	});
});

describe('dev staging check', () => {
	it('allows staging in dev', () => expect(() => assertDevTargetsStaging('http://127.0.0.1:8081', true)).not.toThrow());
	it('refuses anything else in dev', () => {
		expect(() => assertDevTargetsStaging('http://127.0.0.1:80', true)).toThrow(/staging/);
		expect(() => assertDevTargetsStaging('https://monica.trevfox.dev', true)).toThrow();
	});
	it('does not apply in production', () => expect(() => assertDevTargetsStaging('http://127.0.0.1:80', false)).not.toThrow());
});

describe('MONICA_TOKEN', () => {
	it('is required', () => expect(() => parseToken('  ')).toThrow());
	it('returns the trimmed token', () => expect(parseToken(' abc ')).toBe('abc'));
});
