"use client";
// Settings · Search Console on Convex (handoff 07): connect (Google OAuth, read-only), pick the property, see the
// last import, disconnect. Tokens never reach the browser.
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Button, Callout, Card, CardHeader, Chip, DataGap, KeyValue, RoleGate, Select, SourceNote } from "@/ds";
import { PERMISSIONS } from "@/lib/logic";
import { useSite } from "@/lib/store";
import type { TRole } from "@/lib/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function LiveSearchConsoleCard({ role }: { role: TRole }) {
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const st = useQuery(api.gsc.status, siteId ? { siteId } : "skip");
	const begin = useMutation(api.gsc.beginOAuth);
	const list = useAction(api.gsc.listProperties);
	const setProperty = useMutation(api.gsc.setProperty);
	const disconnect = useAction(api.gsc.disconnect);
	const [props, setProps] = useState<{ uri: string; permission: string }[] | null>(null);
	const [pick, setPick] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!siteId || st?.status !== "connected" || st.propertyUri || props) return;
		void list({ siteId }).then((r) => {
			if (!r.ok) return setError(r.reason);
			setProps(r.properties);
			setPick(r.suggested ?? r.properties[0]?.uri ?? "");
		});
	}, [siteId, st?.status, st?.propertyUri, props, list]);

	const connect = async () => {
		if (!siteId) return;
		setError(null);
		const r = await begin({ siteId });
		if (!r.ok) return setError(r.reason);
		if (r.url) window.location.assign(r.url);
	};

	return (
		<Card className="flex flex-col gap-3">
			<CardHeader icon="GoogleLogo" title="Search Console" />
			{st && !st.configured && (
				<Callout tone="block" icon="Warning" title="Google OAuth isn't set up on this deployment yet.">
					An admin adds GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the Convex deployment (redirect URI: the deployment&apos;s /oauth/google/callback).
				</Callout>
			)}
			{error && (
				<Callout tone="block" title="Search Console didn't answer as expected.">
					{error}
				</Callout>
			)}
			{st?.status === "connected" && st.propertyUri ? (
				<>
					<Chip tone="pass" icon="CheckCircle" className="self-start">
						Connected · {st.propertyUri}
					</Chip>
					<KeyValue
						rows={[
							{ k: "Google account", v: st.email ?? "—" },
							{ k: "Data through", v: st.lastImportedDate ?? "First import running" },
							{ k: "Last import", v: st.lastImportAt ? new Date(st.lastImportAt).toLocaleString() : "Not yet" },
						]}
					/>
					<SourceNote icon="Timer">Read-only · positions, impressions, clicks · lags 2–3 days · imported nightly</SourceNote>
					<RoleGate role={role} allow={PERMISSIONS["searchConsole.connect"]} action="disconnect Search Console">
						<Button variant="ghost" size="sm" icon="PlugsConnected" loading={busy} onClick={async () => siteId && (setBusy(true), await disconnect({ siteId }), setBusy(false))}>
							Disconnect
						</Button>
					</RoleGate>
				</>
			) : st?.status === "connected" ? (
				<div className="flex flex-col gap-3">
					<Chip tone="pass" icon="CheckCircle" className="self-start">
						Connected{st.email ? ` · ${st.email}` : ""}
					</Chip>
					{props && props.length === 0 ? (
						<DataGap label="No properties on this Google account" reason="Add and verify the site in Search Console, then reconnect." />
					) : (
						<>
							<Select label="Property" value={pick} options={(props ?? []).map((p) => ({ value: p.uri, label: p.uri, hint: p.permission }))} onChange={setPick} icon="Globe" className="w-full" />
							<Button variant="primary" size="sm" icon="Check" disabled={!pick} onClick={async () => siteId && pick && (await setProperty({ siteId, propertyUri: pick }))}>
								Use this property
							</Button>
						</>
					)}
				</div>
			) : (
				<>
					<DataGap
						label={st?.status === "reconnect_required" ? "Search Console access expired" : st?.status === "missing_scope" ? "Search Console access wasn't granted" : "Search Console not connected"}
						reason="No positions or impressions — nothing here is estimated."
						action={
							<RoleGate role={role} allow={PERMISSIONS["searchConsole.connect"]} action="connect Search Console">
								<Button variant="secondary" size="sm" icon="Plugs" disabled={!st?.configured} onClick={connect}>
									{st?.status === "reconnect_required" ? "Reconnect" : "Connect"}
								</Button>
							</RoleGate>
						}
					/>
				</>
			)}
		</Card>
	);
}
