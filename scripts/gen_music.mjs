#!/usr/bin/env node
// Usage: node scripts/gen_music.mjs [--force]
// Generates 5 instrumental music stems via the ACE-Step 1.5 HTTP API and
// downloads each into public/music/. Re-runs skip existing files unless --force.
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "music");
const BASE_URL = (process.env.ACESTEP_URL ?? "http://127.0.0.1:8001").replace(/\/+$/, "");
const API_KEY = (process.env.ACESTEP_TOKEN ?? process.env.ACESTEP_API_KEY ?? "").trim();
const FORCE = process.argv.includes("--force");
const STRICT = process.argv.includes("--strict");
const POLL_MS = 4000;
const TIMEOUT_MS = 20 * 60 * 1000;

const STEMS = [
  {
    name: "atmosphere", duration: 16, bpm: 100,
    prompt: "Seamless loop, 16 second, 100 BPM, cinematic retro-futuristic atmospheric pad bed, lush analog synth pads, slow evolving ambient drone, deep space mood, no drums, no bass, no lead melody, no vocals, instrumental, loopable, no intro no outro, no fade, loops perfectly",
  },
  {
    name: "bass", duration: 16, bpm: 100,
    prompt: "Seamless loop, 16 second, 100 BPM, deep sub-bass synth groove, punchy sidechained synth bass, driving retro-futuristic rhythm, no drums, no pads, no lead melody, no vocals, instrumental, loopable, no intro no outro, no fade, loops perfectly",
  },
  {
    name: "melody", duration: 16, bpm: 100,
    prompt: "Seamless loop, 16 second, 100 BPM, heroic synthwave lead melody, arpeggiated pluck and warm lead synth, cinematic retro-futuristic, no drums, no bass, no pads, no vocals, instrumental, loopable, no intro no outro, no fade, loops perfectly",
  },
  {
    name: "percussion", duration: 16, bpm: 100,
    prompt: "Seamless loop, 16 second, 100 BPM, cinematic drum loop, punchy kick, tight snare, crisp hi-hats, retro-futuristic percussion, no bass, no pads, no lead melody, no vocals, instrumental, loopable, no intro no outro, no fade, loops perfectly",
  },
  {
    name: "boss", duration: 26, bpm: 100,
    prompt: "Seamless loop, 26 second, 100 BPM, intense boss battle, aggressive distorted synth riff, driving double-time percussion, dark epic cinematic tension, no vocals, instrumental, loopable, no intro no outro, no fade, loops perfectly",
  },
];

async function postJson(route, body) {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["Authorization"] = "Bearer " + API_KEY;
  const res = await fetch(`${BASE_URL}${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json;
}

function extensionFromContentType(ct) {
  if (ct.includes("mpeg")) return "mp3";
  if (ct.includes("wav")) return "wav";
  return "wav";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function initModels() {
  console.log(`[init] loading models at ${BASE_URL} ...`);
  const json = await postJson("/v1/init", {
    model: "acestep-v15-xl-turbo",
    slot: 1,
    init_llm: true,
    lm_model_path: "acestep-5Hz-lm-1.7B",
  });
  if (json.code !== 200) throw new Error(`init failed: ${json.error ?? JSON.stringify(json)}`);
  console.log("[init] ok");
}

async function releaseTask(stem) {
  const json = await postJson("/release_task", {
    prompt: stem.prompt,
    thinking: true,
    lyrics: "",
    audio_duration: stem.duration,
    bpm: stem.bpm,
    ai_token: API_KEY || undefined,
  });
  if (json.code !== 200 || !json.data?.task_id) {
    throw new Error(`release_task failed: ${json.error ?? JSON.stringify(json)}`);
  }
  return json.data.task_id;
}

async function pollTask(taskId) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(POLL_MS);
    const json = await postJson("/query_result", { task_id_list: [taskId] });
    if (json.code !== 200) throw new Error(`query_result failed: ${json.error ?? JSON.stringify(json)}`);
    const entry = (json.data ?? [])[0];
    if (!entry) continue;
    const { status, progress_text } = entry;
    if (status === 0) {
      console.log(`  [poll] queued/running ${progress_text ?? ""}`.trimEnd());
    } else if (status === 1) {
      const parsed = JSON.parse(entry.result);
      const file = parsed[0]?.file;
      if (!file) throw new Error("succeeded but no file in result");
      return file;
    } else if (status === 2) {
      throw new Error(`task failed: ${JSON.stringify(entry)}`);
    }
  }
  throw new Error(`timed out after ${TIMEOUT_MS / 1000}s`);
}

async function downloadAudio(file) {
  // ACE-Step may return either an absolute file path or its already-encoded
  // `/v1/audio?...` download URL, depending on the server version.
  const url = file.startsWith("http://") || file.startsWith("https://")
    ? file
    : file.startsWith("/v1/audio?")
      ? `${BASE_URL}${file}`
      : `${BASE_URL}/v1/audio?path=${encodeURIComponent(file)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ext = extensionFromContentType(ct);
  return { bytes, ext, contentType: ct };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await initModels();

  const results = [];
  for (const stem of STEMS) {
    const existing = ["wav", "mp3"].map((e) => path.join(OUT_DIR, `${stem.name}.${e}`)).find(existsSync);
    if (existing && !FORCE) {
      const size = statSync(existing).size;
      console.log(`[skip] ${stem.name} already exists (${size} bytes)`);
      results.push({ name: stem.name, path: existing, size, skipped: true });
      continue;
    }
    try {
      console.log(`[gen] ${stem.name} (${stem.duration}s @ ${stem.bpm} BPM)`);
      const taskId = await releaseTask(stem);
      console.log(`[gen] ${stem.name} queued task_id=${taskId}`);
      const file = await pollTask(taskId);
      const { bytes, ext: dlExt } = await downloadAudio(file);
      const outPath = path.join(OUT_DIR, `${stem.name}.${dlExt}`);
      writeFileSync(outPath, bytes);
      console.log(`[done] ${stem.name} -> ${outPath} (${bytes.length} bytes)`);
      results.push({ name: stem.name, path: outPath, size: bytes.length, skipped: false });
    } catch (err) {
      console.error(`[fail] ${stem.name}: ${err.message}`);
      if (STRICT) {
        console.error("[strict] aborting on first failure");
        break;
      }
      results.push({ name: stem.name, path: null, size: 0, skipped: false, error: err.message });
    }
  }

  console.log("\n=== Summary ===");
  for (const r of results) {
    if (r.error) console.log(`  FAILED  ${r.name}: ${r.error}`);
    else if (r.skipped) console.log(`  skipped ${r.name}  ${r.size} bytes  ${r.path}`);
    else console.log(`  written ${r.name}  ${r.size} bytes  ${r.path}`);
  }
  const anyFailed = results.some((r) => r.error);
  process.exitCode = anyFailed ? 1 : 0;
}

main().catch((err) => {
  console.error(`[fatal] ${err.message}`);
  process.exitCode = 1;
});
