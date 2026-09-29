import assert from "node:assert/strict";
import { test } from "node:test";
import { installFicheAutoScroll } from "../src/lib/fiche-auto-scroll.ts";

// Model input, compositor movement, and idle timers separately.
function controllerFixture() {
	class PageElement {
		scrollHeight = 100;
		clientHeight = 100;
		parentElement: PageElement | null = null;
		excluded = false;
		closest(selector: string): PageElement | null {
			return selector === "main"
				? this.parentElement
				: this.excluded
					? this
					: null;
		}
		contains(target: unknown) {
			return target === this;
		}
	}
	const content = new PageElement();
	const root = new PageElement();
	const main = new PageElement();
	content.parentElement = main;
	const timers = new Map<number, { at: number; callback: () => void }>();
	let now = 1000;
	const motion = Object.assign(new EventTarget(), { matches: false });
	const calls: ScrollToOptions[] = [];
	let sequence = 0;
	const browser = Object.assign(new EventTarget(), {
		scrollY: 0,
		innerHeight: 900,
		matchMedia: () => motion,
		setTimeout: (callback: () => void, delay: number) => {
			const id = ++sequence;
			timers.set(id, { at: now + delay, callback });
			return id;
		},
		clearTimeout: (id: number) => {
			timers.delete(id);
		},
		scrollTo: (options: ScrollToOptions) => {
			calls.push(options);
		},
	});
	const globals = {
		window: browser,
		performance: { now: () => now },
		document: { documentElement: root, body: new PageElement() },
		Element: PageElement,
		getComputedStyle: (element: PageElement) => ({
			overflowY: element.scrollHeight > 100 ? "auto" : "visible",
			scrollPaddingTop: "96px",
		}),
		ResizeObserver: class {
			observe() {}
			disconnect() {}
		},
	};
	const originals = new Map<string, PropertyDescriptor | undefined>();
	for (const [name, value] of Object.entries(globals)) {
		originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, value });
	}
	const headings = [-600, 830, 1700].map((top) => ({
		getBoundingClientRect: () => ({ top: top - browser.scrollY }),
	}));
	const stop = installFicheAutoScroll(
		content as unknown as HTMLElement,
		headings as unknown as HTMLElement[],
	);
	return {
		browser,
		calls,
		main,
		content,
		motion,
		stop,
		tick(ms = 140) {
			now += ms;
			for (const [id, timer] of timers) {
				if (timer.at <= now) {
					timers.delete(id);
					timer.callback();
				}
			}
		},
		wheel(deltaY: number, target = content, overrides: Partial<WheelEvent> = {}) {
			const event = Object.assign(new Event("wheel", { cancelable: true }), {
				deltaY,
				deltaX: 0,
				deltaMode: 0,
				ctrlKey: false,
				...overrides,
			});
			Object.defineProperty(event, "target", { value: target });
			browser.dispatchEvent(event);
			return event;
		},
		scroll() {
			browser.dispatchEvent(new Event("scroll"));
		},
		touch(type: "touchstart" | "touchmove", clientY: number) {
			const event = Object.assign(new Event(type), { touches: [{ clientY }] });
			Object.defineProperty(event, "target", { value: content });
			browser.dispatchEvent(event);
		},
		cleanup() {
			stop();
			for (const [name, descriptor] of originals) {
				if (descriptor) Object.defineProperty(globalThis, name, descriptor);
				else Reflect.deleteProperty(globalThis, name);
			}
		},
	};
}

test("does not clamp native movement after a threshold transition", () => {
	const f = controllerFixture();
	try {
		f.wheel(35);
		f.browser.scrollY = 35;
		f.scroll();
		f.tick();
		assert.deepEqual(f.calls, [{ top: 734, behavior: "smooth" }]);
		f.browser.scrollY = 900;
		f.scroll();
		f.tick();
		assert.equal(f.browser.scrollY, 900);
		assert.deepEqual(f.calls, [{ top: 734, behavior: "smooth" }]);
	} finally {
		f.cleanup();
	}
});

test("controller ignores movement without input and clears upward intent", () => {
	const fixture = controllerFixture();
	try {
		fixture.tick();
		assert.equal(fixture.calls.length, 0);
		fixture.browser.scrollY = 35;
		fixture.scroll();
		fixture.tick();
		assert.equal(fixture.calls.length, 0);
		fixture.wheel(-10);
		fixture.browser.scrollY = 25;
		fixture.scroll();
		fixture.browser.scrollY = 40;
		fixture.scroll();
		fixture.tick();
		assert.equal(fixture.calls.length, 0);
	} finally {
		fixture.cleanup();
	}
});

for (const interval of [16, 30]) {
	test(`waits for 15 wheel events ${interval}ms apart in the main gutter`, () => {
		const f = controllerFixture();
		try {
			for (let i = 0; i < 15; i++) {
				f.wheel(3, f.main);
				f.browser.scrollY += 3;
				f.scroll();
				f.tick(interval);
				assert.equal(f.calls.length, 0);
			}
			f.tick();
			assert.deepEqual(f.calls, [{ top: 734, behavior: "smooth" }]);
			f.browser.scrollY = 900;
			f.scroll();
			f.browser.scrollY = 734;
			f.tick();
			assert.deepEqual(f.calls, [{ top: 734, behavior: "smooth" }]);
		} finally {
			f.cleanup();
		}
	});
}

