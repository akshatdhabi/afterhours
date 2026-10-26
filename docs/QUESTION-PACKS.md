# Question packs

There is no playable question dataset in this repository. [question-pack.starter.json](../question-pack.starter.json) is a blank structure, and [question-pack-template.csv](../public/question-pack-template.csv) is a blank spreadsheet scaffold. Fill one in or fetch an independent pack as described in [QUESTION-LIBRARY.md](QUESTION-LIBRARY.md).

## Import and edit

In the room lobby, choose **Edit or import questions**. Import CSV or JSON, or fill in the blank editor. Review categories, questions, four options, answer keys and Final, then save. Closing discards unsaved edits. A malformed import does not replace the draft. Pack export includes all keys and attribution; share it intentionally.

CSV headers:

```csv
category,value,question,option_a,option_b,option_c,option_d,correct,daily_double,final,attribution
```

Use exactly 30 board rows: six categories, with one row at each of 200/400/600/800/1000 per category. Set `correct` to A/B/C/D. Set `daily_double=true` on exactly one board row. Add one Final row with `final=true`, a blank value and `daily_double=false`. Other boolean cells can be false or blank. Attribution is optional; repeated notices are deduplicated. UTF-8 BOMs, CRLF, quoted commas, escaped quotes and quoted newlines are supported. Spreadsheet editors quote these automatically.

## JSON structure

Top-level fields: `title`, `description`, optional `attribution`, `rounds`, `final`.

- `rounds`: one board, with `name` and six `categories`.
- Category: `name`, optional `icon`, five `clues`.
- Clue: unique `id`, `value`, `question`, `answer`, four `choices`, optional `accepted` array and `dailyDouble` boolean.
- Final: `category`, `question`, `answer`, four `choices`, optional `accepted` and `note`.

The exact answer must occur once in four distinct choices. IDs are 1–64 letters, numbers, underscores or hyphens. Values are integers from 100 to 10,000. JSON supports custom values; the simpler CSV format uses the standard five values. Exactly one board clue is a Daily Double. Legacy two-board JSON is validated, then reduced to its first board.

Questions are limited to 1,000 characters, answers to 500, categories to 40, and each choice to 200. The UI file limit is 145 KB; the server caps requests at 150,000 bytes. Keep wording readable on phones and suitable to read aloud. Date time-sensitive claims and retain source/license notices.

The same schema validates client imports and server submissions. It checks structure and keys, not factual accuracy or licensing. Hosts retain adjudication controls for disputes.
