import { redirect } from "next/navigation";
import { WORKSPACE_ROUTES } from "@/lib/routes";

export default function Index() {
	redirect(WORKSPACE_ROUTES.sites);
}