test("waits for momentum after input ends", () => {
	const f = controllerFixture();
	try {
		f.wheel(35);
		for (let i = 0; i < 10; i++) {
			f.browser.scrollY += 5;
			f.scroll();
			f.tick(100);
			assert.equal(f.calls.length, 0);
		}
		f.tick();
		assert.equal(f.calls.length, 1);
	} finally {
		f.cleanup();
	}
});

for (const name of [
	"click",
	"hashchange",
	"resize",
	"up",
	"reduce",
	"cleanup",
]) {
	test(`${name} cancels pending and active transitions`, () => {
		for (const active of [false, true]) {
			const f = controllerFixture();
			try {
				f.wheel(35);
				f.browser.scrollY = 35;
				f.scroll();
				if (active) f.tick();
				if (name === "up") f.wheel(-10);
				else if (name === "reduce") {
					f.motion.matches = true;
					f.motion.dispatchEvent(new Event("change"));
				} else if (name === "cleanup") f.stop();
				else f.browser.dispatchEvent(new Event(name));
				f.tick();
				assert.deepEqual(
					f.calls,
					active
						? [
								{ top: 734, behavior: "smooth" },
								{ top: 35, behavior: "instant" },
							]
						: [],
				);
				if (name === "cleanup") {
					f.wheel(20);
					f.browser.scrollY = 55;
					f.scroll();
					f.tick();
					assert.equal(f.calls.length, active ? 2 : 0);
				}
			} finally {
				f.cleanup();
			}
		}
	});
}

for (const excluded of ["control", "nested", "reduced", "long", "native"]) {
	test(`does not enhance ${excluded} scrolling`, () => {
		const f = controllerFixture();
		try {
			if (excluded === "control") f.content.excluded = true;
			if (excluded === "nested") f.content.scrollHeight = 200;
			if (excluded === "reduced") f.motion.matches = true;
			f.wheel(5);
			f.browser.scrollY =
				excluded === "native" ? 734 : excluded === "long" ? 5 : 35;
			f.scroll();
			f.tick();
			assert.deepEqual(f.calls, []);
		} finally {
			f.cleanup();
		}
	});
}

test("native proximity rebound does not clear downward input", () => {
	const f = controllerFixture();
	try {
		f.wheel(40);
		f.browser.scrollY = 40;
		f.scroll();
		f.tick(30);
		f.browser.scrollY = 35;
		f.scroll();
		f.tick();
		assert.deepEqual(f.calls, [{ top: 734, behavior: "smooth" }]);
	} finally {
		f.cleanup();
	}
});

test("waits for a continuous touch gesture to settle", () => {
	const f = controllerFixture();
	try {
		f.touch("touchstart", 500);
		for (let i = 1; i <= 15; i++) {
			f.touch("touchmove", 500 - i * 3);
			f.browser.scrollY += 3;
			f.scroll();
			f.tick(20);
			assert.equal(f.calls.length, 0);
		}
		f.tick();
		assert.deepEqual(f.calls, [{ top: 734, behavior: "smooth" }]);
		f.touch("touchmove", 500);
		assert.equal(f.calls.at(-1)?.behavior, "instant");
	} finally {
		f.cleanup();
	}
});

for (const reduced of [false, true]) {
	for (const deltaMode of [0, 1, 2]) {
		test(`huge wheel stays native with reduced motion ${reduced} and delta mode ${deltaMode}`, () => {
			const f = controllerFixture();
			try {
				f.motion.matches = reduced;
				for (const deltaY of [10000, -10000]) {
					assert.equal(
						f.wheel(deltaY, f.content, { deltaMode }).defaultPrevented,
						false,
					);
					f.browser.scrollY = deltaY > 0 ? 1800 : 0;
					f.scroll();
					f.tick();
					assert.deepEqual(f.calls, []);
					assert.equal(f.browser.scrollY, deltaY > 0 ? 1800 : 0);
				}
			} finally {
				f.cleanup();
			}
		});
	}
}

for (const excluded of ["control", "nested", "zoom", "horizontal"]) {
	test(`does not prevent ${excluded} wheel input`, () => {
		const f = controllerFixture();
		try {
			if (excluded === "control") f.content.excluded = true;
			if (excluded === "nested") f.content.scrollHeight = 200;
			const event = f.wheel(10000, f.content, {
				ctrlKey: excluded === "zoom",
				deltaX: excluded === "horizontal" ? 20000 : 0,
			});
			assert.equal(event.defaultPrevented, false);
			assert.deepEqual(f.calls, []);
		} finally {
			f.cleanup();
		}
	});
}

test("does not clamp touch movement across section starts", () => {
	const f = controllerFixture();
	try {
		f.touch("touchstart", 500);
		f.browser.scrollY = 1800;
		f.touch("touchmove", 100);
		f.scroll();
		f.tick();
		assert.equal(f.browser.scrollY, 1800);
		assert.deepEqual(f.calls, []);
		f.touch("touchmove", 500);
		f.browser.scrollY = 0;
		f.scroll();
		f.tick();
		assert.equal(f.browser.scrollY, 0);
		assert.deepEqual(f.calls, []);
	} finally {
		f.cleanup();
	}
});
