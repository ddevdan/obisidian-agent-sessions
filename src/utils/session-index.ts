import type { CachedSessionMeta, SessionIndexData } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Bump whenever a CachedSessionMeta field is added — cached entries are reused on an
// unchanged mtime, so without a bump every already-indexed session keeps serving the
// old shape forever.
// 3: added aiTitle (otherwise every session keeps showing its project name)
// 4: added lastPromptTime (otherwise the list keeps falling back to mtime ordering)
// 5: pi support — cached entries were written when a pi transcript was judged empty,
//    so they must be re-read or every pi session stays hidden
// 6: added format — without it the list labels every session 'claude', so pi sessions are
//    indistinguishable from Claude ones even though they are present
// 7: pi session names — entries cached before this were never scanned for `session_info`,
//    so a named pi session would keep showing its project name
const INDEX_VERSION = 7;
const INDEX_FILENAME = 'session-index.json';

export class SessionIndex {
	private entries: Record<string, CachedSessionMeta> = {};
	private loaded = false;
	private indexPath: string;

	constructor(vaultBasePath: string, configDir: string) {
		this.indexPath = path.join(
			vaultBasePath,
			configDir,
			'plugins',
			'claude-sessions',
			INDEX_FILENAME,
		);
	}

	load(): void {
		if (this.loaded) return;
		this.loaded = true;

		try {
			const raw: string = fs.readFileSync(this.indexPath, 'utf-8');
			const data = JSON.parse(raw) as SessionIndexData;
			if (data.version === INDEX_VERSION && data.entries) {
				this.entries = data.entries;
			}
		} catch {
			// Missing or corrupt — start fresh
			this.entries = {};
		}
	}

	get(filePath: string, mtime: number): CachedSessionMeta | null {
		const cached = this.entries[filePath];
		if (cached && cached.mtime === mtime) return cached;
		return null;
	}

	set(filePath: string, meta: CachedSessionMeta): void {
		this.entries[filePath] = meta;
	}

	prune(validPaths: Set<string>): number {
		let pruned = 0;
		for (const key of Object.keys(this.entries)) {
			if (!validPaths.has(key)) {
				delete this.entries[key];
				pruned++;
			}
		}
		return pruned;
	}

	save(): void {
		const data: SessionIndexData = {
			version: INDEX_VERSION,
			entries: this.entries,
		};
		try {
			fs.writeFileSync(this.indexPath, JSON.stringify(data), 'utf-8');
		} catch {
			// Plugin directory may not exist yet — ignore
		}
	}
}
