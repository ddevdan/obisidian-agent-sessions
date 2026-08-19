import { Platform, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { SKIP_TYPE_STRINGS, CUSTOM_TITLE_PATTERN, AI_TITLE_PATTERN, RT_AI_TITLE, USER_TYPE_PATTERN, RE_RECORD_TIMESTAMP } from '../constants';

interface ReadProgress {
	bytesRead: number;
	totalBytes: number;
}

/**
 * Read a file line-by-line. Uses Node.js streams on desktop,
 * falls back to full read on mobile.
 */
export async function readFileContent(
	filePath: string,
	onProgress?: (progress: ReadProgress) => void
): Promise<string> {
	if (Platform.isDesktop) {
		return readDesktop(filePath, onProgress);
	}
	// Mobile fallback — can't read arbitrary filesystem paths
	new Notice('On mobile, use vault files instead of filesystem paths.');
	throw new Error('Filesystem access is not available on mobile.');
}

async function readDesktop(
	filePath: string,
	onProgress?: (progress: ReadProgress) => void
): Promise<string> {
	const resolved: string = path.resolve(filePath);

	return new Promise((resolve, reject) => {
		let stat: fs.Stats;
		try {
			stat = fs.statSync(resolved);
		} catch {
			reject(new Error(`File not found: ${resolved}`));
			return;
		}

		const totalBytes: number = stat.size;
		let bytesRead = 0;
		const chunks: string[] = [];

		const stream: fs.ReadStream = fs.createReadStream(resolved, { encoding: 'utf-8' });

		stream.on('data', (chunk: string) => {
			chunks.push(chunk);
			bytesRead += Buffer.byteLength(chunk, 'utf-8');
			if (onProgress) {
				onProgress({ bytesRead, totalBytes });
			}
		});

		stream.on('end', () => {
			resolve(chunks.join(''));
		});

		stream.on('error', (err: Error) => {
			reject(err);
		});
	});
}

export interface QuickMetadata {
	sessionId?: string;
	cwd?: string;
	startTime?: string;
	hasContent: boolean;
	/** User-defined session name from /rename command (last value). Wins over aiTitle. */
	customTitle?: string;
	/** Claude Code's auto-generated session name (last value). */
	aiTitle?: string;
	/** ISO timestamp of the last user prompt — when the human last typed something. */
	lastPromptTime?: string;
}


/**
 * Read a JSONL file line-by-line and extract metadata from early records.
 * Skips large record types by prefix check to avoid parsing multi-KB JSON.
 * Extracts sessionId/cwd/startTime from first 100 lines.
 * Scans entire file for custom-title, ai-title and user records, keeping the last
 * value of each — the titles and the last prompt time all live near the end of a
 * session, so none of them can be read from the first 100 lines. Desktop only.
 */
export async function extractQuickMetadataAsync(filePath: string): Promise<QuickMetadata> {
	if (!Platform.isDesktop) return { hasContent: false };

	const result: QuickMetadata = { hasContent: false };
	const MAX_LINES_FOR_BASIC = 100;
	let lineCount = 0;
	let basicMetaDone = false;

	return new Promise((resolve) => {
		const stream: fs.ReadStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
		const rl: readline.Interface = readline.createInterface({ input: stream, crlfDelay: Infinity });

		const isBasicDone = () =>
			result.sessionId !== undefined
			&& result.cwd !== undefined
			&& result.startTime !== undefined
			&& result.hasContent;

		rl.on('line', (line) => {
			lineCount++;

			const trimmed = line.trim();
			if (!trimmed) return;

			// Check for custom-title records throughout the file (keep last)
			if (trimmed.includes(CUSTOM_TITLE_PATTERN)) {
				try {
					const record = JSON.parse(trimmed) as Record<string, unknown>;
					if (record['type'] === 'custom-title' && typeof record['customTitle'] === 'string') {
						result.customTitle = record['customTitle'];
					}
				} catch {
					// Malformed JSON — skip
				}
				return;
			}

			// Same for ai-title, Claude Code's auto-generated name. Regenerated as the
			// session evolves, so scan the whole file and keep the last value. Must be
			// tested before the SKIP_TYPE_STRINGS sweep below, which also matches it.
			if (trimmed.includes(AI_TITLE_PATTERN)) {
				try {
					const record = JSON.parse(trimmed) as Record<string, unknown>;
					if (record['type'] === RT_AI_TITLE && typeof record['aiTitle'] === 'string') {
						result.aiTitle = record['aiTitle'];
					}
				} catch {
					// Malformed JSON — skip
				}
				return;
			}

			// Last user prompt time, tracked over the whole file (keep last). The file's
			// mtime is a poor stand-in: background writes keep touching it long after the
			// human stopped typing, so the two orderings agree on only ~13% of positions.
			// The type check looks at the head only, so a nested "type":"user" inside a
			// tool result can't match; the regex then avoids parsing multi-KB records.
			const lineHead = trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
			if (lineHead.includes(USER_TYPE_PATTERN)) {
				const ts = RE_RECORD_TIMESTAMP.exec(trimmed);
				if (ts) result.lastPromptTime = ts[1];
			}

			// For other metadata, only process first MAX_LINES_FOR_BASIC lines
			if (basicMetaDone || lineCount > MAX_LINES_FOR_BASIC) {
				if (!basicMetaDone && lineCount > MAX_LINES_FOR_BASIC) {
					basicMetaDone = true;
				}
				return;
			}

			// Skip large record types without full parsing — check substring within first 200 chars
			for (const sub of SKIP_TYPE_STRINGS) {
				if (lineHead.includes(sub)) return;
			}

			try {
				const record = JSON.parse(trimmed) as Record<string, unknown>;
				const recordType = record['type'] as string | undefined;

				if (recordType === 'user' || recordType === 'assistant') {
					result.hasContent = true;
				}

				if (typeof record['sessionId'] === 'string' && !result.sessionId) {
					result.sessionId = record['sessionId'];
				}
				if (typeof record['cwd'] === 'string' && !result.cwd) {
					result.cwd = record['cwd'];
				}
				if (typeof record['timestamp'] === 'string' && !result.startTime) {
					result.startTime = record['timestamp'];
				}
			} catch {
				// Malformed JSON — skip
			}

			if (isBasicDone()) {
				basicMetaDone = true;
			}
		});

		rl.on('close', () => {
			resolve(result);
		});

		stream.on('error', () => {
			resolve(result);
		});
	});
}

/**
 * List files in a directory. Desktop only.
 */
/**
 * List file names in a directory. Desktop only.
 * Returns just the file names (not full paths).
 */
export function listDirectoryFiles(dirPath: string): Promise<string[]> {
	if (!Platform.isDesktop) return Promise.resolve([]);
	const resolved: string = path.resolve(dirPath);
	try {
		const entries: fs.Dirent[] = fs.readdirSync(resolved, { withFileTypes: true });
		const names: string[] = entries
			.filter((e) => e.isFile())
			.map((e) => e.name);
		return Promise.resolve(names);
	} catch {
		return Promise.resolve([]);
	}
}

export function listDirectory(dirPath: string): string[] {
	if (!Platform.isDesktop) return [];

	const resolved: string = path.resolve(dirPath);

	try {
		const entries: fs.Dirent[] = fs.readdirSync(resolved, { withFileTypes: true });
		return entries
			.filter((e) =>
				e.isFile() && e.name.endsWith('.jsonl') && !e.name.startsWith('agent-')
			)
			.map((e) => path.join(resolved, e.name));
	} catch {
		return [];
	}
}

/**
 * List subdirectories. Desktop only.
 */
export function listSubdirectories(dirPath: string): string[] {
	if (!Platform.isDesktop) return [];

	const resolved: string = path.resolve(dirPath);

	try {
		const entries: fs.Dirent[] = fs.readdirSync(resolved, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory())
			.map((e) => path.join(resolved, e.name));
	} catch {
		return [];
	}
}
