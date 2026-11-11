import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/ds/globals.css";
import { BackendProvider } from "@/lib/backend";

export const metadata: Metadata = {
	title: "Agentic CMS",
	description: "Plan, draft, illustrate and render blog posts into your site's own markup — then open a merge request.",
	applicationName: "Agentic CMS",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#EEF0F3" };

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://api.fontshare.com" />
				<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500&display=swap" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500&display=swap" />
			</head>
			{/* suppressHydrationWarning: browser extensions (e.g. Grammarly) add attributes to <body> before React loads. */}
			<body suppressHydrationWarning>
				<BackendProvider>{children}</BackendProvider>
			</body>
		</html>
	);
}
