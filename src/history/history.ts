/**
 * Undo/redo history. Each entry holds a snapshot of the document before and
 * after a change. Consecutive changes with the same merge key (typing in one
 * column) inside the merge window fold into one entry.
 */
import { clone } from '../model/doc';
import type { Doc } from '../model/types';

export interface HistoryEntry {
	label: string;
	before: Doc;
	after: Doc;
	mergeKey?: string;
	time: number;
	/** Extra state the editor wants back on undo (e.g. which column had focus). */
	meta?: Record<string, unknown>;
}

export interface RecordOptions {
	mergeKey?: string;
	meta?: Record<string, unknown>;
}

export class History {
	private undoStack: HistoryEntry[] = [];
	private redoStack: HistoryEntry[] = [];
	private sealed = true;

	constructor(
		public limit = 200,
		/** Typing pauses longer than this start a new entry (ms). */
		public mergeWindow = 1000,
		private now: () => number = () => Date.now(),
	) {}

	/**
	 * Record a change. Snapshots are cloned, so callers may keep mutating
	 * their documents. Returns the entry that now holds the change.
	 */
	record(label: string, before: Doc, after: Doc, opts: RecordOptions = {}): HistoryEntry {
		const time = this.now();
		const top = this.undoStack[this.undoStack.length - 1];
		this.redoStack = [];
		if (
			!this.sealed &&
			top &&
			opts.mergeKey &&
			top.mergeKey === opts.mergeKey &&
			time - top.time <= this.mergeWindow
		) {
			top.after = clone(after);
			top.time = time;
			return top;
		}
		const entry: HistoryEntry = {
			label,
			before: clone(before),
			after: clone(after),
			mergeKey: opts.mergeKey,
			time,
			meta: opts.meta,
		};
		this.undoStack.push(entry);
		if (this.undoStack.length > this.limit) this.undoStack.shift();
		this.sealed = !opts.mergeKey;
		return entry;
	}

	/** Stop the current entry from absorbing further changes. */
	seal(): void {
		this.sealed = true;
	}

	/** Pop the last change; the caller restores `entry.before`. */
	undo(): HistoryEntry | null {
		const entry = this.undoStack.pop();
		if (!entry) return null;
		this.redoStack.push(entry);
		this.sealed = true;
		return entry;
	}

	/** Re-apply the last undone change; the caller restores `entry.after`. */
	redo(): HistoryEntry | null {
		const entry = this.redoStack.pop();
		if (!entry) return null;
		this.undoStack.push(entry);
		this.sealed = true;
		return entry;
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/** Label of the step undo would revert, or null. */
	get undoLabel(): string | null {
		return this.undoStack[this.undoStack.length - 1]?.label ?? null;
	}

	get redoLabel(): string | null {
		return this.redoStack[this.redoStack.length - 1]?.label ?? null;
	}

	get size(): { undo: number; redo: number } {
		return { undo: this.undoStack.length, redo: this.redoStack.length };
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
		this.sealed = true;
	}
}
