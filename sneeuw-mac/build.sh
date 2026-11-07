#!/bin/bash
# Bouwt Sneeuw.app (universeel: Apple Silicon + Intel) en verpakt hem in Sneeuw.dmg.
# Draai dit op een Mac met Xcode of de Command Line Tools: ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

APP=Sneeuw
OUT=build
APPDIR="$OUT/$APP.app"
SDK="$(xcrun --sdk macosx --show-sdk-path)"

rm -rf "$OUT"
mkdir -p "$APPDIR/Contents/MacOS" "$APPDIR/Contents/Resources"

echo "▶ App compileren"
for ARCH in arm64 x86_64; do
  xcrun swiftc -O -swift-version 5 \
    -target "$ARCH-apple-macos12.0" -sdk "$SDK" \
    Sources/*.swift -o "$OUT/$APP-$ARCH"
done
lipo -create "$OUT/$APP-arm64" "$OUT/$APP-x86_64" -output "$APPDIR/Contents/MacOS/$APP"
cp Info.plist "$APPDIR/Contents/Info.plist"

echo "▶ Icoon maken"
xcrun swiftc -O -sdk "$SDK" Tools/MakeIcon.swift -o "$OUT/makeicon"
"$OUT/makeicon" "$OUT/icon_1024.png"
ICONSET="$OUT/AppIcon.iconset"
mkdir -p "$ICONSET"
for S in 16 32 128 256 512; do
  sips -z $S $S "$OUT/icon_1024.png" --out "$ICONSET/icon_${S}x${S}.png" >/dev/null
  D=$((S * 2))
  sips -z $D $D "$OUT/icon_1024.png" --out "$ICONSET/icon_${S}x${S}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APPDIR/Contents/Resources/AppIcon.icns"

echo "▶ Ondertekenen (ad-hoc)"
codesign --force --deep --sign - "$APPDIR"

echo "▶ DMG maken"
STAGE="$OUT/dmg"
mkdir -p "$STAGE"
cp -R "$APPDIR" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
cp "Eerst lezen.txt" "$STAGE/"
hdiutil create -volname "$APP" -srcfolder "$STAGE" -ov -format UDZO "$OUT/$APP.dmg" >/dev/null

echo "✔ Klaar: $(pwd)/$OUT/$APP.dmg"
