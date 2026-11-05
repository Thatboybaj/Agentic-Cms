import { ToastProvider } from "@/ds";
import { Styleguide } from "@/features/styleguide";
import { CmsProvider } from "@/lib/store";

export const metadata = { title: "Styleguide · Agentic CMS", robots: { index: false } };

/** DS verification harness (docs/design-system.md §14). Own providers; demo data is not persisted. */
export default async function Page({ searchParams }: { searchParams: Promise<{ frame?: string; wash?: string }> }) {
	const { frame, wash } = await searchParams;
	return (
		<CmsProvider persist={false}>
			<ToastProvider>
				<Styleguide frame={frame} wash={wash} />
			</ToastProvider>
		</CmsProvider>
	);
}
