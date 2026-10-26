import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { importPackCsv } from "../server/pack-csv.js";

test("public-source downloader writes valid attributed local packs without a network or private data", () => {
  const dir = mkdtempSync(join(tmpdir(), "afterhours-fetch-"));
  try {
    const script = new URL("../scripts/fetch-questions.js", import.meta.url)
      .href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      let calls = 0;
      const encode = (s) => Buffer.from(s).toString('base64');
      globalThis.setTimeout = (fn) => { queueMicrotask(fn); return 0; };
      globalThis.fetch = async (url) => {
        if (url.origin !== 'https://opentdb.com') throw Error('Unexpected source');
        calls++;
        const amount = Number(url.searchParams.get('amount'));
        return { ok: true, json: async () => ({ response_code: 0, results: Array.from({ length: amount }, (_, i) => ({ category: encode('Category ' + calls), difficulty: encode('easy'), question: encode('Synthetic download ' + calls + '-' + i), correct_answer: encode('Correct ' + i), incorrect_answers: ['Wrong A', 'Wrong B', 'Wrong C'].map(encode) })) }) };
      };
      await import(${JSON.stringify(script)});
      if (calls !== 6) throw Error('Expected six category calls');
    `,
      ],
      { cwd: dir, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const pack = JSON.parse(readFileSync(join(dir, "content/opentdb.json")));
    assert.match(pack.attribution, /CC BY-SA 4.0/);
    assert.equal(pack.rounds[0].categories.length, 6);
    assert.equal(pack.final.question.startsWith("Synthetic download"), true);
    assert.deepEqual(
      importPackCsv(readFileSync(join(dir, "content/opentdb.csv"), "utf8")),
      pack,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
