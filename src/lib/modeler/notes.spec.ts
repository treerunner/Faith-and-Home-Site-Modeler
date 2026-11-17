import { describe, it, expect, beforeEach } from 'vitest';
import { NOTE_MAX, store } from './store.svelte';
import { storedSite } from './existing';
import { normalizeSite } from './serialize';

const texts = () => store.plan.annotations.map((a) => `${a.n} ${a.text}`);

describe('notes', () => {
	beforeEach(() => store.newSite());

	it("numbers notes from 1 in the order placed, and asks for the new one's text", () => {
		store.startPlacingNote();
		store.addNote(0, 0);
		expect(store.mode.type).toBe('idle');
		expect(store.focusNote).toBe(1);
		store.addNote(10, 5);
		expect(store.plan.annotations.map((a) => [a.n, a.x, a.y])).toEqual([[1, 0, 0], [2, 10, 5]]);
	});

	it('renumbers the rest when one is deleted', () => {
		for (const t of ['nave', 'hall', 'lane']) {
			store.addNote(0, 0);
			store.updateNote(store.plan.annotations.length, t);
		}
		store.deleteNote(1);
		expect(texts()).toEqual(['1 hall', '2 lane']);
	});

	it('typing in a note is one undo step, and the text is kept short', () => {
		store.addNote(0, 0);
		store.updateNote(1, 'T');
		store.updateNote(1, 'Th');
		store.updateNote(1, 'The nave');
		store.endNoteEdit();
		store.undo();
		expect(texts()).toEqual(['1 ']);
		store.updateNote(1, 'x'.repeat(400));
		expect(store.plan.annotations[0].text).toHaveLength(NOTE_MAX);
	});

	it('a dot dragged moves its note in one step; pressed without moving, it opens its text', () => {
		store.addNote(0, 0);
		store.focusNote = null;
		store.startNoteDrag(1);
		store.dragNote(3, 4);
		store.dragNote(6, 8);
		store.endNoteDrag();
		expect(store.plan.annotations[0]).toMatchObject({ x: 6, y: 8 });
		expect(store.focusNote).toBeNull();
		store.undo();
		expect(store.plan.annotations[0]).toMatchObject({ x: 0, y: 0 });
		store.startNoteDrag(1);
		store.endNoteDrag();
		expect(store.focusNote).toBe(1);
	});

	it("each plan has its own notes; a new plan starts without the site's, and they save", () => {
		store.addNote(0, 0);
		store.updateNote(1, 'What stands today');
		store.newPlan();
		expect(store.plan.annotations).toEqual([]);
		store.addNote(5, 5);
		store.updateNote(1, 'New cottages');
		expect(store.site.existing.annotations.map((a) => a.text)).toEqual(['What stands today']);
		const saved = normalizeSite(JSON.parse(JSON.stringify(storedSite(store.site))));
		expect(saved.plans[0].annotations).toEqual([{ n: 1, x: 5, y: 5, text: 'New cottages' }]);
		expect(saved.existing.annotations[0].text).toBe('What stands today');
	});
});
