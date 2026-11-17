// Export the main (hand) sections + key of the bot songs from songs.ts to
// JSON for sheet_sync.py v7.4 QA. Run: bun /home/z/my-project/scripts/export-sheets.ts [slug...]
import { SONGS } from "../src/lib/songs";
import { writeFileSync } from "fs";

const slugs = process.argv.slice(2).length ? process.argv.slice(2)
  : ["bazi", "taghas", "sad-gozashtam", "koo-beheshtemoon"];
for (const slug of slugs) {
  const s = SONGS.find((x) => x.slug === slug);
  if (!s) throw new Error("song not found: " + slug);
  const nSeg = s.sections.reduce(
    (a, sec) => a + sec.lines.reduce((b, l) => b + l.length, 0), 0);
  const withCt = s.sections.reduce(
    (a, sec) => a + sec.lines.reduce(
      (b, l) => b + l.filter((g) => typeof g.ct === "number").length, 0), 0);
  writeFileSync(`/home/z/my-project/work/${slug}-qa-in.json`,
    JSON.stringify({ key: s.key, sections: s.sections }, null, 1));
  console.log(`${slug}: key=${s.key} lines=${s.sections.reduce((a, s2) => a + s2.lines.length, 0)} segments=${nSeg} withCt=${withCt}`);
}
