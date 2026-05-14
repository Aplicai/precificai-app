"""
Regenerate Precificai PWA + Expo icons from the official source PNG.

Source: G:/Meu Drive/01_GESTAO APLICAI/08_APP PRECIFICACAO/Logomarca/LOGO-NOVA/AVATAR/AVATAR-PNG-PRECIFICAI.png

Strategy:
- Crop the source to the logo's tight bounding box (removing the existing
  large white padding).
- Place the tight logo on a white canvas with a controlled safe-margin so
  the icon looks elegant in launcher masks.
- Different safe margins per target:
    * Square icons (apple-touch, favicon, assets/icon, splash): logo at ~72% of canvas
    * PWA maskable (icon-192, icon-512): logo at ~66% of canvas (fits 80% maskable safe zone)
    * Android adaptive foreground: logo at ~55% (fits 66% material safe zone)
"""

import os
from PIL import Image

SRC = r"G:/Meu Drive/01_GESTÃO APLICAÍ/08_APP PRECIFICAÇÃO/Logomarca/LOGO-NOVA/AVATAR/AVATAR-PNG-PRECIFICAI.png"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WHITE = (255, 255, 255, 255)


def load_tight_logo(src_path):
    """Load source PNG and crop to the logo's bounding box on a transparent canvas."""
    img = Image.open(src_path).convert("RGBA")
    # Find non-white / non-transparent pixels
    # If source has white background (not transparent), detect by color distance.
    pixels = img.load()
    w, h = img.size
    # Build alpha mask: pixel is "logo" if not near-white and alpha > 0
    mask = Image.new("L", (w, h), 0)
    mpix = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 8:
                continue
            # treat anything significantly non-white as logo
            if r < 245 or g < 245 or b < 245:
                mpix[x, y] = 255
    bbox = mask.getbbox()
    if not bbox:
        raise RuntimeError("No logo pixels detected in source")
    # Crop the SOURCE (preserving original color, no white background loss)
    cropped = img.crop(bbox)
    return cropped


def fit_into_canvas(logo, canvas_size, logo_ratio, bg=WHITE):
    """Place logo centered on a square canvas. logo_ratio = fraction of canvas the logo spans (longest side)."""
    canvas = Image.new("RGBA", (canvas_size, canvas_size), bg)
    target_long = int(canvas_size * logo_ratio)
    lw, lh = logo.size
    if lw >= lh:
        new_w = target_long
        new_h = int(lh * (target_long / lw))
    else:
        new_h = target_long
        new_w = int(lw * (target_long / lh))
    resized = logo.resize((new_w, new_h), Image.LANCZOS)
    x = (canvas_size - new_w) // 2
    y = (canvas_size - new_h) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def save_png(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  wrote {os.path.relpath(path, ROOT)} ({img.size[0]}x{img.size[1]})")


def save_ico(img, path, sizes=(16, 32, 48, 64)):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # Pillow expects RGBA but small sizes look better if pre-resized
    base = img.convert("RGBA")
    base.save(path, format="ICO", sizes=[(s, s) for s in sizes])
    print(f"  wrote {os.path.relpath(path, ROOT)} (multi-size ICO)")


def main():
    print("Loading source and detecting logo bbox...")
    logo = load_tight_logo(SRC)
    print(f"  source bbox crop: {logo.size}")

    targets = [
        # path,                                                   size,  logo_ratio
        ("public/icon-192.png",                                    192,  0.66),
        ("public/icon-512.png",                                    512,  0.66),
        ("public/apple-touch-icon.png",                            180,  0.72),
        ("assets/icon.png",                                       1024,  0.72),
        ("assets/splash-icon.png",                                1024,  0.55),
        ("assets/favicon.png",                                      48,  0.78),
        ("assets/avatar-precificai.png",                          1024,  0.72),
        # Android adaptive: foreground (smaller — safe zone is 66% center circle)
        ("assets/android-icon-foreground.png",                    1024,  0.55),
        # Android adaptive: background MUST be plain white (was guideline placeholder)
        # we'll just write white square
    ]

    print("\nGenerating PNG icons...")
    for rel, size, ratio in targets:
        out = os.path.join(ROOT, rel)
        canvas = fit_into_canvas(logo, size, ratio, bg=WHITE)
        save_png(canvas, out)

    # Plain white background for android adaptive
    print("\nGenerating android-icon-background (solid white)...")
    bg = Image.new("RGBA", (1024, 1024), WHITE)
    save_png(bg, os.path.join(ROOT, "assets/android-icon-background.png"))

    # Monochrome: dark silhouette on transparent (Android themed icons)
    print("\nGenerating android-icon-monochrome (silhouette)...")
    # Use logo, replace all non-transparent colored pixels with solid dark
    mono_canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    target_long = int(1024 * 0.55)
    lw, lh = logo.size
    if lw >= lh:
        new_w = target_long
        new_h = int(lh * (target_long / lw))
    else:
        new_h = target_long
        new_w = int(lw * (target_long / lh))
    resized = logo.resize((new_w, new_h), Image.LANCZOS)
    # Convert to silhouette: any non-white-ish + opaque pixel -> solid black
    sil = Image.new("RGBA", resized.size, (0, 0, 0, 0))
    rp = resized.load()
    sp = sil.load()
    for y in range(resized.size[1]):
        for x in range(resized.size[0]):
            r, g, b, a = rp[x, y]
            if a > 16 and (r < 240 or g < 240 or b < 240):
                sp[x, y] = (0, 0, 0, 255)
    x = (1024 - new_w) // 2
    y = (1024 - new_h) // 2
    mono_canvas.paste(sil, (x, y), sil)
    save_png(mono_canvas, os.path.join(ROOT, "assets/android-icon-monochrome.png"))

    # favicon.ico (multi-size) from icon-192
    print("\nGenerating favicon.ico (multi-size)...")
    big = fit_into_canvas(logo, 64, 0.78, bg=WHITE)
    save_ico(big, os.path.join(ROOT, "public/favicon.ico"))

    print("\nDone.")


if __name__ == "__main__":
    main()
