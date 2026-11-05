"use client";

// Shared image-pipeline pieces (S07 per-post pipeline + S08 cross-post queue).
import { useEffect, useState } from "react";
import { Button, Callout, FileDrop, Sheet, TextArea } from "@/ds";
import { useCms } from "@/lib/store";
import type { IImageSlot, TProvider } from "@/lib/types";

export const ROUTABLE: TProvider[] = ["higgsfield", "openai", "open-source"];

/** First slot a person should look at: candidates to pick, then failures, then human-only, then anything unfilled. */
export function defaultSlot(slots: IImageSlot[]): IImageSlot | undefined {
	const order: IImageSlot["status"][] = ["candidates", "failed", "human-only", "generating", "queued"];
	for (const st of order) {
		const hit = slots.find((s) => s.status === st);
		if (hit) return hit;
	}
	return slots[0];
}

export function slotStatusWord(s: IImageSlot): string {
	switch (s.status) {
		case "selected":
			return "filled";
		case "human-only":
			return "waiting on an upload";
		case "candidates":
			return `${s.candidates.length} candidates to pick from`;
		case "generating":
			return "generating";
		case "queued":
			return "queued";
		case "failed":
			return "provider failed";
	}
}

/** Guardrail: no identifiable real people, no imitation of living artists (PRD imagery rule). */
export function guardrailHit(prompt: string): boolean {
	return /\bin the style of\b|\b(portrait|photo|picture|image) of (?!a |an |the )[A-Z][a-z]+ [A-Z][a-z]+/.test(prompt);
}

export const GUARDRAIL_COPY = "We don't generate identifiable real people or imitate living artists. Edit the prompt or upload a licensed photo.";

/** Chart slots are rendered from the post's own data — a schematic here, never a model output. */
export function ChartSchematic({ slot }: { slot: IImageSlot }) {
	const bars = [
		{ label: "Minor", a: 38, b: 52 },
		{ label: "Moderate", a: 62, b: 70 },
		{ label: "Comprehensive", a: 88, b: 84 },
	];
	return (
		<figure className="flex flex-col gap-3 rounded-xl bg-sunken-2 p-5">
			<svg viewBox="0 0 320 150" role="img" aria-label={`${slot.name}: schematic of the inline SVG chart, rendered from the post's data at build`} className="w-full text-ink">
				<line x1="12" y1="126" x2="308" y2="126" stroke="currentColor" strokeOpacity="0.15" />
				{bars.map((g, i) => {
					const x = 32 + i * 98;
					return (
						<g key={g.label}>
							<rect x={x} y={126 - g.a} width="26" height={g.a} rx="4" fill="currentColor" />
							<rect x={x + 30} y={126 - g.b} width="26" height={g.b} rx="4" fill="currentColor" fillOpacity="0.25" />
							<text x={x + 28} y="142" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.7">
								{g.label}
							</text>
						</g>
					);
				})}
			</svg>
			<figcaption className="text-xs text-ink-3">Schematic · bar heights come from the post&apos;s price table when the MR builds</figcaption>
		</figure>
	);
}

/** F4c — upload your own image into a slot (FileDrop → alt text → Use upload). */
export function UploadSheet({ slot, open, onClose }: { slot: IImageSlot | undefined; open: boolean; onClose: () => void }) {
	const { actions } = useCms();
	const [file, setFile] = useState<File | null>(null);
	const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
	const [alt, setAlt] = useState(slot?.alt ?? "");
	useEffect(() => {
		setFile(null);
		setDims(null);
		setAlt(slot?.alt ?? "");
	}, [slot?.id, slot?.alt, open]);
	if (!slot) return null;
	const small = dims && slot.format !== "svg" && (dims.w < slot.width || dims.h < slot.height);
	return (
		<Sheet
			open={open}
			onClose={onClose}
			title={`Upload your own · ${slot.name}`}
			width={480}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="primary"
						icon="Check"
						disabled={!file || !!small || !alt.trim()}
						onClick={() => {
							if (!file) return;
							const r = actions.uploadOwn(slot.id, file.name);
							if (r.ok) onClose();
						}}
					>
						Use upload
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<FileDrop
					accept=".png,.jpg,.jpeg,.webp,.avif,.svg"
					title={file ? file.name : "Drop a JPG, PNG or WebP"}
					hint={file && dims ? `${dims.w} × ${dims.h} · converts to ${slot.format.toUpperCase()} as ${slot.filename}` : `min ${slot.width} × ${slot.height} · converted to ${slot.format.toUpperCase()} and renamed ${slot.filename}`}
					onFile={(f) => {
						setFile(f);
						setDims(null);
						if (typeof createImageBitmap === "function")
							createImageBitmap(f)
								.then((b) => setDims({ w: b.width, h: b.height }))
								.catch(() => setDims(null));
					}}
				/>
				{small && dims && (
					<Callout tone="block" title={`This image is ${dims.w} × ${dims.h}.`}>
						The slot needs at least {slot.width} × {slot.height}. Upload a larger version.
					</Callout>
				)}
				<TextArea label="Alt text · travels with the asset" value={alt} onChange={setAlt} rows={2} error={!alt.trim() ? "Add alt text — it travels with the asset" : undefined} />
				<p className="text-sm text-ink-3">Provenance records it as a human upload with your name and the time.</p>
			</div>
		</Sheet>
	);
}
