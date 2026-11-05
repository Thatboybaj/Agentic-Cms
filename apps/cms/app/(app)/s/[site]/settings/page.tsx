import { Suspense } from "react";
import { SettingsScreen } from "@/features/settings";
import { SettingsSkeleton } from "@/features/settings/states";

export default function SettingsPage() {
	return (
		<Suspense fallback={<SettingsSkeleton />}>
			<SettingsScreen />
		</Suspense>
	);
}
