# Aiko Pet

Runtime-ready custom pet assets generated from the Aiko reference character.

This is an unofficial custom pet package for Codex-compatible local setups. It is not affiliated with or endorsed by OpenAI.

## Implementation Status

Implemented in this repository. The current package follows the design captured in [`20260518-codex-custom-pet-implementation-design.md`](https://github.com/masa-san-jp/logs-with-llm/blob/main/logs/20260518-codex-custom-pet-implementation-design.md): an installable Codex custom pet consists of `pet.json` and `spritesheet.webp` under `~/.codex/pets/<pet-id>/`, with QA artifacts kept alongside the source package.

## Codex App Package

Current Codex custom pet package files are generated here:

- `pet.json`
- `spritesheet.webp`

Install target:

```text
~/.codex/pets/aiko/
├── pet.json
└── spritesheet.webp
```

Build the current package:

```bash
python3 scripts/build_codex_pet_package.py
```

The current builder prioritizes stability over expressive motion:

- It composes `final/spritesheet.webp` from the higher-resolution `master/` frames, not the older 64px atlas.
- It writes the installable `spritesheet.webp` next to `pet.json`, matching `pet.json`'s `spritesheetPath`.
- It removes the off-white source background and normalizes transparent pixels.
- It validates the generated WebP by reading it back from disk.
- It avoids source frames with detached sparkles, thought bubbles, light bulbs, and other floating effects that can become noisy in the Codex pet overlay.
- It fills all 8 columns in every row so App playback never advances into transparent cells.

QA outputs:

- `qa/contact-sheet.png`
- `qa/validation.json`

Local-only QA previews are written to `qa/previews/` and are ignored by git.

The package maps the earlier six Aiko source states into the current 9-row atlas contract:

| Codex row | Source state |
| --- | --- |
| `idle` | `idle` |
| `running-right` | `walking` |
| `running-left` | mirrored `walking` |
| `thinking` | `thinking` |
| `working` | `thinking` |
| `success` | `happy` |
| `error` | `failed` |
| `sleeping` | `sleeping` |
| `alert` | `idle` |

The package is structurally valid, but some rows are semantic approximations until dedicated Aiko pose rows are generated.

## Legacy Runtime Assets

Earlier browser-canvas runtime assets are archived under `archive/legacy-runtime/`.
They are kept locally for reference and recovery, but they are ignored by git and are not part of the current public package.

## Files

- `pet.json`: Codex custom pet metadata.
- `spritesheet.webp`: Codex custom pet spritesheet to install.
- `final/spritesheet.webp`: generated WebP copy kept with the inspection outputs.
- `master/`: source frames used by `scripts/build_codex_pet_package.py`.
- `qa/contact-sheet.png`: generated visual QA sheet.
- `qa/validation.json`: generated validation result.
- `scripts/build_codex_pet_package.py`: current Codex package builder.
- `scripts/process_aiko_pet_sheet.py`: local source-sheet slicer for regenerating `master/`.

Ignored local work areas:

- `source/`: original generated source sheet.
- `archive/legacy-runtime/`: older atlas, browser runtime, preview HTML, and legacy scripts.
- `qa/previews/`: generated preview GIFs.
- `final/spritesheet.png`: generated PNG copy used for inspection.

## Source Animations

- `idle`
- `walking`
- `sleeping`
- `happy`
- `failed`
- `thinking`

Each source animation has 4 frames. The package builder expands them to 8 visible frames per Codex row.

## State Rules

Use `idle` as the default state. Switch animations only when the app state clearly changes, then return to `idle` after short-lived states finish.

- `idle`: normal waiting, ready state, no active task.
- `thinking`: task is running, response is being generated, search or tool work is in progress.
- `happy`: task completed successfully, user approved something, or a positive acknowledgement is useful.
- `failed`: task failed, command returned an error, or the app needs user attention.
- `sleeping`: inactive, hidden, minimized, or long idle state.
- `walking`: lightweight movement or transition state. Current asset is a standing sway, not a literal walk.

Recommended timings:

- `happy`: play for 1-2 loops, then return to `idle`.
- `failed`: hold until the error is dismissed or replaced by `thinking`.
- `thinking`: hold while work is in progress.
- `sleeping`: enter after a long idle timeout.
- `walking`: use only for transitions or ambient motion.

## Rebuild

Build the current Codex custom pet package from the working folder:

```bash
python3 scripts/build_codex_pet_package.py
```

If `master/` needs to be regenerated from the local original source sheet, restore `source/aiko_pet_generated_sheet.png` locally and run:

```bash
python3 scripts/process_aiko_pet_sheet.py
```

The slicer detects sprite positions from the source sheet instead of using equal grid cuts. This keeps frame boundaries stable even when row spacing is uneven.
