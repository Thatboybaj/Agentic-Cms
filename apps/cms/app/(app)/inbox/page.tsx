import { Suspense } from "react";
import { Inbox } from "@/features/inbox";

export const metadata = { title: "Inbox · Agentic CMS" };

export default function InboxPage() {
	return (
		<Suspense>
			<Inbox />
		</Suspense>
	);
}
