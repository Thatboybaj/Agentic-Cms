import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import workflow from "@convex-dev/workflow/convex.config";

// Components: rate limiter (01), durable workflows (02). Workpools per api-map §10 ("agents", "images", "git", "gsc")
// join when 03/04/06 put real provider calls behind them; R2, Autumn and Polar join in their handoffs.
const app = defineApp();
app.use(rateLimiter);
app.use(workflow);

export default app;
