import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

// Components join in later handoffs (workflow, workpool, r2, autumn, polar).
const app = defineApp();
app.use(rateLimiter);

export default app;
