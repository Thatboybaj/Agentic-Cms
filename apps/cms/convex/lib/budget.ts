// Bridges the site row to logic.ts budget helpers (checkCap, estimateRun), which take the prototype's ISite shape.
import type { ISite } from "../../src/lib/types";
import type { Doc } from "../_generated/dataModel";

export function capSite(site: Doc<"sites">): Pick<ISite, "budgets" | "cadenceTarget"> {
	return {
		cadenceTarget: site.cadenceTarget,
		budgets: {
			textUsd: site.spend.textMicroUsd / 1e6,
			textCapUsd: site.budgetCaps.textCapUsd,
			imageUsd: site.spend.imageMicroUsd / 1e6,
			imageCapUsd: site.budgetCaps.imageCapUsd,
		},
	};
}

export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
