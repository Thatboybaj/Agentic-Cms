// The one WorkflowManager (handoff 02 step 1). Bounded retries with backoff for action steps (README §13); mutations
// are exactly-once by Convex itself. Workflows are short and chained by events (README §6 "Workflow segmentation"):
// a human pause (review, merge) is a row state, never a sleeping workflow.
import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "../_generated/api";

export const workflow = new WorkflowManager(components.workflow, {
	workpoolOptions: {
		maxParallelism: 4,
		retryActionsByDefault: true,
		defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1_000, base: 2 },
	},
});
