// Crons (api-map §12). The schedule tick is the only one so far; presence/lock sweeps join with those features.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("schedules tick", { minutes: 5 }, internal.schedules.tick, {});

export default crons;
