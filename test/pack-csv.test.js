import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  CSV_HEADERS,
  importPackCsv,
  readCsv,
  writeCsv,
} from "../server/pack-csv.js";
import { testPack } from "./fixtures.js";
import { createRoom, act, joinRoom, view } from "../server/game.js";

function records() {
  return [
    CSV_HEADERS,
    ...testPack.rounds[0].categories.flatMap((cat) =>
      cat.clues.map((q) => [
        cat.name,
        q.value,
        q.question,
        ...q.choices,
        "A",
        q.dailyDouble,
        false,
        "Synthetic fixture",
      ]),
    ),
    [
      testPack.final.category,
      "",
      testPack.final.question,
      ...testPack.final.choices,
      "A",
      false,
      true,
      "Synthetic fixture",
    ],
  ];
}
test("CSV handles BOM, CRLF, commas, escaped quotes and quoted newlines", () => {
  assert.deepEqual(
    readCsv('\uFEFFname,value\r\n"A, B","A ""quote""\nand newline"\r\n'),
    [
      ["name", "value"],
      ["A, B", 'A "quote"\nand newline'],
    ],
  );
  assert.throws(() => readCsv('"unclosed'), /not closed/);
  assert.throws(() => readCsv('"closed"oops'), /Unexpected text/);
});
test("CSV produces a validated six-category board plus Final with attribution", () => {
  const rows = records();
  rows[1][2] = 'A "quoted", multiline\nsynthetic question';
  const pack = importPackCsv(writeCsv(rows));
  assert.equal(pack.rounds.length, 1);
  assert.equal(pack.rounds[0].categories.length, 6);
  assert.equal(pack.rounds[0].categories[0].clues[0].question, rows[1][2]);
  assert.equal(pack.rounds[0].categories[0].clues[0].answer, rows[1][3]);
  assert.equal(pack.final.answer, testPack.final.answer);
  assert.equal(pack.attribution, "Synthetic fixture");
});
test("CSV rejects incomplete packs, duplicate headers, invalid choices and duplicate values", () => {
  const rows = records();
  assert.throws(
    () => importPackCsv(writeCsv(rows.slice(0, -1))),
    /30 board rows/,
  );
  const duplicate = structuredClone(rows);
  duplicate[0][1] = "category";
  assert.throws(() => importPackCsv(writeCsv(duplicate)), /unique/);
  const badAnswer = structuredClone(rows);
  badAnswer[1][7] = "E";
  assert.throws(() => importPackCsv(writeCsv(badAnswer)), /correct must/);
  const duplicateOption = structuredClone(rows);
  duplicateOption[1][4] = duplicateOption[1][3];
  assert.throws(() => importPackCsv(writeCsv(duplicateOption)), /distinct/);
  const badValue = structuredClone(rows);
  badValue[2][1] = 200;
  assert.throws(() => importPackCsv(writeCsv(badValue)), /each value/);
  const badBoolean = structuredClone(rows);
  badBoolean[1][8] = "perhaps";
  assert.throws(() => importPackCsv(writeCsv(badBoolean)), /true or false/);
  assert.throws(() => readCsv("x".repeat(145001)), /145 KB/);
});
test("CSV requires exactly one board Daily Double and never one in Final", () => {
  const noDouble = records();
  noDouble.forEach((row, i) => {
    if (i) row[8] = false;
  });
  assert.throws(() => importPackCsv(writeCsv(noDouble)), /Daily Double/);
  const finalDouble = records();
  finalDouble.at(-1)[8] = true;
  assert.throws(() => importPackCsv(writeCsv(finalDouble)), /Final cannot/);
});
test("blank public template contains no questions or keys and cannot start a game", () => {
  const template = JSON.parse(
    readFileSync(new URL("../question-pack.starter.json", import.meta.url)),
  );
  for (const q of [
    ...template.rounds[0].categories.flatMap((cat) => cat.clues),
    template.final,
  ]) {
    assert.equal(q.question, "");
    assert.equal(q.answer, "");
    assert.deepEqual(q.choices, ["", "", "", ""]);
  }
  const made = createRoom("ABC234", {
    name: "Host",
    mode: "individual",
    playerCount: 2,
    hostPlays: true,
  });
  joinRoom(made.room, { name: "Guest", role: "player" });
  const host = made.room.sessions[0];
  assert.equal(view(made.room, host).pack.ready, false);
  const command = (type, payload = {}) =>
    act(made.room, host, {
      id: randomUUID(),
      type,
      payload,
      revision: made.room.revision,
    });
  assert.throws(() => command("start"), /own question pack/);
  command("pack", { pack: importPackCsv(writeCsv(records())) });
  assert.equal(view(made.room, host).pack.ready, true);
  command("start");
  assert.equal(made.room.phase, "board");
});
