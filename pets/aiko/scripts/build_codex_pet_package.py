from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PET_ID = "aiko"
DISPLAY_NAME = "Aiko"
DESCRIPTION = "A focused Aiko companion for Codex sessions."

CELL_W = 192
CELL_H = 208
COLS = 8
ROWS = 9
PADDING = 8
ATTACHED_COMPONENT_MARGIN = 10

ROW_SPECS = [
    ("idle", "idle", False, [0, 1, 2, 3, 0, 1, 2, 3], [0, 0, 0, 0, 0, 0, 0, 0]),
    ("running-right", "walking", False, [0, 1, 2, 3, 0, 1, 2, 3], [0, 0, 0, 0, 0, 0, 0, 0]),
    ("running-left", "walking", True, [0, 1, 2, 3, 0, 1, 2, 3], [0, 0, 0, 0, 0, 0, 0, 0]),
    ("thinking", "thinking", False, [0, 1, 2, 3, 0, 1, 2, 3], [0, 0, 1, 0, 0, 0, 1, 0]),
    ("working", "thinking", False, [0, 0, 1, 1, 2, 2, 3, 3], [0, 1, 0, -1, 0, 1, 0, -1]),
    ("success", "happy", False, [0, 1, 2, 3, 0, 1, 2, 3], [0, -4, -8, -4, 0, -4, -8, -4]),
    ("error", "failed", False, [0, 1, 2, 3, 0, 1, 2, 3], [0, 1, 2, 1, 0, 1, 2, 1]),
    ("sleeping", "sleeping", False, [0, 1, 2, 3, 0, 1, 2, 3], [0, 1, 0, 1, 0, 1, 0, 1]),
    ("alert", "idle", False, [0, 1, 0, 1, 2, 3, 2, 3], [0, -2, -4, -2, 0, -2, -4, -2]),
]


def load_source_frames(source_state: str) -> list[Image.Image]:
    paths = sorted((ROOT / "master").glob(f"aiko_{source_state}_[0-9][0-9].png"))
    if not paths:
        raise FileNotFoundError(f"No frames found for source state: {source_state}")
    return [Image.open(path).convert("RGBA") for path in paths]


def expand_frames(
    frames: list[Image.Image],
    frame_indexes: list[int],
    y_offsets: list[int],
    mirror: bool = False,
) -> list[tuple[Image.Image, int]]:
    expanded: list[tuple[Image.Image, int]] = []
    for index, source_index in enumerate(frame_indexes):
        frame = frames[source_index % len(frames)]
        if mirror:
            frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        expanded.append((frame, y_offsets[index]))
    return expanded


def fit_cell(frame: Image.Image, y_offset: int = 0) -> Image.Image:
    sprite = transparent_background(frame)
    sprite = remove_small_detached_components(sprite)
    sprite = trim_transparent(sprite)
    sprite = normalize_transparent_rgb(sprite)

    out = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    ratio = min((CELL_W - PADDING * 2) / sprite.width, (CELL_H - PADDING * 2) / sprite.height)
    scaled_size = (
        max(1, round(sprite.width * ratio)),
        max(1, round(sprite.height * ratio)),
    )
    scaled = sprite.resize(scaled_size, Image.Resampling.LANCZOS)
    x = (CELL_W - scaled.width) // 2
    y = CELL_H - PADDING - scaled.height + y_offset
    out.alpha_composite(scaled, (x, y))
    return normalize_transparent_rgb(out)


def background_color(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    samples = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((rgb.width - 1, 0)),
        rgb.getpixel((0, rgb.height - 1)),
        rgb.getpixel((rgb.width - 1, rgb.height - 1)),
    ]
    return tuple(round(sum(sample[i] for sample in samples) / len(samples)) for i in range(3))


def transparent_background(image: Image.Image, threshold: int = 18) -> Image.Image:
    rgba = image.convert("RGBA")
    bg = background_color(rgba)
    pixels = rgba.load()
    background_points = edge_connected_background(rgba, bg, threshold)

    for x, y in background_points:
        pixels[x, y] = (0, 0, 0, 0)
    return rgba


def edge_connected_background(
    image: Image.Image,
    bg: tuple[int, int, int],
    threshold: int,
) -> set[tuple[int, int]]:
    pixels = image.load()

    def is_background(x: int, y: int) -> bool:
        r, g, b, _a = pixels[x, y]
        return max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) <= threshold

    seeds: list[tuple[int, int]] = []
    for x in range(image.width):
        seeds.append((x, 0))
        seeds.append((x, image.height - 1))
    for y in range(image.height):
        seeds.append((0, y))
        seeds.append((image.width - 1, y))

    visited: set[tuple[int, int]] = set()
    stack = [point for point in seeds if is_background(*point)]
    for point in stack:
        visited.add(point)

    while stack:
        x, y = stack.pop()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= image.width or ny >= image.height:
                continue
            if (nx, ny) in visited or not is_background(nx, ny):
                continue
            visited.add((nx, ny))
            stack.append((nx, ny))
    return visited


