import { z } from "zod";
const text = (n) => z.string().trim().min(1).max(n);
const clue = z.object({
  id: text(64).regex(/^[a-zA-Z0-9_-]+$/),
  value: z.number().int().min(100).max(10000),
  question: text(1000),
  answer: text(500),
  choices: z.array(text(200)).length(4),
  accepted: z.array(text(200)).max(10).default([]),
  dailyDouble: z.boolean().default(false),
});
export const packSchema = z
  .object({
    title: text(80),
    description: z.string().max(300).default("A custom question pack"),
    attribution: z.string().max(1000).optional(),
    rounds: z
      .array(
        z.object({
          name: text(50),
          categories: z
            .array(
              z.object({
                name: text(40),
                icon: z.string().max(8).default("✦"),
                clues: z.array(clue).length(5),
              }),
            )
            .length(6),
        }),
      )
      .min(1)
      .max(2),
    final: z.object({
      category: text(80),
      question: text(1000),
      answer: text(500),
      choices: z.array(text(200)).length(4),
      accepted: z.array(text(200)).max(10).default([]),
      note: z.string().max(500).optional(),
    }),
  })
  .superRefine((p, ctx) => {
    for (const q of [
      ...p.rounds.flatMap((r) => r.categories.flatMap((c) => c.clues)),
      p.final,
    ]) {
      if (
        new Set(q.choices.map((x) => x.toLowerCase())).size !== 4 ||
        q.choices.filter((x) => x === q.answer).length !== 1
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Every clue needs four distinct choices, including its exact answer once.",
        });
    }
    const ids = p.rounds.flatMap((r) =>
      r.categories.flatMap((c) => c.clues.map((q) => q.id)),
    );
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Clue IDs must be unique across the pack.",
      });
    p.rounds.forEach((r, i) => {
      if (
        r.categories.flatMap((c) => c.clues).filter((c) => c.dailyDouble)
          .length !==
        i + 1
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Use one Daily Double on the board (legacy second boards require two).",
        });
    });
  })
  // Legacy two-board imports remain readable, but all new games use the first board.
  .transform((p) => ({ ...p, rounds: [p.rounds[0]] }));
export const createSchema = z.object({
  name: text(24),
  mode: z.enum(["individual", "teams"]),
  hostPlays: z.boolean().default(false),
  playerCount: z.number().int().min(2).max(6).default(4),
  teamCount: z.number().int().min(2).max(3).default(2),
  penalties: z.boolean().default(true),
  strictPhrasing: z.boolean().default(false),
  answerSeconds: z.number().int().min(5).max(30).default(10),
  buzzSeconds: z.number().int().min(5).max(30).default(15),
  finalSeconds: z.number().int().min(15).max(120).default(45),
  pack: packSchema.optional(),
  packSource: z.enum(["library", "starter", "custom"]).default("starter"),
  bankHistory: z
    .string()
    .max(3000)
    .regex(/^[A-Za-z0-9_.-]*$/)
    .default(""),
});
export const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/),
  name: text(24),
  role: z.enum(["player", "spectator"]).default("player"),
});
export const commandSchema = z.object({
  id: z.string().uuid(),
  type: text(40),
  revision: z.number().int().nonnegative().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
