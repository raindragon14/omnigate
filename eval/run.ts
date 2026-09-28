import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

import type { EvalItem, EvalSuite, JudgeFn, RouterFn } from "./types";
import { runSuite, summarizeResults } from "./harness";
import { judgeQa } from "./judges/qa-judge";
import {
  createFixedRouter,
  createOmnigateLiveRouter,
  createOracleRouter,
  createRandomRouter,
} from "./routers";

const DEFAULT_SEED = 42;
const DEFAULT_MODEL = "omnigate/auto-fast";
const DEFAULT_LIVE_URL = "http://localhost:8787";
const RESULTS_DIR = "results";

const suiteItemSchema = z.object({
  id: z.string().min(1),
  split: z.enum(["validation", "test"]),
  question: z.string().min(1),
  answers: z.array(z.string().min(1)).min(1),
});

const suiteFileSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string(),
  items: z.array(suiteItemSchema).min(1),
});

const HELP_TEXT = `Usage: bun run eval --suite <name> --router <oracle|random|fixed|omnigate> [options]

Options:
  --suite <name>    Suite file in eval/suites (default: qa-sample)
  --router <name>   Router under evaluation (required)
  --split <name>    validation, test, or all (default: all)
  --seed <n>        Random-router seed (default: 42)
  --answer <text>   Fixed-router answer (default: "I don't know")
  --live-url <url>  Gateway base URL for the omnigate router (default: http://localhost:8787)
  --api-key <key>   Gateway key (default: OMNIGATE_API_KEY env)
  --model <alias>   Gateway model alias for the omnigate router (default: omnigate/auto-fast)
  --save            Write results JSON to eval/results/
  --help            Show this text`;

/** Loads and validates a suite file. Exits non-zero on invalid suites. */
export function loadSuite(name: string): EvalSuite {
  const raw = JSON.parse(
    readFileSync(join(import.meta.dir, "suites", `${name}.json`), "utf-8"),
  ) as unknown;
  const parsed = suiteFileSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`invalid suite "${name}": ${parsed.error.message}`);
  }

  const items: EvalItem[] = parsed.data.items.map((item) => ({
    ...item,
    category: parsed.data.category,
  }));

  return { ...parsed.data, items };
}

function judgeForCategory(category: string): JudgeFn {
  if (category === "knowledge") {
    return judgeQa;
  }

  throw new Error(`no judge for category "${category}"`);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === undefined || !token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (value === undefined || value.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = value;
      index += 1;
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));

  if (args.help === true) {
    console.log(HELP_TEXT);
    return;
  }

  const suiteName = (args.suite as string | undefined) ?? "qa-sample";
  const routerName = args.router as string | undefined;

  if (routerName === undefined) {
    console.error("missing required --router (see --help)");
    process.exit(1);
  }

  const suite = loadSuite(suiteName);
  const split = (args.split as string | undefined) ?? "all";

  if (split !== "all" && split !== "validation" && split !== "test") {
    console.error('invalid --split (expected "validation", "test", or "all")');
    process.exit(1);
  }

  const items = split === "all" ? suite.items : suite.items.filter((item) => item.split === split);
  const judge = judgeForCategory(suite.category);
  const router = createRouter(routerName, suite, args);
  const results = await runSuite(suite.name, items, routerName, router, judge);
  const summary = summarizeResults(suite.name, routerName, suite.category, results);

  console.log(JSON.stringify(summary, null, 2));

  if (args.save === true) {
    const dir = join(import.meta.dir, RESULTS_DIR);

    mkdirSync(dir, { recursive: true });

    const path = join(dir, `${suite.name}-${routerName}-${Date.now()}.json`);

    writeFileSync(path, `${JSON.stringify({ summary, results }, null, 2)}\n`);
    console.log(`saved ${path}`);
  }
}

function createRouter(
  routerName: string,
  suite: EvalSuite,
  args: Record<string, string | boolean>,
): RouterFn {
  switch (routerName) {
    case "oracle":
      return createOracleRouter();
    case "random": {
      const pool = [...new Set(suite.items.flatMap((item) => item.answers))];
      const seed = Number(args.seed ?? DEFAULT_SEED);

      if (!Number.isInteger(seed)) {
        throw new Error("--seed must be an integer");
      }

      return createRandomRouter(pool, seed);
    }
    case "fixed":
      return createFixedRouter((args.answer as string | undefined) ?? "I don't know");
    case "omnigate": {
      const apiKey = (args["api-key"] as string | undefined) ?? Bun.env.OMNIGATE_API_KEY;

      if (apiKey === undefined || apiKey === "") {
        throw new Error("omnigate router needs --api-key or OMNIGATE_API_KEY");
      }

      return createOmnigateLiveRouter({
        baseUrl: (args["live-url"] as string | undefined) ?? DEFAULT_LIVE_URL,
        apiKey,
        model: (args.model as string | undefined) ?? DEFAULT_MODEL,
      });
    }
    default:
      throw new Error(`unknown router "${routerName}" (see --help)`);
  }
}

await main();
