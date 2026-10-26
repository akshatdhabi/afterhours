import { packSchema } from "./schema.js";

export const CSV_HEADERS = [
  "category",
  "value",
  "question",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct",
  "daily_double",
  "final",
  "attribution",
];

// RFC-style quoted fields, escaped quotes, embedded newlines and Excel BOMs.
export function readCsv(text) {
  if (new TextEncoder().encode(text).length > 145000)
    throw new Error("Keep your CSV under 145 KB.");
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, "");
  const cell = () => {
    row.push(field.trim());
    field = "";
    closed = false;
  };
  const line = () => {
    cell();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > 32)
      throw new Error("Use 30 board rows and exactly one Final row.");
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else field += ch;
    } else if (ch === '"') {
      if (field || closed)
        throw new Error("A CSV quote must start an empty field.");
      quoted = true;
    } else if (ch === ",") cell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line();
    } else {
      if (closed && !/\s/.test(ch))
        throw new Error("Unexpected text after a closing CSV quote.");
      if (!closed) field += ch;
    }
  }
  if (quoted) throw new Error("A CSV quoted field was not closed.");
  if (field || row.length || closed) line();
  return rows;
}

export function importPackCsv(text) {
  const [headers, ...records] = readCsv(text);
  if (!headers)
    throw new Error("The CSV is empty. Download the template first.");
  const keys = headers.map((h) => h.toLowerCase());
  if (new Set(keys).size !== keys.length)
    throw new Error("CSV headers must be unique.");
  for (const key of CSV_HEADERS.filter((h) => h !== "attribution"))
    if (!keys.includes(key)) throw new Error(`Missing CSV column: ${key}.`);
  if (keys.some((key) => !CSV_HEADERS.includes(key)))
    throw new Error("Use the columns in the CSV template.");
  if (records.length !== 31)
    throw new Error("Use 30 board rows and exactly one Final row.");
  const boolean = (value, label) => {
    if (["", "false", "0", "no"].includes(value.toLowerCase())) return false;
    if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
    throw new Error(`${label}: use true or false.`);
  };
  const groups = new Map(),
    finals = [],
    attributions = new Set();
  records.forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== keys.length)
      throw new Error(
        `CSV row ${line}: column count does not match the header.`,
      );
    const item = Object.fromEntries(keys.map((key, i) => [key, cells[i]]));
    const choices = [
      item.option_a,
      item.option_b,
      item.option_c,
      item.option_d,
    ];
    const answerIndex = ["A", "B", "C", "D"].indexOf(
      item.correct.toUpperCase(),
    );
    if (answerIndex < 0)
      throw new Error(`CSV row ${line}: correct must be A, B, C or D.`);
    const final = boolean(item.final, `CSV row ${line}, final`);
    const dailyDouble = boolean(
      item.daily_double,
      `CSV row ${line}, daily_double`,
    );
    if (item.attribution) attributions.add(item.attribution);
    const q = {
      question: item.question,
      choices,
      answer: choices[answerIndex],
      accepted: [],
    };
    if (final) {
      if (dailyDouble) throw new Error("Final cannot be a Daily Double.");
      if (item.value)
        throw new Error("Leave the Final value blank; players wager instead.");
      finals.push({ ...q, category: item.category });
    } else {
      if (!/^(200|400|600|800|1000)$/.test(item.value))
        throw new Error(
          `CSV row ${line}: value must be 200, 400, 600, 800 or 1000.`,
        );
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups
        .get(item.category)
        .push({ ...q, value: Number(item.value), dailyDouble });
    }
  });
  if (groups.size !== 6 || finals.length !== 1)
    throw new Error("Use six board categories and exactly one Final row.");
  const categories = [...groups].map(([name, clues], c) => {
    clues.sort((a, b) => a.value - b.value);
    if (clues.length !== 5 || clues.some((q, i) => q.value !== 200 * (i + 1)))
      throw new Error(
        `Category '${name}' needs one question at each value, 200–1000.`,
      );
    return {
      name,
      icon: "✦",
      clues: clues.map((q, i) => ({ ...q, id: `r0c${c}q${i}` })),
    };
  });
  const parsed = packSchema.safeParse({
    title: "Your question pack",
    description: "Imported from CSV",
    attribution: [...attributions].join("\n") || undefined,
    rounds: [{ name: "The main event", categories }],
    final: finals[0],
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" · "),
    );
  return parsed.data;
}

export function writeCsv(rows) {
  return (
    rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n") + "\n"
  );
}
