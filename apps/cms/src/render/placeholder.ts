// Neutral, labelled placeholder for image slots without a selected candidate (preview only).
// Named CSS colors keep this tenant-neutral (it renders inside the site's page, not the CMS UI).

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `data:image/svg+xml` URI labelled with the slot name + target dimensions. No literal commas (srcset-safe). */
export function placeholderSvg(name: string, width: number, height: number, note?: string): string {
	const w = Math.max(1, Math.round(width));
	const h = Math.max(1, Math.round(height));
	const fs = Math.max(14, Math.round(Math.min(w, h) / 14));
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
		`<rect width="${w}" height="${h}" fill="whitesmoke"/>` +
		`<rect x="${fs}" y="${fs}" width="${w - fs * 2}" height="${h - fs * 2}" fill="none" stroke="silver" stroke-width="2" stroke-dasharray="${fs / 2} ${fs / 2}" rx="${fs}"/>` +
		`<text x="50%" y="${h / 2 - fs * 0.3}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${fs * 1.3}" fill="dimgray">${esc(name)}</text>` +
		`<text x="50%" y="${h / 2 + fs * 1.4}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="${fs}" fill="gray">${w}×${h}${note ? ` · ${esc(note)} · preview art` : " · not selected yet"}</text>` +
		`</svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