def trim_transparent(image: Image.Image) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        return image

    left, top, right, bottom = bbox
    left = max(0, left - PADDING)
    top = max(0, top - PADDING)
    right = min(image.width, right + PADDING)
    bottom = min(image.height, bottom + PADDING)
    return image.crop((left, top, right, bottom))


def normalize_transparent_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (r, g, b, a)
    return rgba


def remove_small_detached_components(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []

    for y in range(rgba.height):
        for x in range(rgba.width):
            if alpha.getpixel((x, y)) == 0 or (x, y) in visited:
                continue

            stack = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= rgba.width or ny >= rgba.height:
                        continue
                    if (nx, ny) in visited or alpha.getpixel((nx, ny)) == 0:
                        continue
                    visited.add((nx, ny))
                    stack.append((nx, ny))
            components.append(component)

    if not components:
        return rgba

    largest_component = max(components, key=len)
    largest_bbox = component_bbox(largest_component)
    attached_area = (
        max(0, largest_bbox[0] - ATTACHED_COMPONENT_MARGIN),
        max(0, largest_bbox[1] - ATTACHED_COMPONENT_MARGIN),
        min(rgba.width, largest_bbox[2] + ATTACHED_COMPONENT_MARGIN),
        min(rgba.height, largest_bbox[3] + ATTACHED_COMPONENT_MARGIN),
    )
    pixels = rgba.load()
    for component in components:
        if component is largest_component or boxes_intersect(component_bbox(component), attached_area):
            continue
        for x, y in component:
            pixels[x, y] = (0, 0, 0, 0)
    return rgba


def component_bbox(component: list[tuple[int, int]]) -> tuple[int, int, int, int]:
    xs = [point[0] for point in component]
    ys = [point[1] for point in component]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def boxes_intersect(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def has_transparent_rgb_residue(image: Image.Image) -> bool:
    pixels = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
    for r, g, b, a in pixels:
        if a == 0 and (r != 0 or g != 0 or b != 0):
            return True
    return False


def write_previews(atlas: Image.Image) -> None:
    previews_dir = ROOT / "qa" / "previews"
    previews_dir.mkdir(parents=True, exist_ok=True)

    durations = {
        "idle": [280, 110, 110, 140, 140, 280, 110, 240],
        "running-right": [120, 120, 120, 120, 120, 120, 120, 220],
        "running-left": [120, 120, 120, 120, 120, 120, 120, 220],
        "thinking": [150, 150, 150, 150, 150, 150, 150, 240],
        "working": [120, 120, 120, 120, 120, 120, 120, 220],
        "success": [140, 140, 140, 140, 140, 140, 140, 240],
        "error": [140, 140, 140, 140, 140, 140, 140, 240],
        "sleeping": [220, 220, 220, 220, 220, 220, 220, 300],
        "alert": [130, 130, 130, 130, 130, 130, 130, 220],
    }

    for row, (target_state, _source_state, _mirror, _frame_indexes, _y_offsets) in enumerate(ROW_SPECS):
        frames = []
        for col in range(COLS):
            cell = atlas.crop((col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H))
            frames.append(cell.resize((CELL_W * 2, CELL_H * 2), Image.Resampling.NEAREST))
        frames[0].save(
            previews_dir / f"{target_state}.gif",
            save_all=True,
            append_images=frames[1:],
            duration=durations[target_state],
            loop=0,
            disposal=2,
        )


def make_contact_sheet(atlas: Image.Image) -> Image.Image:
    label_w = 160
    scale = 1
    sheet = Image.new("RGBA", (label_w + atlas.width * scale, atlas.height * scale), (255, 255, 255, 255))
    draw = ImageDraw.Draw(sheet)

    for row, (target_state, _source_state, _mirror, _frame_indexes, _y_offsets) in enumerate(ROW_SPECS):
        y = row * CELL_H * scale
        draw.text((8, y + 8), target_state, fill=(20, 20, 20, 255))
        draw.text((8, y + 28), f"{COLS} frames", fill=(80, 80, 80, 255))

    sheet.alpha_composite(atlas.resize((atlas.width * scale, atlas.height * scale), Image.Resampling.NEAREST), (label_w, 0))

    grid = ImageDraw.Draw(sheet)
    for row in range(ROWS + 1):
        y = row * CELL_H * scale
        grid.line((label_w, y, sheet.width, y), fill=(200, 200, 200, 255))
    for col in range(COLS + 1):
        x = label_w + col * CELL_W * scale
        grid.line((x, 0, x, sheet.height), fill=(200, 200, 200, 255))
    return sheet


def validate(atlas: Image.Image, webp_path: Path, pet_json: dict[str, str]) -> dict[str, object]:
    errors: list[str] = []
    warnings: list[str] = []

    if atlas.size != (CELL_W * COLS, CELL_H * ROWS):
        errors.append(f"invalid atlas size: {atlas.size}")
    if has_transparent_rgb_residue(atlas):
        errors.append("transparent pixels contain non-zero RGB residue")

    if not webp_path.exists():
        errors.append(f"missing spritesheet: {webp_path}")
    else:
        webp = Image.open(webp_path).convert("RGBA")
        if webp.size != (CELL_W * COLS, CELL_H * ROWS):
            errors.append(f"invalid webp size: {webp.size}")
        if has_transparent_rgb_residue(webp):
            errors.append("webp transparent pixels contain non-zero RGB residue")

    for key in ("id", "displayName", "description", "spritesheetPath"):
        if key not in pet_json:
            errors.append(f"pet.json missing key: {key}")
    if pet_json.get("id") != PET_ID:
        errors.append(f"pet.json id must be {PET_ID}")
    if pet_json.get("spritesheetPath") != "spritesheet.webp":
        errors.append("pet.json spritesheetPath must be spritesheet.webp")

    for row in range(ROWS):
        for col in range(COLS):
            cell = atlas.crop((col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H))
            if cell.getbbox() is None:
                errors.append(f"atlas row {row} col {col} is unexpectedly transparent")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "atlas": {
            "width": atlas.width,
            "height": atlas.height,
            "columns": COLS,
            "rows": ROWS,
            "cell": [CELL_W, CELL_H],
        },
        "row_mapping": [
            {
                "row": row,
                "target_state": target,
                "source_state": source,
                "used_columns": COLS,
                "mirrored": mirror,
                "source_frame_indexes": frame_indexes,
                "y_offsets": y_offsets,
            }
            for row, (target, source, mirror, frame_indexes, y_offsets) in enumerate(ROW_SPECS)
        ],
        "stability_policy": "All rows contain 8 visible frames because Codex App may advance every row across all 8 columns.",
    }


def main() -> None:
    final_dir = ROOT / "final"
    qa_dir = ROOT / "qa"
    final_dir.mkdir(exist_ok=True)
    qa_dir.mkdir(exist_ok=True)

    atlas = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))
    for row, (_target_state, source_state, mirror, frame_indexes, y_offsets) in enumerate(ROW_SPECS):
        source_frames = load_source_frames(source_state)
        frames = expand_frames(source_frames, frame_indexes, y_offsets, mirror)
        if len(frames) != COLS:
            raise RuntimeError(f"row {row} must contain exactly {COLS} frames, got {len(frames)}")
        for col, (frame, y_offset) in enumerate(frames):
            atlas.alpha_composite(fit_cell(frame, y_offset), (col * CELL_W, row * CELL_H))

    spritesheet_png = final_dir / "spritesheet.png"
    spritesheet_webp = final_dir / "spritesheet.webp"
    package_webp = ROOT / "spritesheet.webp"
    atlas = normalize_transparent_rgb(atlas)
    atlas.save(spritesheet_png)
    atlas.save(spritesheet_webp, "WEBP", lossless=True, quality=100, exact=True)
    atlas.save(package_webp, "WEBP", lossless=True, quality=100, exact=True)

    pet_json = {
        "id": PET_ID,
        "displayName": DISPLAY_NAME,
        "description": DESCRIPTION,
        "spritesheetPath": "spritesheet.webp",
    }
    (ROOT / "pet.json").write_text(json.dumps(pet_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    make_contact_sheet(atlas).save(qa_dir / "contact-sheet.png")
    write_previews(atlas)
    validation = validate(atlas, package_webp, pet_json)
    (qa_dir / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not validation["ok"]:
        raise SystemExit("validation failed; see qa/validation.json")

    print(f"wrote {spritesheet_webp}")
    print(f"wrote {package_webp}")
    print(f"wrote {ROOT / 'pet.json'}")
    print(f"wrote {qa_dir / 'contact-sheet.png'}")
    print(f"wrote {qa_dir / 'validation.json'}")


if __name__ == "__main__":
    main()
