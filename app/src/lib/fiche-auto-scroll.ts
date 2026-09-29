/** Return only the next heading after the section at the header offset. */
export function nextFicheScrollTarget({
	tops,
	offset,
	viewportHeight,
	deltaY,
	armed,
	transitioning,
	reducedMotion,
}: {
	tops: readonly number[];
	offset: number;
	viewportHeight: number;
	deltaY: number;
	armed: boolean;
	transitioning: boolean;
	reducedMotion: boolean;
}): number | null {
	if (!armed || transitioning || reducedMotion || deltaY <= 0) return null;
	let current = -1;
	for (let index = 0; index < tops.length; index++) {
		if (tops[index] > offset + 1) break;
		current = index;
	}
	const next = current + 1;
	return current >= 0 &&
		next < tops.length &&
		tops[next] <= viewportHeight * 0.9
		? next
		: null;
}

/** Keep native input and anchors. Only explicit page input can arm a transition. */
export function installFicheAutoScroll(
	content: HTMLElement,
	headings: readonly HTMLElement[],
): () => void {
	if (headings.length === 0) return () => {};
	const root = document.documentElement;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const listeners = new AbortController();
	const options = { passive: true, signal: listeners.signal };
	const idleDelay = 140;
	let armed = false;
	let consumed = false;
	let transitioning = false;
	let lastInput = -Infinity;
	let previousY = window.scrollY;
	let movedDown = false;
	let gestureTarget = -1;
	let touchY: number | null = null;
	let idleTimer = 0;

	const offset = () =>
		Number.parseFloat(getComputedStyle(root).scrollPaddingTop) || 96;
	const settle = () => {
		const tops = headings.map((heading) => heading.getBoundingClientRect().top);
		const next = nextFicheScrollTarget({
			tops,
			offset: offset(),
			viewportHeight: window.innerHeight,
			deltaY: movedDown ? 1 : 0,
			armed,
			transitioning,
			reducedMotion: motion.matches,
		});
		armed = false;
		transitioning = false;
		// Native snapping must not start a second section transition.
		if (next === null || next !== gestureTarget) return;
		consumed = true;
		transitioning = true;
		window.scrollTo({
			top: window.scrollY + tops[next] - offset(),
			behavior: "smooth",
		});
	};
	const activity = () => {
		window.clearTimeout(idleTimer);
		idleTimer = window.setTimeout(settle, idleDelay);
	};
	const cancel = () => {
		window.clearTimeout(idleTimer);
		armed = false;
		consumed = true;
		movedDown = false;
		if (transitioning) {
			transitioning = false;
			window.scrollTo({ top: window.scrollY, behavior: "instant" });
		}
		previousY = window.scrollY;
	};
	const pageInput = (target: EventTarget | null): boolean => {
		if (!(target instanceof Element)) return false;
		if (
			target.closest(
				"nav, aside, details, dialog, [role='dialog'], input, textarea, select, button, a, [contenteditable]",
			)
		)
			return false;
		if (
			!content.contains(target) &&
			!content.closest("main")?.contains(target) &&
			target !== document.body &&
			target !== root
		)
			return false;
		for (
			let element: Element | null = target;
			element && element !== document.body;
			element = element.parentElement
		) {
			if (
				element.scrollHeight > element.clientHeight &&
				/auto|scroll/.test(getComputedStyle(element).overflowY)
			)
				return false;
		}
		return true;
	};
	const input = (down: boolean, target: EventTarget | null, repeat = false) => {
		const now = performance.now();
		const fresh = now - lastInput > idleDelay && !repeat;
		lastInput = now;
		if (!down || !pageInput(target) || motion.matches || transitioning) {
			cancel();
		} else {
			if (fresh) {
				consumed = false;
				movedDown = false;
				gestureTarget = headings.findIndex(
					(heading) => heading.getBoundingClientRect().top > offset() + 1,
				);
			}
			armed = !consumed;
		}
		activity();
	};
	window.addEventListener(
		"scroll",
		() => {
			const y = window.scrollY;
			// Native proximity can move upward during a downward gesture.
			// Explicit upward input cancels the gesture in the input handler.
			if (y < previousY && !armed) cancel();
			else if (y > previousY) movedDown = true;
			previousY = y;
			activity();
		},
		options,
	);
	window.addEventListener(
		"wheel",
		(event) => {
			if (event.deltaY !== 0)
				input(
					event.deltaY > 0 &&
						!event.ctrlKey &&
						Math.abs(event.deltaY) > Math.abs(event.deltaX),
					event.target,
				);
		},
		options,
	);
	window.addEventListener(
		"touchstart",
		(event) => {
			cancel();
			touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
		},
		options,
	);
	window.addEventListener(
		"touchmove",
		(event) => {
			const y = event.touches.length === 1 ? event.touches[0].clientY : null;
			if (touchY !== null && y !== null && y !== touchY)
				input(y < touchY, event.target);
			else if (y === null) cancel();
			touchY = y;
		},
		options,
	);
	window.addEventListener(
		"keydown",
		(event) => {
			const down = ["ArrowDown", "PageDown", " "].includes(event.key);
			if (
				down ||
				["ArrowUp", "PageUp", "Home", "End", "Escape"].includes(event.key)
			) {
				input(
					down &&
						!event.shiftKey &&
						!event.metaKey &&
						!event.ctrlKey &&
						!event.altKey,
					event.target,
					event.repeat,
				);
			} else cancel();
		},
		options,
	);
	for (const name of [
		"pointerdown",
		"click",
		"resize",
		"hashchange",
		"popstate",
		"pageshow",
		"pagehide",
		"blur",
	] as const) {
		window.addEventListener(name, cancel, options);
	}
	motion.addEventListener("change", cancel, options);
	const observer = new ResizeObserver(cancel);
	observer.observe(content);
	return () => {
		cancel();
		listeners.abort();
		observer.disconnect();
		window.clearTimeout(idleTimer);
	};
}
