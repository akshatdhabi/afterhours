# Bring your own content

The hosted demo's question collection is private and is not included in this repository. There is no bundled library, answer-key dataset, authoring source, extraction script or endpoint for fetching that collection. The checked-in JSON and CSV templates contain blank fields only. Tests use generated labels with no trivia facts.

## Create a pack

Write your own questions in the [CSV template](../public/question-pack-template.csv), or author a [JSON pack](QUESTION-PACKS.md). A game needs six categories with five board questions each, four choices per question, one Daily Double and one Final. Review questions for accuracy, audience relevance, ambiguity and increasing difficulty before playing.

Import through **Edit or import questions** in the lobby and save. Invalid imports leave the current draft intact. Starting a blank/unvalidated pack is rejected by the server.

## Fetch an independent collection

`npm run questions:fetch` uses [Open Trivia DB's documented public API](https://opentdb.com/api_config.php), not the Afterhours demo. It requests multiple-choice questions from six category IDs, spaces requests above the documented five-second limit, and validates the resulting board. Optional category IDs are supplied as a comma-separated argument.

Outputs go to `content/opentdb.csv` and `content/opentdb.json`, which Git ignores. The fetcher does not run on the game server or during builds. Provider errors leave previous output files untouched until a complete valid pack has been collected. Review downloaded questions before importing; source difficulty is not a reliable five-tier calibration for every audience.

Open Trivia DB's question data is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The downloader retains source/license attribution in both CSV and JSON. Keep it on derivative packs. Another provider or original authorship may have different terms; verify those before reuse or redistribution.

## Keep packs private

Keep original files in the ignored `content/` directory or outside the repository. Do not force-add them, paste answer keys into public issues or include them in screenshots. `.gitignore` also excludes the old `server/data/` collection path to reduce accidental publication.

Imported packs are stored with room state and expire with the room. The host can export its own pack; guests receive only the safe game projection. An export includes answer keys, so share it intentionally. Importing is not end-to-end encryption: the server operator can access its own storage.

Rematches reuse the imported pack with shuffled choice ordering. This public edition does not promise fresh random boards from a large bundled collection. Create/import another pack for new questions.
