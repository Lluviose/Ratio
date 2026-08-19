# 从 PWA 图标生成 iOS 应用图标源图（1024x1024、无 alpha、无圆角——圆角由 iOS 系统遮罩）。
# iOS 要求图标 ≥1024x1024 且不含透明通道；pwa-512x512.png 边缘是半透明（alpha≈229），
# 直接放大会被 App Store 拒绝。背景压平为浅色主题底色 #f2f4f7（与 index.css 一致）。
#
# 用法: python resources/make-icon.py
# 产物: resources/icon-only.png（提交进仓库，之后拷贝到
#       ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png）
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "pwa-512x512.png"
OUT = ROOT / "resources" / "icon-only.png"
IOS_ICON = (
    ROOT
    / "ios"
    / "App"
    / "App"
    / "Assets.xcassets"
    / "AppIcon.appiconset"
    / "AppIcon-512@2x.png"
)
BG = (242, 244, 247)  # #f2f4f7

img = Image.open(SRC).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
bg = Image.new("RGBA", (1024, 1024), BG + (255,))
flat = Image.alpha_composite(bg, img).convert("RGB")

OUT.parent.mkdir(parents=True, exist_ok=True)
flat.save(OUT)

if IOS_ICON.exists():
    shutil.copyfile(OUT, IOS_ICON)
    print(f"wrote {OUT} and copied to {IOS_ICON}")
else:
    print(f"wrote {OUT} (ios/ 工程尚未生成，跳过拷贝)")

# 自检：必须无 alpha、尺寸正确
check = Image.open(IOS_ICON if IOS_ICON.exists() else OUT)
assert check.mode == "RGB", f"mode must be RGB, got {check.mode}"
assert check.size == (1024, 1024), f"size must be 1024x1024, got {check.size}"
print(f"verified: {check.size} {check.mode}")
