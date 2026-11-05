import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCmsStore } from "./store";

describe("store simulation", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const boot = () => {
		const s = createCmsStore(false);
		s.hydrate();
		return s;
	};
	// Post ids are unique across tenants in the seed; the site no longer lives in shared state.
	const post = (s: ReturnType<typeof boot>, id: string) => Object.values(s.state.data).flatMap((d) => d.posts).find((p) => p.id === id)!;

	it("stakeholders can comment but not approve", () => {
		const s = boot();
		s.actions.setRole("stakeholder");
		expect(s.actions.approve("p-implant-vs-bridge").ok).toBe(false);
		expect(s.actions.addComment("p-root-canal", "Looks good").ok).toBe(true);
		s.stop();
	});

	it("blocks approval on hard blocks; opens an MR with a logged override; merge makes it Live", () => {
		const s = boot();
		expect(s.actions.approve("p-root-canal").ok).toBe(false);
		expect(s.actions.approve("p-implant-vs-bridge").ok).toBe(false);
		const r = s.actions.approve("p-implant-vs-bridge", { "internal-links": "Only one relevant page is live. The implants guide ships next week." });
		expect(r.ok).toBe(true);
		const data = s.state.data.lumen;
		const mr = data.mergeRequests.find((m) => m.id === (r as { id: string }).id)!;
		expect(mr).toMatchObject({ number: 45, branch: "content/implant-vs-bridge-cost", base: "main", ci: "pending", status: "open" });
		expect(mr.files.map((f) => f.path)).toEqual(["content/blog/implant-vs-bridge-cost.mdx", "public/images/blog/ · 3 WebP · 1 SVG", "public/sitemap.xml"]);
		expect(mr.description).toMatch(/Unresolved \(soft gate overridden\)/);
		expect(post(s, "p-implant-vs-bridge").state).toBe("mr-open");
		expect(data.audit.slice(0, 3).map((a) => a.action)).toEqual(["opened MR", "approved", "overrode soft block"]);
		// Developer merges once CI passes.
		s.actions.setRole("developer");
		expect(s.actions.mergeMr(mr.id).ok).toBe(false); // CI pending
		vi.advanceTimersByTime(3000);
		expect(s.actions.mergeMr(mr.id).ok).toBe(true);
		expect(post(s, "p-implant-vs-bridge").state).toBe("live");
		expect(s.state.data.lumen.runs[0]).toMatchObject({ kind: "kas-recalc", status: "queued" });
		s.stop();
	});

	it("an agent edit never mutates content until accepted", () => {
		const s = boot();
		const before = JSON.stringify(post(s, "p-root-canal").blocks);
		expect(s.actions.fixCheck("p-root-canal", "kw-first-100").ok).toBe(true);
		vi.advanceTimersByTime(2000);
		const p = post(s, "p-root-canal");
		expect(JSON.stringify(p.blocks)).toBe(before);
		const sg = p.suggestions.find((x) => x.fixesCheckId === "kw-first-100" && x.status === "pending")!;
		expect(s.actions.acceptSuggestion("p-root-canal", sg.id).ok).toBe(true);
		expect(post(s, "p-root-canal").gate.find((c) => c.id === "kw-first-100")!.status).toBe("pass");
		expect(post(s, "p-root-canal").blocks[0].text).toMatch(/^If you're searching for root canal recovery/);
		// Fact marker still blocks until sourced.
		expect(s.actions.addFactSource("p-root-canal", "f-rc-95", "https://www.aae.org/patients/")).toMatchObject({ ok: true });
		expect(s.actions.approve("p-root-canal", { "internal-links": "Refresh adds the link next week", "word-count": "Tight by design, clinician-reviewed" }).ok).toBe(true);
		s.stop();
	});

	it("generate now drafts through progress into Needs assets, then candidates arrive (autopost off)", () => {
		const s = boot();
		// Autopost off = the pre-C10 behaviour: a person picks candidates and the post stops at In review.
		expect(s.actions.setAutopost("lumen", false).ok).toBe(true);
		expect(s.actions.generateNow("p-sedation").ok).toBe(true);
		expect(post(s, "p-sedation").state).toBe("drafting");
		vi.advanceTimersByTime(900 * 4);
		expect(post(s, "p-sedation").progress?.label).toMatch(/Writing section \d of 7/);
		vi.advanceTimersByTime(900 * 8);
		expect(post(s, "p-sedation").state).toBe("needs-assets");
		vi.advanceTimersByTime(3000);
		const slots = s.state.data.lumen.slots.filter((x) => x.postId === "p-sedation");
		expect(slots.map((x) => x.status).sort()).toEqual(["candidates", "selected"]);
		const hero = slots.find((x) => x.status === "candidates")!;
		s.actions.pickCandidate(hero.id, hero.candidates[1].id);
		s.actions.useCandidate(hero.id);
		expect(post(s, "p-sedation").state).toBe("in-review");
		s.stop();
	});

	it("refuses runs over the cap with a message and records the refusal", () => {
		const s = boot();
		s.actions.setSite("northwind");
		const r = s.actions.runNow("keyword-swarm");
		expect(r).toMatchObject({ ok: false });
		expect(s.state.data.northwind.runs[0]).toMatchObject({ status: "refused-over-cap", kind: "keyword-swarm" });
		expect(s.actions.approve("np-unfair-dismissal", { disclaimer: "Legal reviewed and approved the copy" })).toMatchObject({ ok: false, reason: "Connect a repo first. The MR needs somewhere to open" });
		s.stop();
	});

	it("template ingestion parses to needs-confirmation and confirms after mapping", () => {
		const s = boot();
		s.actions.setRole("developer");
		const r = s.actions.ingestTemplate("lumen-site-v3.zip", "zip");
		vi.advanceTimersByTime(2500);
		const m = s.state.data.lumen.manifests.find((x) => x.id === (r as { id: string }).id)!;
		expect(m.status).toBe("needs-confirmation");
		expect(s.actions.confirmManifest(m.id).ok).toBe(false);
		for (const x of m.mappings.filter((y) => y.status === "needs-you")) s.actions.mapTemplateItem(m.id, x.id, "content-region", "CTA block");
		expect(s.actions.confirmManifest(m.id).ok).toBe(true);
		expect(s.state.data.lumen.manifests.filter((x) => x.status === "confirmed")).toHaveLength(1);
		s.stop();
	});

	it("undo restores the previous content", () => {
		const s = boot();
		const b = post(s, "p-root-canal").blocks[3];
		s.actions.editBlock("p-root-canal", b.id, "Short.");
		expect(post(s, "p-root-canal").blocks[3].text).toBe("Short.");
		s.actions.undo();
		expect(post(s, "p-root-canal").blocks[3].text).toBe(b.text);
		s.stop();
	});

	it("ideas can't advance without approval; approving briefs them; rejecting takes them out of the plan", () => {
		const s = boot();
		s.actions.setAutopost("lumen", false);
		expect(s.actions.generateNow("p-implants-last")).toMatchObject({ ok: false, reason: "Approve the idea first. Only approved ideas become briefs" });
		s.actions.setRole("stakeholder");
		expect(s.actions.approveIdea("p-implants-last").ok).toBe(false);
		s.actions.setRole("specialist");
		expect(s.actions.approveIdea("p-implants-last").ok).toBe(true);
		expect(post(s, "p-implants-last")).toMatchObject({ state: "briefed", ideaApproval: { status: "approved", by: "Tolu B." } });
		expect(s.state.data.lumen.audit[0]).toMatchObject({ action: "approved idea", target: "how long do dental implants last" });
		expect(s.actions.rejectIdea("p-bad-breath", "").ok).toBe(false);
		expect(s.actions.rejectIdea("p-bad-breath", "Off-brand for a clinic").ok).toBe(true);
		expect(s.state.data.lumen.posts.some((p) => p.id === "p-bad-breath")).toBe(false);
		expect(s.state.data.lumen.rejectedIdeas?.[0]).toMatchObject({ id: "p-bad-breath", ideaApproval: { status: "rejected", note: "Off-brand for a clinic" } });
		// Dragging an idea to Briefed is an approval gesture.
		expect(s.actions.promoteToBrief("p-crown-cost").ok).toBe(true);
		expect(post(s, "p-crown-cost").ideaApproval?.status).toBe("approved");
		s.stop();
	});

	it("autopost: an approved idea drafts, fills its slots, passes the agent gate, opens an MR and merges on green CI", () => {
		const s = boot();
		expect(s.actions.approveIdea("p-implants-last").ok).toBe(true);
		expect(post(s, "p-implants-last").state).toBe("briefed");
		vi.advanceTimersByTime(1200); // the writer picks it up
		expect(post(s, "p-implants-last").state).toBe("drafting");
		vi.advanceTimersByTime(900 * 9);
		expect(post(s, "p-implants-last").state).toBe("needs-assets");
		vi.advanceTimersByTime(2400); // candidates land; the visual-asset agent picks one
		expect(s.state.data.lumen.slots.filter((x) => x.postId === "p-implants-last").every((x) => x.status === "selected")).toBe(true);
		vi.advanceTimersByTime(1600); // auto-gate
		const p = post(s, "p-implants-last");
		expect(p.state).toBe("mr-open");
		const mr = s.state.data.lumen.mergeRequests.find((m) => m.id === p.mrId)!;
		expect(mr).toMatchObject({ autopost: true, ci: "pending", status: "open" });
		expect(p.gate.find((c) => c.id === "internal-links")?.override).toMatchObject({ reason: "Autopost · agent accepted soft block", by: "CMS agent (autopost)" });
		vi.advanceTimersByTime(2500 + 1400); // CI green → auto-merge
		expect(post(s, "p-implants-last").state).toBe("live");
		expect(s.state.data.lumen.mergeRequests.find((m) => m.id === p.mrId)).toMatchObject({ status: "merged", mergedBy: "CMS agent (autopost)" });
		expect(s.state.data.lumen.runs.some((r) => r.kind === "kas-recalc" && r.status === "queued" && r.postId === "p-implants-last")).toBe(true);
		const acts = s.state.data.lumen.audit.filter((a) => a.actor === "CMS agent (autopost)").map((a) => a.action);
		expect(acts).toEqual(expect.arrayContaining(["triggered run", "accepted soft block", "approved", "opened MR", "merged"]));
		s.stop();
	});

	it("autopost: the agent rewrites an open fact marker before shipping and never ships around a template block", () => {
		const s = boot();
		expect(s.actions.shipNow("p-root-canal").ok).toBe(true);
		const p = post(s, "p-root-canal");
		expect(p.state).toBe("mr-open");
		expect(p.facts.every((f) => f.status === "resolved")).toBe(true);
		expect(p.gate.find((c) => c.id === "kw-first-100")!.status).toBe("pass");
		expect(p.versions[p.versions.length - 1]).toMatchObject({ origin: "agent-edit", actor: "CMS agent (autopost)" });
		expect(s.state.data.lumen.audit.some((a) => a.action === "rewrote unsourced claim")).toBe(true);
		// A comparison table the template can't render: held for a person with a ledger item.
		expect(s.actions.shipNow("p-toothpaste")).toMatchObject({ ok: false });
		expect(post(s, "p-toothpaste").state).toBe("in-review");
		expect(s.state.data.lumen.ledger[0]).toMatchObject({ kind: "autopost-hold", postId: "p-toothpaste" });
		expect(s.state.data.lumen.ledger[0].title).toMatch(/^Autopost held: Template can't render the post/);
		s.stop();
	});

	it("autopost off (Northwind): an approved idea stops at In review for a person", () => {
		const s = boot();
		s.actions.setSite("northwind");
		expect(s.actions.approveIdea("np-settlement").ok).toBe(true);
		expect(post(s, "np-settlement").state).toBe("briefed");
		expect(s.actions.generateNow("np-settlement").ok).toBe(true);
		vi.advanceTimersByTime(900 * 9 + 2400 + 1600 + 5000);
		const hero = s.state.data.northwind.slots.find((x) => x.postId === "np-settlement" && x.status === "candidates")!;
		expect(post(s, "np-settlement").state).toBe("needs-assets");
		s.actions.pickCandidate(hero.id, hero.candidates[0].id);
		s.actions.useCandidate(hero.id);
		vi.advanceTimersByTime(10000);
		expect(post(s, "np-settlement").state).toBe("in-review");
		expect(s.state.data.northwind.mergeRequests).toHaveLength(0);
		s.stop();
	});

	it("publishing permissions: specialists toggle autopost; only admins toggle auto-merge", () => {
		const s = boot();
		expect(s.actions.setAutoMerge("lumen", false).ok).toBe(false);
		s.actions.setRole("admin");
		expect(s.actions.setAutoMerge("lumen", false).ok).toBe(true);
		expect(s.state.sites.find((x) => x.id === "lumen")!.publishing).toEqual({ autopost: true, autoMergeOnGreenCi: false });
		s.actions.setRole("developer");
		expect(s.actions.setAutopost("lumen", false).ok).toBe(false);
		s.stop();
	});

	it("setSlotCandidates records provenance; ingestTemplate stores a real parse", () => {
		const s = boot();
		s.actions.setAutopost("lumen", false);
		const slot = s.state.data.lumen.slots.find((x) => x.status === "human-only")!;
		const cand = { id: "", label: "Sourced photo", hue: 0, selected: false, url: "https://images.example/x.webp", source: { kind: "sourced" as const, provider: "unsplash", license: "Unsplash License", attribution: "Photo by A. B.", sourceUrl: "https://unsplash.com/x" } };
		expect(s.actions.setSlotCandidates(slot.id, [cand], { provider: "open-source", model: "web-search" }).ok).toBe(true);
		const after = s.state.data.lumen.slots.find((x) => x.id === slot.id)!;
		expect(after).toMatchObject({ status: "candidates", provider: "open-source", model: "web-search" });
		expect(after.candidates[0].source).toMatchObject({ kind: "sourced", license: "Unsplash License" });
		s.actions.setRole("developer");
		const m = s.actions.ingestTemplate("post.html", "html", { mappings: [{ id: "x1", selector: "article", role: "content-region", status: "mapped", detail: "Main body" }], sampleHtml: "<article><h1>Hi</h1></article>" });
		expect(m.ok).toBe(true);
		expect(s.state.data.lumen.manifests.find((x) => x.id === (m as { id: string }).id)).toMatchObject({ status: "needs-confirmation", sampleHtml: "<article><h1>Hi</h1></article>" });
		s.stop();
	});
});
