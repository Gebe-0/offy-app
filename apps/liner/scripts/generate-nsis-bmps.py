from PIL import Image, ImageDraw, ImageFilter
import os

build_dir = r"D:\OFFY\LINERNOVO\new-app\apps\liner\build"
icon_path = os.path.join(build_dir, "icon.png")
icon = Image.open(icon_path).convert("RGBA")

# 1. Sidebar (164 x 314)
sidebar = Image.new("RGB", (164, 314), (12, 13, 18))
draw = ImageDraw.Draw(sidebar)

for y in range(314):
    ratio = y / 314.0
    r = int(12 + ratio * 8)
    g = int(13 + ratio * 9)
    b = int(18 + ratio * 20)
    draw.line([(0, y), (164, y)], fill=(r, g, b))

# Add radial glow in center-top
glow = Image.new("RGBA", (164, 314), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse([32, 50, 132, 150], fill=(138, 92, 246, 70))
glow = glow.filter(ImageFilter.GaussianBlur(25))
sidebar.paste(glow.convert("RGB"), (0, 0), glow)

# Paste resized logo
logo_size = 72
resized_icon = icon.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
x_pos = (164 - logo_size) // 2
y_pos = 70
sidebar.paste(resized_icon, (x_pos, y_pos), resized_icon)

sidebar.save(os.path.join(build_dir, "installerSidebar.bmp"), "BMP")
print("Saved installerSidebar.bmp")

# 2. Header (150 x 57)
header = Image.new("RGB", (150, 57), (12, 13, 18))
draw_h = ImageDraw.Draw(header)
for y in range(57):
    ratio = y / 57.0
    r = int(12 + ratio * 6)
    g = int(13 + ratio * 7)
    b = int(18 + ratio * 14)
    draw_h.line([(0, y), (150, y)], fill=(r, g, b))

logo_h_size = 38
resized_h_icon = icon.resize((logo_h_size, logo_h_size), Image.Resampling.LANCZOS)
x_pos_h = 150 - logo_h_size - 10
y_pos_h = (57 - logo_h_size) // 2
header.paste(resized_h_icon, (x_pos_h, y_pos_h), resized_h_icon)

header.save(os.path.join(build_dir, "installerHeader.bmp"), "BMP")
print("Saved installerHeader.bmp")
