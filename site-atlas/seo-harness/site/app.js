(() => {
  const atlas = window.AGENT_ATLAS;
  const app = document.getElementById("app");
  const brandName = document.getElementById("brand-name");
  const state = { relationFilter: "all", zoom: null, query: "", type: "all", railOpen: false };

  if (!atlas) {
    app.innerHTML = '<section class="page"><h1>Atlas data is missing</h1><p>Run the site builder again so <code>atlas-data.js</code> is created.</p></section>';
    return;
  }

  brandName.textContent = atlas.project.name;
  document.title = `${atlas.project.name} — Agent System Atlas`;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[m]);
  const label = (value) => String(value || "unknown").replace(/-/g, " ");
  const sentence = (value) => value ? esc(value) : '<span class="empty">Unknown from repository evidence</span>';
  const allItems = [
    ...atlas.entities,
    ...(atlas.features || []).map((f) => ({ ...f, type: "feature", role: "Product outcome", details: f.summary, responsibilities: [], inputs: [], outputs: [], limitations: [], tags: ["feature"] }))
  ];
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const entityIndex = new Map(atlas.entities.map((item, i) => [item.id, i + 1]));
  const itemIndex = new Map(allItems.map((item, i) => [item.id, i + 1]));

  function route() {
    const raw = location.hash.replace(/^#/, "") || "chart";
    const [view, id] = raw.split("/");
    document.querySelectorAll("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === view ? "page" : "false"));
    if (view === "catalogue") renderCatalogue(id || allItems[0]?.id);
    else if (view === "changes") renderChanges();
    else if (view === "method") renderMethod();
    else renderChart();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function stats() {
    const s = atlas.stats || {};
    const cells = [
      ["Agents", s.agents ?? atlas.entities.filter((e) => e.type === "agent").length],
      ["Models", s.models ?? atlas.entities.filter((e) => e.type === "model").length],
      ["Memory stores", s.memories ?? atlas.entities.filter((e) => e.type === "memory").length],
      ["Dependencies", s.dependencies ?? atlas.entities.filter((e) => ["tool", "dependency", "worker", "interface", "guardrail"].includes(e.type)).length],
      ["Features", s.features ?? (atlas.features || []).length],
      ["Relations", s.relations ?? atlas.relations.length],
      ["Files read", s.filesScanned ?? "—"]
    ];
    return `<dl class="stat-grid">${cells.map(([k, v]) => `<div class="stat"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  }

  function chartGeometry() {
    const lanes = [
      { key: "model", title: "Models", sub: "what reasons", x: 20, width: 245 },
      { key: "agent", title: "Agents", sub: "who coordinates", x: 310, width: 270 },
      { key: "memory", title: "Shared memory", sub: "what survives", x: 625, width: 245 },
      { key: "support", title: "Harness", sub: "what makes it work", x: 915, width: 265 }
    ];
    const laneFor = (type) => type === "agent" ? "agent" : type === "model" ? "model" : type === "memory" ? "memory" : "support";
    const groups = new Map(lanes.map((l) => [l.key, atlas.entities.filter((e) => laneFor(e.type) === l.key)]));
    const max = Math.max(1, ...[...groups.values()].map((g) => g.length));
    const height = Math.max(620, 170 + max * 130);
    const positions = new Map();
    lanes.forEach((lane) => {
      const items = groups.get(lane.key);
      items.forEach((item, i) => positions.set(item.id, { x: lane.x, y: 118 + i * 126, width: lane.width, height: 92 }));
    });
    return { lanes, positions, height };
  }

  function relationPath(a, b) {
    const ax = a.x + a.width, ay = a.y + a.height / 2, bx = b.x, by = b.y + b.height / 2;
    if (bx > ax) {
      const mid = (ax + bx) / 2;
      return `M ${ax} ${ay} C ${mid} ${ay}, ${mid} ${by}, ${bx - 8} ${by}`;
    }
    const sx = a.x, tx = b.x + b.width, lift = Math.max(34, Math.abs(ay - by) * .35);
    return `M ${sx} ${ay} C ${sx - lift} ${ay}, ${tx + lift} ${by}, ${tx + 8} ${by}`;
  }

  function chartSvg() {
    const { lanes, positions, height } = chartGeometry();
    const visibleRelations = atlas.relations.filter((r) => state.relationFilter === "all" || r.confidence === state.relationFilter);
    const defs = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path></marker></defs>`;
    const laneMarkup = lanes.map((lane) => `<g><text class="lane-title" x="${lane.x}" y="38">${esc(lane.title.toUpperCase())}</text><text class="lane-sub" x="${lane.x}" y="58">${esc(lane.sub)}</text><line class="lane-line" x1="${lane.x}" y1="76" x2="${lane.x + lane.width}" y2="76"></line><line class="lane-line" x1="${lane.x}" y1="76" x2="${lane.x}" y2="${height - 28}"></line></g>`).join("");
    const relations = visibleRelations.map((r) => {
      const a = positions.get(r.from), b = positions.get(r.to);
      if (!a || !b) return "";
      return `<path class="relation ${esc(r.confidence || "tentative")}" d="${relationPath(a, b)}" marker-end="url(#arrow)"><title>${esc(`${byId.get(r.from)?.name || r.from} ${r.label || label(r.type)} ${byId.get(r.to)?.name || r.to}`)}</title></path>`;
    }).join("");
    const nodes = atlas.entities.map((entity) => {
      const p = positions.get(entity.id);
      if (!p) return "";
      const idx = String(entityIndex.get(entity.id)).padStart(2, "0");
      const sum = entity.summary.length > 52 ? entity.summary.slice(0, 49) + "…" : entity.summary;
      return `<g class="node ${esc(entity.type)}" tabindex="0" role="button" aria-label="Open ${esc(entity.name)} in catalogue" data-open="${esc(entity.id)}" transform="translate(${p.x} ${p.y})"><rect width="${p.width}" height="${p.height}"></rect><text class="node-index" x="14" y="20">${idx}</text><text class="node-kicker" x="48" y="20">${esc(entity.type.toUpperCase())} · ${esc((entity.confidence || "unknown").toUpperCase())}</text><text class="node-name" x="14" y="48">${esc(entity.name.length > 28 ? entity.name.slice(0, 26) + "…" : entity.name)}</text><text class="node-summary" x="14" y="70">${esc(sum)}</text></g>`;
    }).join("");
    return `<svg class="system-chart" style="width:${effectiveZoom() * 1180}px" viewBox="0 0 1200 ${height}" role="img" aria-label="Agent system architecture chart">${defs}${laneMarkup}<g>${relations}</g><g>${nodes}</g></svg>`;
  }

  function effectiveZoom() {
    if (state.zoom != null) return state.zoom;
    return window.matchMedia("(max-width: 760px)").matches ? .29 : 1;
  }

  function renderChart() {
    app.className = "";
    app.innerHTML = `<section class="page">
      <div class="hero"><p class="eyebrow">${esc(atlas.project.architecture)} · revision ${esc(atlas.project.revision)}</p><div class="hero-grid"><div><h1>${esc(atlas.project.name)}</h1><p class="lede">${esc(atlas.project.summary)}</p></div><aside class="hero-note"><strong>How to read this</strong>Follow the lines from models to agents, across shared memory, and into the deterministic harness. Select any block for its plain-language catalogue entry and source evidence.</aside></div></div>
      ${stats()}
      <section class="chart-shell" aria-labelledby="chart-title"><div class="chart-toolbar"><div class="chart-toolbar-group"><span class="section-label" id="chart-title">Relations</span>${["all", "confirmed", "supported", "tentative"].map((f) => `<button class="chip" data-relation="${f}" aria-pressed="${state.relationFilter === f}">${f}</button>`).join("")}</div><div class="chart-toolbar-group mobile-chart-presets" aria-label="Chart scale"><button class="chip" data-zoom="fit" aria-pressed="${effectiveZoom() < .4}">Fit</button><button class="chip" data-zoom="read" aria-pressed="${effectiveZoom() >= .4 && effectiveZoom() < .8}">Read</button><button class="chip" data-zoom="detail" aria-pressed="${effectiveZoom() >= .8}">Detail</button></div><div class="chart-toolbar-group desktop-zoom"><button class="chip" data-zoom="out" aria-label="Zoom out">−</button><button class="chip" data-zoom="reset">${Math.round(effectiveZoom() * 100)}%</button><button class="chip" data-zoom="in" aria-label="Zoom in">+</button></div></div><div class="chart-scroll">${chartSvg()}</div><div class="chart-caption"><p>The chart is generated from the same manifest as the catalogue. Solid bright relations are directly confirmed; blue relations have converging support; dashed amber relations still need runtime or owner confirmation.</p><div class="legend"><span class="lg-confirmed">Confirmed</span><span class="lg-supported">Supported</span><span class="lg-tentative">Tentative</span></div></div></section>
      <section class="feature-strip"><p class="eyebrow">What the system delivers</p><h2>Product outcomes, traced to implementation</h2><div class="feature-grid">${(atlas.features || []).slice(0, 4).map((feature, i) => `<button class="feature-card" data-open="${esc(feature.id)}"><span class="num">${String(i + 1).padStart(2, "0")}</span><h3>${esc(feature.name)}</h3><p>${esc(feature.summary)}</p></button>`).join("")}</div></section>
    </section>`;
    bindCommon();
    app.querySelectorAll("[data-relation]").forEach((button) => button.addEventListener("click", () => { state.relationFilter = button.dataset.relation; renderChart(); }));
    app.querySelectorAll("[data-zoom]").forEach((button) => button.addEventListener("click", () => {
      const current = effectiveZoom();
      state.zoom = button.dataset.zoom === "in" ? Math.min(1.7, current + .15)
        : button.dataset.zoom === "out" ? Math.max(.29, current - .15)
        : button.dataset.zoom === "fit" ? .29
        : button.dataset.zoom === "read" ? .58
        : button.dataset.zoom === "detail" ? 1
        : null;
      renderChart();
    }));
  }

  function groupItems(items) {
    const order = ["agent", "model", "memory", "worker", "tool", "dependency", "guardrail", "interface", "feature"];
    return order.map((type) => [type, items.filter((item) => item.type === type)]).filter(([, list]) => list.length);
  }

  function evidenceMarkup(items) {
    if (!items?.length) return '<p class="empty">No direct source evidence attached. Treat this entry as tentative until reviewed.</p>';
    return `<div class="evidence-list">${items.map((e) => `<div class="evidence-item"><span class="evidence-path">${esc(e.path)}${e.line ? `:${esc(e.line)}` : ""} · ${esc(e.kind || "evidence")}</span>${e.excerpt ? `<p>${esc(e.excerpt)}</p>` : ""}</div>`).join("")}</div>`;
  }

  function listMarkup(items) {
    return items?.length ? `<ul class="plain-list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : '<p class="empty">Not documented</p>';
  }

  function relationMarkup(item) {
    let connected;
    if (item.type === "feature") {
      connected = [
        ...(item.deliveredBy || []).map((id) => ({ id, rel: "delivered by" })),
        ...(item.dependsOn || []).map((id) => ({ id, rel: "depends on" }))
      ];
    } else {
      connected = atlas.relations.filter((r) => r.from === item.id || r.to === item.id).map((r) => ({ id: r.from === item.id ? r.to : r.from, rel: r.from === item.id ? (r.label || label(r.type)) : `receives: ${r.label || label(r.type)}`, confidence: r.confidence }));
    }
    if (!connected.length) return '<p class="empty">No relationships documented</p>';
    return `<div class="relation-list">${connected.map((c) => `<button class="relation-link" data-open="${esc(c.id)}"><small>${esc(c.rel)}${c.confidence ? ` · ${esc(c.confidence)}` : ""}</small><span>${esc(byId.get(c.id)?.name || c.id)}</span></button>`).join("")}</div>`;
  }

  function detailMarkup(item) {
    const i = String(itemIndex.get(item.id) || 0).padStart(2, "0");
    const facts = item.type === "model" ? [["Provider", item.provider], ["Selection", item.selectionRule], ["Fallback", item.fallback], ["Confidence", item.confidence]]
      : item.type === "memory" ? [["Scope", item.scope], ["Retention", item.retention], ["Correction", item.correctionPath], ["Confidence", item.confidence]]
      : [["Type", label(item.type)], ["Role", item.role], ["Confidence", item.confidence], ["Evidence", `${item.evidence?.length || 0} source${item.evidence?.length === 1 ? "" : "s"}`]];
    return `<article class="detail-inner"><header class="detail-title-row"><div class="detail-number">${i}</div><div><h1>${esc(item.name)}</h1><div class="entity-type">${esc(label(item.type))}<span class="confidence ${esc(item.confidence || "tentative")}">${esc(item.confidence || "tentative")}</span></div></div></header><p class="detail-summary">${esc(item.summary)}</p><dl class="detail-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${sentence(v)}</dd></div>`).join("")}</dl>
      <section class="detail-section"><h2>In plain language</h2><p>${sentence(item.details || item.summary)}</p></section>
      ${item.responsibilities?.length ? `<section class="detail-section"><h2>Responsibilities</h2>${listMarkup(item.responsibilities)}</section>` : ""}
      ${(item.inputs?.length || item.outputs?.length) ? `<section class="detail-section"><h2>Inputs and outputs</h2><div class="report-grid"><div><p class="meta-label">Inputs</p>${listMarkup(item.inputs)}</div><div><p class="meta-label">Outputs</p>${listMarkup(item.outputs)}</div></div></section>` : ""}
      <section class="detail-section"><h2>Connections</h2>${relationMarkup(item)}</section>
      ${item.limitations?.length ? `<section class="detail-section"><h2>Known limits</h2>${listMarkup(item.limitations)}</section>` : ""}
      <section class="detail-section"><h2>Repository evidence</h2>${evidenceMarkup(item.evidence)}</section></article>`;
  }

  function filteredItems() {
    const q = state.query.trim().toLowerCase();
    return allItems.filter((item) => (state.type === "all" || item.type === state.type) && (!q || [item.name, item.summary, item.role, ...(item.tags || [])].join(" ").toLowerCase().includes(q)));
  }

  function renderCatalogue(selectedId) {
    const selected = byId.get(selectedId) || filteredItems()[0] || allItems[0];
    const filtered = filteredItems();
    const types = ["all", ...new Set(allItems.map((item) => item.type))];
    app.className = "catalogue-page";
    app.innerHTML = `<button class="rail-toggle" aria-expanded="${state.railOpen}" data-rail-toggle>${state.railOpen ? "Close" : "Open"} catalogue index</button><div class="catalogue-shell ${state.railOpen ? "rail-open" : ""}"><aside class="catalogue-rail" aria-label="Catalogue index"><div class="rail-head"><h1>System Catalogue</h1><input class="search" type="search" value="${esc(state.query)}" placeholder="Search roles, tools, outcomes…" aria-label="Search catalogue"><div class="type-filters">${types.map((type) => `<button class="chip" data-type="${esc(type)}" aria-pressed="${state.type === type}">${esc(type)}</button>`).join("")}</div></div>${groupItems(filtered).map(([type, items]) => `<section class="index-group"><h2>${esc(label(type))} · ${items.length}</h2><ul class="index-list">${items.map((item) => `<li><button class="index-button" data-open="${esc(item.id)}" aria-current="${item.id === selected.id}"><span class="idx-num">${String(itemIndex.get(item.id)).padStart(2, "0")}</span><span class="idx-name">${esc(item.name)}</span></button></li>`).join("")}</ul></section>`).join("") || '<p class="rail-head empty">No catalogue entries match.</p>'}</aside><section class="catalogue-detail">${detailMarkup(selected)}</section></div>`;
    bindCommon();
    app.querySelector(".search")?.addEventListener("input", (event) => {
      const nextQuery = event.target.value;
      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => {
        state.query = nextQuery;
        renderCatalogue(selected.id);
        const field = app.querySelector(".search");
        field?.focus();
        field?.setSelectionRange(state.query.length, state.query.length);
      }, 140);
    });
    app.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => { state.type = button.dataset.type; renderCatalogue(filteredItems()[0]?.id); }));
    app.querySelector("[data-rail-toggle]")?.addEventListener("click", () => { state.railOpen = !state.railOpen; renderCatalogue(selected.id); });
  }

  function renderChanges() {
    const history = [...(atlas.history || [])].reverse();
    app.className = "";
    app.innerHTML = `<section class="page report-page"><p class="eyebrow">Revision ${esc(atlas.project.revision)} · ${esc(atlas.project.branch || "unknown branch")}</p><h1>What changed, and what still needs confirmation</h1><p class="lede">Generated ${esc(new Date(atlas.project.generatedAt).toLocaleString())}. Refreshing against a previous atlas turns repository changes into an architecture-level record.</p>${stats()}<div class="report-grid"><section class="report-card"><h2>Change history</h2>${history.length ? `<ol class="history-list">${history.map((entry) => `<li><strong>${esc(entry.fromRevision)} → ${esc(entry.toRevision)}</strong><br><small>${esc(new Date(entry.generatedAt).toLocaleString())}</small><div class="change-pills">${entry.changes?.length ? entry.changes.map((c) => `<span class="change-pill">${esc(c.action)} ${esc(c.kind)} · ${esc(c.name)}</span>`).join("") : '<span class="change-pill">No architecture changes</span>'}</div></li>`).join("")}</ol>` : '<p class="empty">This is the first recorded atlas. Pass it back as <code>--previous</code> on the next refresh.</p>'}</section><section class="report-card"><h2>Open warnings</h2>${atlas.warnings?.length ? `<ul class="warning-list">${atlas.warnings.map((warning) => `<li>${esc(warning)}</li>`).join("")}</ul>` : '<p>No open scanner warnings.</p>'}</section></div></section>`;
  }

  function renderMethod() {
    app.className = "";
    app.innerHTML = `<section class="page report-page"><p class="eyebrow">Method · evidence before confidence</p><h1>How this atlas stays honest</h1><p class="lede">The scanner finds signals. The documentation agent reviews them. The manifest records the claim and its evidence. The website renders only that manifest.</p><ol class="method-steps"><li><div><h2>Collect repository signals</h2><p>Code, configuration, prompts, package manifests, memory adapters, and Git metadata form the baseline. Generated files and dependency directories are skipped.</p></div></li><li><div><h2>Separate agents from the harness</h2><p>An LLM agent can decide and delegate. A worker follows deterministic code. A tool reaches outside the agent. A guardrail constrains or validates. Those are documented as different things.</p></div></li><li><div><h2>Account for models and memory</h2><p>Exact model IDs, selection rules, fallbacks, readers, writers, scope, retention, and correction paths are recorded when proven. Otherwise the atlas says unknown.</p></div></li><li><div><h2>Trace outcomes to dependencies</h2><p>Features name the user-facing outcome, the agent or worker that delivers it, and the memory, tools, or guardrails it depends on.</p></div></li><li><div><h2>Refresh from the same source</h2><p>The Chart and Catalogue are generated from one JSON contract, preventing visual and written documentation from silently diverging.</p></div></li></ol><div class="report-grid"><section class="report-card"><h2>Confidence</h2><p><span class="confidence confirmed">Confirmed</span> Direct code or configuration evidence.</p><p><span class="confidence supported">Supported</span> Multiple signals agree, but runtime behavior is not directly proven.</p><p><span class="confidence tentative">Tentative</span> Useful interpretation that needs an owner or runtime check.</p></section><section class="report-card"><h2>Refresh command</h2><pre class="code-block">${esc(atlas.project.refreshCommand || "Regenerate with the agent-system-atlas skill")}</pre><p>The generated site is static and can be served by GitHub Pages, any object store, or an ordinary web server.</p></section></div></section>`;
  }

  function bindCommon() {
    app.querySelectorAll("[data-open]").forEach((element) => {
      const open = () => { state.railOpen = false; location.hash = `catalogue/${element.dataset.open}`; };
      element.addEventListener("click", open);
      element.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
  }

  window.addEventListener("hashchange", route);
  route();
})();
