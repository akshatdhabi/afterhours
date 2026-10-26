import { mkdir, writeFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { CSV_HEADERS, importPackCsv, writeCsv } from "../server/pack-csv.js";

// Fetches an independent public source, never the hosted Afterhours collection.
const categories = (process.argv[2] || "9,17,22,23,11,21")
  .split(",")
  .map(Number);
if (
  categories.length !== 6 ||
  new Set(categories).size !== 6 ||
  categories.some((n) => !Number.isInteger(n) || n < 9 || n > 32)
)
  throw new Error(
    "Provide six distinct Open Trivia DB category IDs, e.g. 9,17,22,23,11,21.",
  );
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (value) => Buffer.from(value, "base64").toString("utf8");
const attribution =
  "Open Trivia DB contributors — https://opentdb.com — CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/ — converted to four-choice CSV; reviewed difficulty required.";
const rows = [CSV_HEADERS];
let final;
for (const [index, category] of categories.entries()) {
  if (index) await wait(5500);
  const url = new URL("https://opentdb.com/api.php");
  url.search = new URLSearchParams({
    amount: String(index ? 5 : 6),
    category: String(category),
    type: "multiple",
    encode: "base64",
  });
  let data;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok)
      throw new Error(
        `Open Trivia DB returned HTTP ${response.status}. Try later or use the CSV template.`,
      );
    data = await response.json();
    if (data.response_code !== 5) break;
    await wait(6000);
  }
  if (data.response_code !== 0 || data.results.length !== (index ? 5 : 6))
    throw new Error(
      `Open Trivia DB response code ${data.response_code}. See https://opentdb.com/api_config.php; your files have not been replaced.`,
    );
  const difficulty = { easy: 0, medium: 1, hard: 2 };
  const questions = data.results.sort(
    (a, b) =>
      difficulty[decode(a.difficulty)] - difficulty[decode(b.difficulty)],
  );
  if (!index) final = questions.pop();
  const rowFor = (q, value, daily, isFinal) => {
    const answer = decode(q.correct_answer);
    const choices = [answer, ...q.incorrect_answers.map(decode)];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return [
      decode(q.category),
      value,
      decode(q.question),
      ...choices,
      "ABCD"[choices.indexOf(answer)],
      daily,
      isFinal,
      attribution,
    ];
  };
  questions.forEach((q, i) =>
    rows.push(rowFor(q, 200 * (i + 1), index === 2 && i === 2, false)),
  );
  if (index === categories.length - 1)
    rows.push(rowFor(final, "", false, true));
  console.log(`Fetched category ${index + 1}/6.`);
}
const csv = writeCsv(rows);
const pack = importPackCsv(csv);
await mkdir("content", { recursive: true });
await writeFile("content/opentdb.csv", csv);
await writeFile("content/opentdb.json", JSON.stringify(pack, null, 2) + "\n");
console.log(
  "Saved content/opentdb.csv and content/opentdb.json. Review facts, language, difficulty and attribution before importing. content/ is ignored by Git.",
);
