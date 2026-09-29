import assert from "node:assert/strict";
import { test } from "node:test";
import { installFicheAutoScroll, nextFicheScrollTarget } from "../src/lib/fiche-auto-scroll.ts";

const state: Parameters<typeof nextFicheScrollTarget>[0] = {
	tops: [96, 750, 1400],
	offset: 96,
	viewportHeight: 1000,
	deltaY: 1,
	armed: true,
	transitioning: false,
	reducedMotion: false,
};

test("selects the next heading already visible at 75 percent", () => {
	assert.equal(nextFicheScrollTarget(state), 1);
});

test("uses the inclusive 90 percent threshold", () => {
	assert.equal(nextFicheScrollTarget({ ...state, tops: [96, 900] }), 1);
	assert.equal(nextFicheScrollTarget({ ...state, tops: [96, 900.01] }), null);
	assert.equal(nextFicheScrollTarget({ ...state, viewportHeight: 800 }), null);
});

test("requires explicit intent and actual downward movement", () => {
	for (const deltaY of [-100, -0.1, 0]) {
		assert.equal(nextFicheScrollTarget({ ...state, deltaY }), null);
	}
	assert.equal(nextFicheScrollTarget({ ...state, armed: false }), null);
});

test("does not chain during a programmatic transition or after consumed intent", () => {
	assert.equal(nextFicheScrollTarget({ ...state, transitioning: true }), null);
	assert.equal(nextFicheScrollTarget({ ...state, tops: [-700, 96, 750], armed: false }), null);
});

test("reduced motion disables auto-scroll", () => {
	assert.equal(nextFicheScrollTarget({ ...state, reducedMotion: true }), null);
});

test("requires a current section at the header offset", () => {
	assert.equal(nextFicheScrollTarget({ ...state, tops: [200, 750] }), null);
	assert.equal(nextFicheScrollTarget({ ...state, tops: [97, 750] }), 1);
	assert.equal(nextFicheScrollTarget({ ...state, tops: [97.01, 750] }), null);
});

test("selects only the next heading after the current section", () => {
	assert.equal(nextFicheScrollTarget({ ...state, tops: [-700, 96, 500, 750] }), 2);
	assert.equal(nextFicheScrollTarget({ ...state, tops: [-700, -200, 96] }), null);
	assert.equal(nextFicheScrollTarget({ ...state, tops: [] }), null);
	assert.equal(nextFicheScrollTarget({ ...state, tops: [96] }), null);
});

test("does not access browser APIs when no headings exist", () => {
	const content = {} as HTMLElement;
	installFicheAutoScroll(content, [])();
});
