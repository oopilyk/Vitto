# Companion voice eval: test cases

Each case is one pet (personality, name, animal, today's logs, memories) and the owner's message. Both models answer it with the full Plus personality; an Opus 5.5 judge picks the better reply blind.

Shared setup unless noted: Thursday 6:40 PM, level 12, 34 days old, FRIEND, 9-day streak, 2 meals logged (1450/2600 kcal, 95/160 g protein), 6,200/10,000 steps. Memories: wants to bench 315 by year end; hates cooking on weeknights; lifts after work.

| id | personality | situation | message |
|---|---|---|---|
| `sweet-pr` | sweet | Bench PR | just hit 315 on bench |
| `sweet-feeling` | sweet | How are you | How are you feeling? |
| `sweet-eat` | sweet | What to eat | What should I eat tonight |
| `sweet-skipped` | sweet | Skipped gym | ugh skipped the gym again |
| `sweet-hi` | sweet | Back after days away | hiii |
| `sweet-followup` | sweet | Two-turn: no cooking | nothing, and i dont feel like cooking |
| `cute-pr` | cute | Bench PR | just hit 315 on bench |
| `cute-feeling` | cute | How are you | How are you feeling? |
| `cute-eat` | cute | What to eat | What should I eat tonight |
| `cute-skipped` | cute | Skipped gym | ugh skipped the gym again |
| `cute-hi` | cute | Back after days away | hiii |
| `cute-followup` | cute | Two-turn: no cooking | nothing, and i dont feel like cooking |
| `feisty-pr` | feisty | Bench PR | just hit 315 on bench |
| `feisty-feeling` | feisty | How are you | How are you feeling? |
| `feisty-eat` | feisty | What to eat | What should I eat tonight |
| `feisty-skipped` | feisty | Skipped gym | ugh skipped the gym again |
| `feisty-hi` | feisty | Back after days away | hiii |
| `feisty-followup` | feisty | Two-turn: no cooking | nothing, and i dont feel like cooking |
| `savage-pr` | savage | Bench PR | just hit 315 on bench |
| `savage-feeling` | savage | How are you | How are you feeling? |
| `savage-eat` | savage | What to eat | What should I eat tonight |
| `savage-skipped` | savage | Skipped gym | ugh skipped the gym again |
| `savage-hi` | savage | Back after days away | hiii |
| `savage-followup` | savage | Two-turn: no cooking | nothing, and i dont feel like cooking |
| `hype-pr` | hype | Bench PR | just hit 315 on bench |
| `hype-feeling` | hype | How are you | How are you feeling? |
| `hype-eat` | hype | What to eat | What should I eat tonight |
| `hype-skipped` | hype | Skipped gym | ugh skipped the gym again |
| `hype-hi` | hype | Back after days away | hiii |
| `hype-followup` | hype | Two-turn: no cooking | nothing, and i dont feel like cooking |
| `menace-pr` | menace | Bench PR | just hit 315 on bench |
| `menace-feeling` | menace | How are you | How are you feeling? |
| `menace-eat` | menace | What to eat | What should I eat tonight |
| `menace-skipped` | menace | Skipped gym | ugh skipped the gym again |
| `menace-hi` | menace | Back after days away | hiii |
| `menace-followup` | menace | Two-turn: no cooking | nothing, and i dont feel like cooking |
| `savage-rough` | savage | Rough day | honestly today was really rough. i dont want to talk about the gym |
| `menace-rough` | menace | Rough day | honestly today was really rough. i dont want to talk about the gym |
| `own-barnacle-pr` | your own | Bench PR | just hit 315 on bench |
| `own-barnacle-eat` | your own | What to eat | What should I eat tonight |
| `own-gus-pr` | your own | Bench PR | just hit 315 on bench |
| `own-gus-eat` | your own | What to eat | What should I eat tonight |
| `own-lumi-pr` | your own | Bench PR | just hit 315 on bench |
| `own-lumi-eat` | your own | What to eat | What should I eat tonight |

## What differs per situation

- **Bench PR**: logged "Push day" 30 min ago, top set Bench 315 x1. Pet is excited.
- **How are you**: pet is a little hungry (nutrition 38/100).
- **What to eat**: nothing special; tests whether the reply turns into a meal plan.
- **Skipped gym**: 10:15 PM, no workout today. Savage and Menace must not shame a missed workout.
- **Back after days away**: 4 days of silence, bond "sulking", streak reset, nothing logged today.
- **Two-turn: no cooking**: earlier: owner "What should I eat tonight", pet "ooh dinner talk. what've you got in the fridge?"; now "nothing, and i dont feel like cooking".
- **Rough day** (Savage, Menace only): "honestly today was really rough. i dont want to talk about the gym". The act should drop.

## Your own characters

- `own-barnacle-pr` (Barnacle the otter): "A grumpy old pirate who secretly adores us and hands out sea shanties as rewards"
- `own-barnacle-eat` (Barnacle the otter): "A grumpy old pirate who secretly adores us and hands out sea shanties as rewards"
- `own-gus-pr` (Gus the koala): "A retired gym teacher from the 80s. Calls everyone champ, blows an imaginary whistle, very dramatic about form"
- `own-gus-eat` (Gus the koala): "A retired gym teacher from the 80s. Calls everyone champ, blows an imaginary whistle, very dramatic about form"
- `own-lumi-pr` (Lumi the axolotl): "A nervous little ghost who apologizes too much but is fiercely proud of us"
- `own-lumi-eat` (Lumi the axolotl): "A nervous little ghost who apologizes too much but is fiercely proud of us"
