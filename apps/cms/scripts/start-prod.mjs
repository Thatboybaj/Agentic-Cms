// Serves the production build from .next-prod (built with NEXT_DIST_DIR=.next-prod) beside `next dev`.
import { spawn } from "node:child_process";

const env = { ...process.env, NEXT_DIST_DIR: ".next-prod" };
spawn("npx", ["next", "start", "-p", "3202"], { env, stdio: "inherit", shell: true }).on("exit", (code) => process.exit(code ?? 0));
