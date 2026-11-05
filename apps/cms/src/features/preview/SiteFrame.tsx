"use client";
// Sandboxed site frame: renders a full HTML page at its true device width and scales it to fit the container.
// sandbox="allow-same-origin" with NO allow-scripts: template scripts never run; the parent (same origin) only
// blocks link navigation and keeps the reader's scroll position across live updates.
import clsx from "clsx";
import { useLayoutEffect, useRef, useState } from "react";

export interface ISiteFrameProps {
	html: string;
	/** True CSS width of the simulated viewport (1280 · 834 · 390). */
	width: number;
	title: string;
	/** Rounded device outline for tablet/mobile widths. */
	device?: "desktop" | "tablet" | "mobile";
	className?: string;
}

export function SiteFrame({ html, width, title, device = "desktop", className }: ISiteFrameProps) {
	const box = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLIFrameElement>(null);
	const scroll = useRef(0);
	const [size, setSize] = useState({ w: 0, h: 0 });

	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const onLoad = () => {
		const f = frame.current;
		const doc = f?.contentDocument;
		if (!f || !doc) return;
		const stop = (e: Event) => {
			const t = e.target as Element | null;
			if (e.type === "submit" || t?.closest?.("a[href]")) e.preventDefault();
		};
		doc.addEventListener("click", stop, true);
		doc.addEventListener("submit", stop, true);
		// Remember where the reader was, so a live update (new srcDoc) lands on the same spot.
		const win = f.contentWindow;
		win?.addEventListener("scroll", () => (scroll.current = win.scrollY), { passive: true });
		if (scroll.current) f.contentWindow?.scrollTo(0, scroll.current);
	};

	const pad = device === "desktop" ? 0 : 24;
	const scale = size.w ? Math.min(1, (size.w - pad * 2) / width) : 0;
	const frameH = scale ? (size.h - pad * 2) / scale : 0;

	return (
		<div ref={box} className={clsx("relative min-h-0 overflow-hidden", className)}>
			{scale > 0 && (
				<div
					dir="ltr"
					className={clsx("mx-auto overflow-hidden bg-surface", device === "desktop" ? "" : "rounded-[22px] ring-8 ring-ink/85")}
					style={{ width: width * scale, height: frameH * scale, marginBlockStart: pad }}
				>
					<iframe
						ref={frame}
						title={title}
						sandbox="allow-same-origin"
						srcDoc={html}
						onLoad={onLoad}
						className="block border-0 bg-surface"
						style={{ width, height: frameH, transform: `scale(${scale})`, transformOrigin: "0 0" }}
					/>
				</div>
			)}
		</div>
	);
}
