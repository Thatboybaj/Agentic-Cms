// The credited author in the page (prd-rubrics-and-authors D1–D4): byline link, author card and schema.org Person.
// Fidelity rule: only slots the template already has are filled; an empty profile field removes its element rather
// than leaving the sample's text or an empty link behind. The renderer never generates or alters a person's photo.

export interface IAuthorProfile {
	name: string;
	url?: string;
	jobTitle?: string;
	bio?: string;
	sameAs?: string[];
	credentials?: string[];
	/** The photo as the page references it (asset path on publish, a URL in preview); srcset optional. */
	image?: { src: string; width: number; height: number; alt: string; srcset?: string };
}

/** schema.org Person for the Article/BlogPosting `author` (D3). Empty fields are left out, never "undefined". */
export function personJsonLd(p: IAuthorProfile): Record<string, unknown> {
	return {
		"@type": "Person",
		name: p.name,
		...(p.jobTitle ? { jobTitle: p.jobTitle } : {}),
		...(p.image ? { image: p.image.src } : {}),
		...(p.url ? { url: p.url } : {}),
		...(p.sameAs?.length ? { sameAs: p.sameAs } : {}),
		...(p.bio ? { description: p.bio } : {}),
		...(p.credentials?.length ? { hasCredential: p.credentials.map((c) => ({ "@type": "EducationalOccupationalCredential", name: c })) } : {}),
	};
}

const AUTO_CARD = '[class*="author-card"], [class*="author-bio"], [class*="author-box"], [class*="authorcard"], [itemprop="author"][itemscope]';

function setTextKeepChildren(el: Element, text: string) {
	// Replace the first text-bearing descendant so wrappers (icons, spans) keep their markup.
	const walker = Array.from(el.childNodes);
	const textNode = walker.find((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
	if (textNode) textNode.textContent = text;
	else el.textContent = text;
}

/** The byline element: fill the name; a link points at the author page, or stops being a link when there's none. */
export function fillByline(el: Element, p: IAuthorProfile) {
	const link = el.tagName.toLowerCase() === "a" ? el : el.querySelector("a");
	if (link && link !== el) {
		link.textContent = p.name;
	} else setTextKeepChildren(el, p.name);
	if (link) {
		if (p.url) link.setAttribute("href", p.url);
		else link.removeAttribute("href");
	}
}

function pick(card: Element, sel: string): Element | null {
	try {
		return card.querySelector(sel);
	} catch {
		return null;
	}
}

/** An author card the template has (mapped "Author bio" or recognised by class): name, title, bio, photo, link. */
export function fillAuthorCard(card: Element, p: IAuthorProfile): { missingPhoto: boolean } {
	const name = pick(card, '[class*="name"], [itemprop="name"], h2, h3, h4, strong');
	const title = pick(card, '[class*="title"]:not(h1):not(h2), [class*="role"], [class*="job"], [itemprop="jobTitle"]');
	const img = pick(card, "img");
	const bio = Array.from(card.querySelectorAll("p")).find((x) => x !== name && x !== title && !x.contains(name ?? null) && !(title && x.contains(title)));
	if (name) {
		if (name.querySelector("a")) fillByline(name, p);
		else name.textContent = p.name;
	}
	if (title) {
		if (p.jobTitle) title.textContent = p.jobTitle;
		else title.remove();
	}
	if (bio) {
		if (p.bio) bio.textContent = p.bio;
		else bio.remove();
	}
	if (img) {
		if (p.image) {
			img.setAttribute("src", p.image.src);
			img.setAttribute("alt", p.image.alt);
			img.setAttribute("width", String(p.image.width));
			img.setAttribute("height", String(p.image.height));
			img.setAttribute("loading", "lazy");
			if (p.image.srcset) img.setAttribute("srcset", p.image.srcset);
			else img.removeAttribute("srcset");
			img.removeAttribute("data-src");
		} else img.remove();
	}
	// An initials avatar (no <img>) shows the credited author's initials, not the sample's.
	const initials = p.name
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => w[0]!.toUpperCase())
		.slice(0, 2)
		.join("");
	for (const av of Array.from(card.querySelectorAll('[class*="avatar"]'))) if (!av.querySelector("img") && av.tagName.toLowerCase() !== "img" && !av.children.length) av.textContent = initials;
	for (const a of Array.from(card.querySelectorAll("a"))) {
		if (name?.contains(a)) continue;
		if (p.url) a.setAttribute("href", p.url);
		else if (!a.textContent?.trim()) a.remove();
		else a.removeAttribute("href");
	}
	return { missingPhoto: !!img && !p.image };
}

/** Author cards in the page: the ones a developer mapped as "Author bio", else ones recognised by class name. */
export function authorCards(doc: Document, mappedSelectors: string[]): Element[] {
	const out = new Set<Element>();
	for (const sel of mappedSelectors) {
		try {
			for (const el of Array.from(doc.querySelectorAll(sel))) out.add(el);
		} catch {
			/* a selector the parser can't read */
		}
	}
	if (!out.size) for (const el of Array.from(doc.querySelectorAll(AUTO_CARD))) if (!Array.from(out).some((o) => o.contains(el))) out.add(el);
	return [...out].filter((el) => ![...out].some((o) => o !== el && o.contains(el)));
}
