/**
 * B3 · Rewrites every golden query into a BM25 keyword query with a local
 * OpenAI-compatible LLM (llama-server + Qwen), caching the result in
 * backend/eval/data/rewrites/<rewriter>.json so `eval:rag --configs
 * hybrid-rewrite` stays offline. Only queries missing or edited since the
 * last run are sent. Temperature 0, thinking disabled.
 *
 *   npm run eval:rewrite-queries -w backend
 *   npm run eval:rewrite-queries -w backend -- --base-url http://127.0.0.1:8081/v1 --rewriter qwen-local
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_REWRITER_ID,
  GOLDEN_PATH,
  rewritePath,
} from "../src/lib/rag-eval/eval-paths";
import { loadGoldenSet } from "../src/lib/rag-eval/golden-io";
import {
  REWRITE_PROMPT,
  emptyRewriteCache,
  needsRewrite,
  parseRewriteCache,
  parseRewriteOutput,
  serializeRewriteCache,
  upsertRewrite,
} from "../src/lib/rag-eval/rewrite-cache";

function arg(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function firstModel(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/models`);
  if (!res.ok) throw new Error(`GET ${baseUrl}/models → ${res.status}`);
  const body = (await res.json()) as { data?: { id: string }[] };
  const id = body.data?.[0]?.id;
  if (!id) throw new Error(`${baseUrl}/models listed no model`);
  return id;
}

async function rewrite(
  baseUrl: string,
  model: string,
  query: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 80,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: "system", content: REWRITE_PROMPT },
        { role: "user", content: query },
      ],
    }),
  });
  if (!res.ok)
    throw new Error(`chat/completions → ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseRewriteOutput(body.choices?.[0]?.message?.content ?? "");
}

async function main() {
  const baseUrl = (
    arg("--base-url") ??
    process.env.ASSISTANT_LLM_BASE_URL ??
    "http://127.0.0.1:8081/v1"
  ).replace(/\/$/, "");
  const file = rewritePath(arg("--rewriter") ?? DEFAULT_REWRITER_ID);
  const golden = loadGoldenSet(GOLDEN_PATH);
  const model = arg("--model") ?? (await firstModel(baseUrl));

  let cache = fs.existsSync(file)
    ? parseRewriteCache(fs.readFileSync(file, "utf8"))
    : emptyRewriteCache(model);
  if (cache.model !== model) {
    throw new Error(
      `${path.basename(file)} holds rewrites from ${cache.model}, not ${model} — use another --rewriter id`,
    );
  }
  const todo = golden.items.filter((i) =>
    needsRewrite(cache, { id: i.id, text: i.query }),
  );
  console.log(
    `${golden.items.length} golden queries, ${todo.length} to rewrite with ${model} @ ${baseUrl}`,
  );

  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const [n, item] of todo.entries()) {
    const out = await rewrite(baseUrl, model, item.query);
    cache = upsertRewrite(cache, { id: item.id, text: item.query }, out);
    fs.writeFileSync(file, serializeRewriteCache(cache)); // resumable
    console.log(
      `  ${n + 1}/${todo.length} ${item.id}: ${item.query}  →  ${out}`,
    );
  }
  console.log(`Done. ${Object.keys(cache.entries).length} rewrites in ${file}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
