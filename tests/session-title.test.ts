import { describe, it, expect } from 'vitest';
import { sessionDisplayName, sessionTitle, sessionSearchableNames } from '../src/utils/session-title';

describe('sessionTitle', () => {
	it('prefers the user-set customTitle over the generated aiTitle', () => {
		expect(sessionTitle({ customTitle: 'Renamed', aiTitle: 'Auto', project: 'proj' }))
			.toBe('Renamed');
	});

	it('falls back to aiTitle when there is no customTitle', () => {
		expect(sessionTitle({ aiTitle: 'Fix the auth middleware', project: 'proj' }))
			.toBe('Fix the auth middleware');
	});

	// Half of real sessions have no title at all — a "Title:" row must stay absent
	// rather than repeating the Project value next to it.
	it('is undefined when the session has no title', () => {
		expect(sessionTitle({ project: 'proj' })).toBeUndefined();
	});

	it('treats a blank or whitespace-only title as absent', () => {
		expect(sessionTitle({ customTitle: '   ', aiTitle: '', project: 'proj' })).toBeUndefined();
	});

	it('skips a blank customTitle in favour of a real aiTitle', () => {
		expect(sessionTitle({ customTitle: '  ', aiTitle: 'Auto', project: 'proj' })).toBe('Auto');
	});

	it('trims surrounding whitespace', () => {
		expect(sessionTitle({ aiTitle: '  Padded title  ', project: 'proj' })).toBe('Padded title');
	});
});

describe('sessionDisplayName', () => {
	it('uses the title when there is one', () => {
		expect(sessionDisplayName({ aiTitle: 'Auto', project: 'proj' })).toBe('Auto');
	});

	it('falls back to the project name so a label is never empty', () => {
		expect(sessionDisplayName({ project: 'my-project' })).toBe('my-project');
	});

	it('falls back to the project name when every title is blank', () => {
		expect(sessionDisplayName({ customTitle: '', aiTitle: '   ', project: 'my-project' }))
			.toBe('my-project');
	});
});

describe('sessionSearchableNames', () => {
	// A query should find a session by any name it has, not only the displayed one.
	it('returns every name the session carries', () => {
		expect(sessionSearchableNames({ customTitle: 'Renamed', aiTitle: 'Auto', project: 'proj' }))
			.toEqual(['Renamed', 'Auto', 'proj']);
	});

	it('drops blanks', () => {
		expect(sessionSearchableNames({ customTitle: '  ', aiTitle: 'Auto', project: 'proj' }))
			.toEqual(['Auto', 'proj']);
	});

	it('deduplicates identical names', () => {
		expect(sessionSearchableNames({ aiTitle: 'proj', project: 'proj' })).toEqual(['proj']);
	});

	it('always includes the project name', () => {
		expect(sessionSearchableNames({ project: 'proj' })).toEqual(['proj']);
	});
});
