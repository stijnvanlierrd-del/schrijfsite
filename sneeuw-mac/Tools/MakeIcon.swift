// Tekent het app-icoon (1024×1024 PNG). Gebruik: makeicon <uitvoer.png>
import CoreGraphics
import Foundation
import ImageIO

let size = 1024
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                    space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!

let rect = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = CGPath(roundedRect: rect, cornerWidth: 185, cornerHeight: 185, transform: nil)

// Schaduw + achtergrond (nachtlucht)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: CGColor(gray: 0, alpha: 0.35))
ctx.addPath(shape)
ctx.setFillColor(CGColor(red: 0.12, green: 0.17, blue: 0.38, alpha: 1))
ctx.fillPath()
ctx.restoreGState()

ctx.saveGState()
ctx.addPath(shape)
ctx.clip()
let sky = CGGradient(colorsSpace: cs, colors: [
    CGColor(red: 0.07, green: 0.10, blue: 0.27, alpha: 1),
    CGColor(red: 0.20, green: 0.29, blue: 0.58, alpha: 1),
] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(sky, start: CGPoint(x: 0, y: 924), end: CGPoint(x: 0, y: 100), options: [])

// Vallende vlokjes
let dots: [(CGFloat, CGFloat, CGFloat)] = [
    (190, 820, 9), (300, 760, 6), (820, 840, 8), (760, 700, 5), (230, 600, 7),
    (860, 560, 9), (180, 430, 5), (420, 870, 6), (640, 880, 5), (880, 420, 6),
]
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.85))
for d in dots { ctx.fillEllipse(in: CGRect(x: d.0 - d.2, y: d.1 - d.2, width: d.2 * 2, height: d.2 * 2)) }

// Sneeuwbank onderaan
let bank = CGMutablePath()
bank.move(to: CGPoint(x: 80, y: 80))
bank.addLine(to: CGPoint(x: 80, y: 300))
bank.addCurve(to: CGPoint(x: 520, y: 260), control1: CGPoint(x: 220, y: 360), control2: CGPoint(x: 380, y: 240))
bank.addCurve(to: CGPoint(x: 944, y: 330), control1: CGPoint(x: 680, y: 280), control2: CGPoint(x: 820, y: 380))
bank.addLine(to: CGPoint(x: 944, y: 80))
bank.closeSubpath()
ctx.addPath(bank)
let snow = CGGradient(colorsSpace: cs, colors: [
    CGColor(red: 1, green: 1, blue: 1, alpha: 1),
    CGColor(red: 0.80, green: 0.87, blue: 0.98, alpha: 1),
] as CFArray, locations: [0, 1])!
ctx.saveGState()
ctx.clip()
ctx.drawLinearGradient(snow, start: CGPoint(x: 0, y: 360), end: CGPoint(x: 0, y: 100), options: [])
ctx.restoreGState()

// Sneeuwbal op de bank
let ball = CGRect(x: 640, y: 270, width: 150, height: 150)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -8), blur: 16, color: CGColor(gray: 0, alpha: 0.3))
ctx.setFillColor(CGColor(red: 0.95, green: 0.97, blue: 1, alpha: 1))
ctx.fillEllipse(in: ball)
ctx.restoreGState()
ctx.saveGState()
ctx.addEllipse(in: ball)
ctx.clip()
let ballG = CGGradient(colorsSpace: cs, colors: [
    CGColor(red: 1, green: 1, blue: 1, alpha: 1),
    CGColor(red: 0.74, green: 0.82, blue: 0.95, alpha: 1),
] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(ballG, startCenter: CGPoint(x: 690, y: 380), startRadius: 0,
                       endCenter: CGPoint(x: 715, y: 345), endRadius: 80, options: [.drawsAfterEndLocation])
ctx.restoreGState()
ctx.restoreGState()

// Grote sneeuwvlok
let center = CGPoint(x: 512, y: 590)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -4), blur: 14, color: CGColor(red: 0.6, green: 0.75, blue: 1, alpha: 0.7))
ctx.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.setLineWidth(30)
ctx.setLineCap(.round)
let arm: CGFloat = 230
for k in 0..<6 {
    let a = CGFloat(k) * .pi / 3 + .pi / 2
    let dx = cos(a), dy = sin(a)
    ctx.move(to: center)
    ctx.addLine(to: CGPoint(x: center.x + dx * arm, y: center.y + dy * arm))
    for (along, len) in [(0.45 as CGFloat, 75 as CGFloat), (0.72, 55)] {
        let base = CGPoint(x: center.x + dx * arm * along, y: center.y + dy * arm * along)
        for side in [-1.0 as CGFloat, 1.0] {
            let b = a + side * .pi / 4
            ctx.move(to: base)
            ctx.addLine(to: CGPoint(x: base.x + cos(b) * len, y: base.y + sin(b) * len))
        }
    }
}
ctx.strokePath()
ctx.restoreGState()

let img = ctx.makeImage()!
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
if !CGImageDestinationFinalize(dest) {
    FileHandle.standardError.write("Kon icoon niet opslaan\n".data(using: .utf8)!)
    exit(1)
}
