// Crons (api-map §12). The schedule tick is the only one so far; presence/lock sweeps join with those features.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("schedules tick", { minutes: 5 }, internal.schedules.tick, {});
// Search Console lags 2–3 days; one nightly pass imports every connected site (no-op when none are connected).
crons.daily("search console import", { hourUTC: 2, minuteUTC: 15 }, internal.gsc.importAll, {});

crons.daily("retention", { hourUTC: 3, minuteUTC: 30 }, internal.ops.retention, {});
// Site discovery: crawled page text expires after 90 days (SD7); extracts and outlines stay.
crons.daily("discovery text expiry", { hourUTC: 3, minuteUTC: 45 }, internal.discovery.data.purgeExpiredText, {});

export default crons;
