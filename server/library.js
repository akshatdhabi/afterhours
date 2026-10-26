import { randomInt } from "node:crypto";

// This public repository deliberately contains no question collection or answer keys.
export const libraryInfo = {
  count: 0,
  categories: 0,
  topics: [],
  version: "custom-packs",
};
export function drawPack() {
  throw Object.assign(
    new Error(
      "No bundled library. Import your own CSV or JSON pack in the lobby.",
    ),
    { status: 400 },
  );
}
export function shuffleChoices(pack) {
  const result = structuredClone(pack);
  for (const clue of [
    ...result.rounds.flatMap((r) => r.categories.flatMap((c) => c.clues)),
    result.final,
  ]) {
    for (let i = clue.choices.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [clue.choices[i], clue.choices[j]] = [clue.choices[j], clue.choices[i]];
    }
  }
  return result;
}
