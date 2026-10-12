# Art Otto needs (to regenerate)

Drop a file into `frontend/src/assets/otto/` using the **exact name** below and it replaces the placeholder with
no code change. Any of `.webp .png .jpg .svg` works (webp/png win over svg if both exist). Hand-drawn icons go in
`frontend/src/assets/otto/icons/<name>.svg`. Until you add a file, the app falls back to the placeholder in
`assets/otto/placeholders/`.

## One look for everything (give this to the generator every time)

- **Style:** soft gouache / watercolour, warm morning light, gentle grain, no hard black outlines (a 1-2px darker-brown line is fine).
- **Palette:** parchment `#F3EDDB`, leaf `#DCE7CF`, forest `#2E4A38` / `#4C7656`, wood `#8B6240` / `#66452B`, ochre `#C08A2B`, terracotta `#BC6A47`, slate-teal `#5B7F8F`.
- **The otter:** one consistent character in every pose. Warm brown fur, cream muzzle and belly, small dark nose, rounded ears, short thick tail. Calm, kind, slightly sleepy expression. Round wire glasses only on the reading and wizard otters.
- **No text, no logos, no UI** baked into any image.
- Otters and the logo mark: **transparent background**, subject centred with about 8% padding, soft contact shadow under the feet allowed.

## 1. Otters (square, transparent PNG or WebP, 1024 x 1024)

| File | Pose | Where it shows | Wired today |
|---|---|---|---|
| `otter-reading.png` | sitting, holding an open book, glasses | sidebar card (shown at 44 and 124 px) | yes |
| `otter-waving.png` | friendly wave, facing slightly left | calendar page banner (~124 px) | yes |
| `otter-eating.png` | holding a bowl of meatballs, content | Now page banner (~170 px) | yes |
| `otter-wizard.png` | **wizard hat already drawn on** (dusty plum, gold stars), glasses, holding a small glowing book or staff | Goals page, the weekly review "wizard" (~128 px) | yes (the code draws a placeholder hat until your art exists) |
| `otter-thinking.png` | paw on chin, looking up, small thought spark | advanced-planning entry card (52 px), "week is overcommitted" dialog | yes |
| `otter-shuffling.png` | mid-juggle or fanning out a few small calendar cards, playful | the "Re-arranging your week" pill (**shown at only 34 px, so a bold silhouette, head and paws, no fine detail**) | yes |
| `otter-celebrating.png` | arms up, tiny confetti | Stats recap (~150 px) | yes |
| `otter-panicked.png` | wide eyes, paws on cheeks | Recovery page banner | yes |
| `otter-sad.png` | droopy, a small tear | "Discard this event?" dialog (92 px) | yes |
| `otter-sleeping.png` | curled up asleep on a log | reserved: late-start / oversleep flow | not yet |
| `otter-empty.png` | shrugging next to an empty planner | reserved: empty calendar, empty goals | not yet |
| `otter-angry.png` | puffed up, small frown (cute, not scary) | reserved: missed hard deadline | not yet |

## 2. Banners (wide, WebP or PNG, 2880 x 480, 6:1)

Landscape illustrations that sit behind a page header. **The left 45% must stay calm and low-contrast** (dark text is
laid over it; the app also fades it with a parchment gradient). Put the interest on the right: trees, hills, light.
Soft, horizon low, no characters in the art (the otter is placed on top by the app).

| File | Scene | Page |
|---|---|---|
| `banner-calendar.webp` | pine forest at first light, pale mist, sun low on the right | Calendar |
| `banner-goals.webp` | winding trail climbing a forested hill toward a ridge, stepping stones in the foreground | Goals (behind the wizard) |
| `banner-now.webp` | quiet campsite at morning: tent edge, small fire smoke, lake in the distance | Now, Recovery |
| `banner-stats.webp` | still lake at dusk with reeds and a far treeline | Stats |

## 2b. "How did this session go?" reactions (5 images, transparent, 256 x 256)

Shown at 28 px in a row of five, so a bold, simple silhouette with one clear expression each. Until you add them the app
shows a placeholder emoji. Same otter, same style as above, head and shoulders.

| File | Expression | Meaning in the app |
|---|---|---|
| `reflect-nailed.png` | thumbs up, sparkles | finished on plan or better |
| `reflect-harder.png` | sweating, slightly overwhelmed | took longer than planned |
| `reflect-gap.png` | dizzy swirl eyes, a small question mark | "I am missing a skill here" |
| `reflect-interrupted.png` | startled, a tiny lightning bolt or bell | something outside their control got in |
| `reflect-outlier.png` | curled up asleep or very tired | just an off day, do not learn from it |

## 3. Logo mark (transparent, 512 x 512)

| File | What | Where |
|---|---|---|
| `logo-mark.png` | a simple leaf or an otter head in a circle, single-colour friendly, reads at 24 px | wooden "Otto" sign at the top of the sidebar (replaces the leaf icon) |

Also useful, not wired yet: `favicon.svg` and `apple-touch-icon.png` (180 x 180).

## 4. Icons (SVG, hand-drawn hairline style)

Spec: **24 x 24 viewBox, 1.25px stroke, round caps and joins, `stroke="currentColor"`, `fill="none"`**, no fixed
width/height, optically centred, same visual weight across the set. Name each file as below
(`icons/lock.svg`, `icons/cat-llm.svg`, ...). Every one has a built-in fallback, so supply as many as you like.

- **Navigation (4):** `now` (clock or sun), `calendar`, `goals` (target or flag), `stats` (bars)
- **Event kinds (8):** `cat-llm`, `cat-leetcode`, `cat-interview`, `cat-gym`, `cat-social`, `cat-leisure`, `cat-system-design`, `cat-admin`
- **Event actions (10):** `lock`, `unlock`, `link`, `grip`, `close`, `plus`, `check`, `undo`, `select` (reschedule), `trash`
- **Direction (4):** `arrow`, `chev-l`, `chev-r`, `caret`
- **Planner and goals (11):** `pin`, `clock`, `flag` (deadline), `target` (best done by), `steps`, `branch` (sidetrack), `stop` (roadblock), `turn` (pivot), `wand` (wizard), `shuffle` (re-arrange), `sparkle`
- **Misc (2):** `leaf`, `warn`

## 5. Optional later (not used by the code today, so skip unless you want them)

- `texture-paper.png` (512 x 512 seamless) and `texture-wood.png` (seamless): the paper grain and the wooden sign are generated in CSS right now; real textures would replace them.
- `empty-calendar.png`, `empty-goals.png` (1200 x 800): full empty-state scenes, once the empty states exist.
