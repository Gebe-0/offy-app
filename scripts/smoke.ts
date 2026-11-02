import { search, resolveStream } from "@offy/core";

const VIDEO_IDS = [
  "dQw4w9WgXcQ",
  "9bZkp7q19f0",
  "kJQP7kiw5Fk",
  "JGwWNGJdvx8",
  "OPf0YbXqDm0",
];

let failures = 0;

console.log("— search —");
try {
  const items = await search("daft punk", "track");
  console.log(`search ok: ${items.length} itens`);
  for (const item of items.slice(0, 3)) {
    console.log("  ", item.type, item.id, "—", item.type === "track" ? item.title : item.type === "artist" ? item.name : item.title);
  }
  if (items.length === 0) failures += 1;
} catch (error) {
  failures += 1;
  console.log("search FAILED:", error instanceof Error ? error.message : error);
}

console.log("— playback —");
for (const videoId of VIDEO_IDS) {
  const started = Date.now();
  try {
    const stream = await resolveStream(videoId);
    const ms = Date.now() - started;
    console.log(
      `  ${videoId} ok  ${stream.codec}/${stream.itag} ${Math.round(stream.bitrate / 1000)}kbps  ${ms}ms  ${stream.url.slice(0, 48)}…`,
    );
  } catch (error) {
    failures += 1;
    console.log(`  ${videoId} FAILED:`, error instanceof Error ? error.message : error);
  }
}

console.log(failures === 0 ? "SMOKE OK" : `SMOKE FAILURES: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
