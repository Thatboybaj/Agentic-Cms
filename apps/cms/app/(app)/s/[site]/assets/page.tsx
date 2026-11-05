import { Suspense } from "react";
import { AssetsQueue } from "@/features/assets/queue";

export default function Page() {
	return (
		<Suspense>
			<AssetsQueue />
		</Suspense>
	);
}
