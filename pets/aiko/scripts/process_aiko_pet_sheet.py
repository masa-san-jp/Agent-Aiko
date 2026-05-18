from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


PET_ROOT = Path(__file__).resolve().parents[1]
SOURCE = PET_ROOT / "source" / "aiko_pet_generated_sheet.png"
ANIMATIONS = ["idle", "walking", "sleeping", "happy", "failed", "thinking"]
COLS = 4
ROWS = 6


def content_mask(image: Image.Image, threshold: int = 18) -> list[list[bool]]:
    rgb = image.convert("RGB")
    w, h = rgb.size
    bg = rgb.getpixel((0, 0))
    pixels = rgb.load()
    mask: list[list[bool]] = []
    for y in range(h):
        row: list[bool] = []
        for x in range(w):
            p = pixels[x, y]
            row.append(max(abs(p[i] - bg[i]) for i in range(3)) > threshold)
        mask.append(row)
    return mask


def projection_runs(values: list[int], expected: int, min_width: int = 8) -> list[tuple[int, int]]:
    threshold = max(10, int(max(values) * 0.02))
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, value in enumerate(values):
        if value > threshold and start is None:
            start = i
        if start is not None and (value <= threshold or i == len(values) - 1):
            end = i - 1 if value <= threshold else i
            if end - start + 1 >= min_width:
                runs.append((start, end))
            start = None
    if len(runs) != expected:
        raise RuntimeError(f"Expected {expected} content runs, found {len(runs)}: {runs}")
    return runs


def detect_grid(image: Image.Image) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    mask = content_mask(image)
    h = len(mask)
    w = len(mask[0])
    x_counts = [sum(mask[y][x] for y in range(h)) for x in range(w)]
    y_counts = [sum(mask[y][x] for x in range(w)) for y in range(h)]
    return projection_runs(x_counts, COLS), projection_runs(y_counts, ROWS)


def padded_box(
    x_run: tuple[int, int],
    y_run: tuple[int, int],
    image_size: tuple[int, int],
    pad: int = 8,
) -> tuple[int, int, int, int]:
    width, height = image_size
    left = max(0, x_run[0] - pad)
    top = max(0, y_run[0] - pad)
    right = min(width, x_run[1] + pad + 1)
    bottom = min(height, y_run[1] + pad + 1)
    return left, top, right, bottom


def trim_border(cell: Image.Image) -> Image.Image:
    """Remove only outer blank margin; leave the original art background intact."""
    rgb = cell.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    bg = px[0, 0]

    def is_bg(p: tuple[int, int, int]) -> bool:
        return all(abs(p[i] - bg[i]) <= 10 for i in range(3))

    left, top, right, bottom = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if not is_bg(px[x, y]):
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)

    if right <= left or bottom <= top:
        return cell

    pad = 8
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(w, right + pad)
    bottom = min(h, bottom + pad)
    return cell.crop((left, top, right + 1, bottom + 1))


def transparent_background(sprite: Image.Image, threshold: int = 14) -> Image.Image:
    rgba = sprite.convert("RGBA")
    px = rgba.load()
    bg = rgba.convert("RGB").getpixel((0, 0))
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) <= threshold:
                px[x, y] = (r, g, b, 0)
    return rgba


def fit_square(sprite: Image.Image, size: int, resample: Image.Resampling) -> Image.Image:
    sprite = transparent_background(trim_border(sprite))
    ratio = min((size - 4) / sprite.width, (size - 4) / sprite.height)
    scaled = sprite.resize((max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))), resample)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(scaled, ((size - scaled.width) // 2, size - scaled.height - 2))
    return out


def save_sheet(frames: list[Image.Image], path: Path) -> None:
    sheet = Image.new("RGBA", (frames[0].width * len(frames), frames[0].height), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (i * frame.width, 0))
    sheet.save(path)


def main() -> None:
    src = Image.open(SOURCE).convert("RGBA")
    x_runs, y_runs = detect_grid(src)

    dirs = {
        "master": PET_ROOT / "master",
        "png64": PET_ROOT / "png64",
        "png32": PET_ROOT / "png32",
        "gif": PET_ROOT / "gif",
    }
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    manifest = {
        "name": "aiko",
        "source_sheet": "source/aiko_pet_generated_sheet.png",
        "source_grid": {
            "columns": COLS,
            "rows": ROWS,
            "x_runs": x_runs,
            "y_runs": y_runs,
            "padding": 8,
        },
        "frame_sizes": {"png64": [64, 64], "png32": [32, 32]},
        "animations": {},
    }

    for row, name in enumerate(ANIMATIONS):
        master_frames: list[Image.Image] = []
        frames64: list[Image.Image] = []
        frames32: list[Image.Image] = []

        for col in range(COLS):
            crop_box = padded_box(x_runs[col], y_runs[row], src.size)
            cell = src.crop(crop_box)
            master_frames.append(cell)
            f64 = fit_square(cell, 64, Image.Resampling.LANCZOS)
            f32 = f64.resize((32, 32), Image.Resampling.NEAREST)
            frames64.append(f64)
            frames32.append(f32)

            cell.save(dirs["master"] / f"aiko_{name}_{col + 1:02d}.png")
            f64.save(dirs["png64"] / f"aiko_{name}_{col + 1:02d}.png")
            f32.save(dirs["png32"] / f"aiko_{name}_{col + 1:02d}.png")

        save_sheet(frames64, dirs["png64"] / f"aiko_{name}_sheet.png")
        save_sheet(frames32, dirs["png32"] / f"aiko_{name}_sheet.png")

        gif_frames = [f.resize((256, 256), Image.Resampling.NEAREST) for f in frames64]
        gif_frames[0].save(
            dirs["gif"] / f"aiko_{name}.gif",
            save_all=True,
            append_images=gif_frames[1:],
            duration=180 if name == "walking" else 420,
            loop=0,
            disposal=2,
        )

        manifest["animations"][name] = {
            "frames": COLS,
            "sheet64": f"png64/aiko_{name}_sheet.png",
            "sheet32": f"png32/aiko_{name}_sheet.png",
            "preview": f"gif/aiko_{name}.gif",
        }

    (PET_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
