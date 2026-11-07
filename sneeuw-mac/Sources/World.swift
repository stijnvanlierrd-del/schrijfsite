import AppKit

enum Intensity: Int {
    case light = 0, normal = 1, storm = 2
}

struct Flake {
    var x: CGFloat
    var y: CGFloat
    var vy: CGFloat
    var size: CGFloat
    var depth: CGFloat
    var phase: CGFloat
    var sway: CGFloat
}

struct Chunk {
    var p: CGPoint
    var v: CGVector
    var mass: CGFloat
    var r: CGFloat
}

struct Splat {
    var p: CGPoint
    var age: CGFloat
    var blobs: [(dx: CGFloat, dy: CGFloat, r: CGFloat)]
}

final class Ball {
    var p: CGPoint
    var v = CGVector.zero
    var area: CGFloat
    var angle: CGFloat = 0
    var grabbed = false
    var thrown = false
    var dead = false
    var restingOn: Int? = nil
    let speckles: [(a: CGFloat, d: CGFloat, s: CGFloat)]

    var r: CGFloat { max(3, (area / .pi).squareRoot()) }

    init(p: CGPoint, area: CGFloat) {
        self.p = p
        self.area = area
        speckles = (0..<9).map { _ in
            (CGFloat.random(in: 0..<(2 * .pi)), CGFloat.random(in: 0.25...0.8), CGFloat.random(in: 0.05...0.12))
        }
    }
}

@MainActor
final class World {
    // Instellingen
    var intensity: Intensity = .normal { didSet { adjustFlakeCount() } }
    var wind = true

    // Constanten
    let gravity: CGFloat = 1600
    let windowSnowMax: CGFloat = 26
    let groundSnowMax: CGFloat = 34
    let maxBalls = 40
    let maxBallArea: CGFloat = .pi * 46 * 46
    let maxChunks = 3000

    // Toestand
    private(set) var screenRects: [CGRect] = []
    private(set) var bounds: CGRect = .zero
    private var mainHeight: CGFloat = 0
    private var surfaces: [Int: Surface] = [:]
    private var rects: [Int: CGRect] = [:]
    private var order: [Int] = []          // vensters van voor naar achter
    private var grounds: [Surface] = []
    private var flakes: [Flake] = []
    private var chunks: [Chunk] = []
    private(set) var balls: [Ball] = []
    private var splats: [Splat] = []
    private var time: CGFloat = 0
    private var windNow: CGFloat = 0
    private let myPID = ProcessInfo.processInfo.processIdentifier

    // Muis
    private(set) var cursor: CGPoint = .zero
    private var cursorVel = CGVector.zero
    private var history: [(t: CGFloat, p: CGPoint)] = []
    private(set) var grabbed: Ball?
    private var rolling: Ball?

    // Tekenen
    private let flakeImage: CGImage
    private let snowGradient: CGGradient
    private let ballGradient: CGGradient

    init() {
        let cs = CGColorSpaceCreateDeviceRGB()
        let size = 32
        let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                            space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let fg = CGGradient(colorsSpace: cs, colors: [
            CGColor(red: 1, green: 1, blue: 1, alpha: 1),
            CGColor(red: 1, green: 1, blue: 1, alpha: 0.75),
            CGColor(red: 1, green: 1, blue: 1, alpha: 0),
        ] as CFArray, locations: [0, 0.4, 1])!
        let c = CGPoint(x: 16, y: 16)
        ctx.drawRadialGradient(fg, startCenter: c, startRadius: 0, endCenter: c, endRadius: 16, options: [])
        flakeImage = ctx.makeImage()!

        snowGradient = CGGradient(colorsSpace: cs, colors: [
            CGColor(red: 1, green: 1, blue: 1, alpha: 1),
            CGColor(red: 0.97, green: 0.98, blue: 1, alpha: 1),
            CGColor(red: 0.80, green: 0.87, blue: 0.97, alpha: 1),
        ] as CFArray, locations: [0, 0.55, 1])!

        ballGradient = CGGradient(colorsSpace: cs, colors: [
            CGColor(red: 1, green: 1, blue: 1, alpha: 1),
            CGColor(red: 0.95, green: 0.97, blue: 1, alpha: 1),
            CGColor(red: 0.74, green: 0.82, blue: 0.94, alpha: 1),
        ] as CFArray, locations: [0, 0.45, 1])!
    }

    // MARK: - Schermen

    func configureScreens() {
        let screens = NSScreen.screens
        mainHeight = screens.first?.frame.height ?? 900
        screenRects = screens.map { cgRect($0.frame) }
        bounds = screenRects.reduce(CGRect.null) { $0.union($1) }
        if bounds.isNull { bounds = CGRect(x: 0, y: 0, width: 1440, height: 900) }
        let old = grounds
        grounds = screenRects.enumerated().map { i, r in
            let g = Surface(id: -1 - i, x: r.minX, baseY: r.maxY, width: r.width,
                            maxHeight: groundSnowMax, isGround: true)
            if i < old.count, old[i].count == g.count, old[i].x == g.x, old[i].baseY == g.baseY {
                g.h = old[i].h
            }
            return g
        }
        adjustFlakeCount()
    }

    func cgRect(_ f: NSRect) -> CGRect {
        CGRect(x: f.minX, y: mainHeight - f.maxY, width: f.width, height: f.height)
    }

    // MARK: - Sneeuwvlokken

    private var targetFlakes: Int {
        let area = screenRects.reduce(CGFloat(0)) { $0 + $1.width * $1.height } / 1_000_000
        let per: CGFloat
        switch intensity {
        case .light: per = 70
        case .normal: per = 170
        case .storm: per = 420
        }
        return Int(min(1600, max(40, area * per)))
    }

    private func adjustFlakeCount() {
        let t = targetFlakes
        while flakes.count < t { flakes.append(makeFlake(anywhere: true)) }
        if flakes.count > t { flakes.removeLast(flakes.count - t) }
    }

    private func makeFlake(anywhere: Bool) -> Flake {
        let depth = CGFloat.random(in: 0.3...1)
        let x = CGFloat.random(in: (bounds.minX - 150)...(bounds.maxX + 150))
        let y = anywhere ? CGFloat.random(in: bounds.minY...bounds.maxY)
                         : bounds.minY - CGFloat.random(in: 4...60)
        return Flake(x: x, y: y,
                     vy: (26 + 52 * depth) * CGFloat.random(in: 0.8...1.2),
                     size: 1.1 + 3.3 * depth * depth,
                     depth: depth,
                     phase: CGFloat.random(in: 0..<(2 * .pi)),
                     sway: CGFloat.random(in: 0.5...1.8))
    }

    // MARK: - Stap

    func step(dt: CGFloat) {
        time += dt
        updateCursor(dt)
        syncWindows(dt)
        let surfs = order.compactMap { surfaces[$0] } + grounds
        updateWind()
        updateFlakes(dt)
        gather(dt, surfs)
        updateBalls(dt, surfs)
        collideBalls()
        updateChunks(dt)
        for s in surfs {
            let spill = s.relax()
            if s.isGround { continue }
            s.spillLeft += spill.left
            s.spillRight += spill.right
            if s.spillLeft > 14 {
                if s.visible[0] {
                    addChunk(Chunk(p: CGPoint(x: s.x - 1, y: s.baseY - 3),
                                   v: CGVector(dx: CGFloat.random(in: -30 ... -5), dy: 0),
                                   mass: s.spillLeft, r: 2.5))
                }
                s.spillLeft = 0
            }
            if s.spillRight > 14 {
                if s.visible[s.count - 1] {
                    addChunk(Chunk(p: CGPoint(x: s.maxX + 1, y: s.baseY - 3),
                                   v: CGVector(dx: CGFloat.random(in: 5...30), dy: 0),
                                   mass: s.spillRight, r: 2.5))
                }
                s.spillRight = 0
            }
        }
        for i in splats.indices {
            splats[i].age += dt
            splats[i].p.y += 9 * dt
        }
        splats.removeAll { $0.age > 3 }
        balls.removeAll { $0.dead }
    }

    private func updateWind() {
        guard wind else { windNow = 0; return }
        let base: CGFloat = intensity == .storm ? 85 : 26
        windNow = base * (0.55 + 0.45 * sin(time * 0.21)) + base * 0.5 * sin(time * 0.057 + 1.3)
    }

    // MARK: - Muis

    private func currentMouse() -> CGPoint {
        let m = NSEvent.mouseLocation
        return CGPoint(x: m.x, y: mainHeight - m.y)
    }

    private func updateCursor(_ dt: CGFloat) {
        let p = currentMouse()
        let raw = CGVector(dx: (p.x - cursor.x) / dt, dy: (p.y - cursor.y) / dt)
        cursorVel = CGVector(dx: cursorVel.dx * 0.4 + raw.dx * 0.6, dy: cursorVel.dy * 0.4 + raw.dy * 0.6)
        cursor = p
        history.append((time, p))
        history.removeAll { time - $0.t > 0.1 }
    }

    func ball(at p: CGPoint) -> Ball? {
        balls.last(where: { !$0.dead && hypot($0.p.x - p.x, $0.p.y - p.y) <= $0.r + 5 })
    }

    func wantsMouse(in rect: CGRect) -> Bool {
        if grabbed != nil { return true }
        return rect.contains(cursor) && ball(at: cursor) != nil
    }

    var hoveringBall: Bool { grabbed == nil && ball(at: cursor) != nil }

    func grab() {
        cursor = currentMouse()
        guard let b = ball(at: cursor) else { return }
        b.grabbed = true
        b.thrown = false
        b.restingOn = nil
        grabbed = b
        rolling = nil
        history.removeAll()
        // bovenop tekenen
        if let i = balls.firstIndex(where: { $0 === b }) {
            balls.remove(at: i)
            balls.append(b)
        }
    }

    func release() {
        guard let b = grabbed else { return }
        cursor = currentMouse()
        var v = CGVector.zero
        if let first = history.first, time - first.t > 0.008 {
            let d = time - first.t
            v = CGVector(dx: (cursor.x - first.p.x) / d, dy: (cursor.y - first.p.y) / d)
        }
        let speed = hypot(v.dx, v.dy)
        if speed > 3200 { v = CGVector(dx: v.dx / speed * 3200, dy: v.dy / speed * 3200) }
        b.v = v
        b.p = cursor
        b.grabbed = false
        b.thrown = speed > 250
        grabbed = nil
    }

    // MARK: - Vensters volgen

    private func syncWindows(_ dt: CGFloat) {
        var list: [(Int, CGRect)] = []
        if let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements],
                                                 kCGNullWindowID) as? [[String: Any]] {
            for w in info {
                guard (w[kCGWindowLayer as String] as? Int) == 0,
                      let num = w[kCGWindowNumber as String] as? Int,
                      let pid = w[kCGWindowOwnerPID as String] as? Int32, pid != myPID,
                      let bd = w[kCGWindowBounds as String] as? NSDictionary,
                      let r = CGRect(dictionaryRepresentation: bd as CFDictionary)
                else { continue }
                if let a = w[kCGWindowAlpha as String] as? Double, a < 0.05 { continue }
                if r.width < 60 || r.height < 30 { continue }
                list.append((num, r))
            }
        }

        let sdt = max(dt, 1.0 / 120)
        var seen = Set<Int>()
        for (id, r) in list {
            seen.insert(id)
            guard let s = surfaces[id], let old = rects[id] else {
                surfaces[id] = Surface(id: id, x: r.minX, baseY: r.minY, width: r.width,
                                       maxHeight: windowSnowMax, isGround: false)
                rects[id] = r
                continue
            }
            let sameSize = abs(old.width - r.width) < 0.5 && abs(old.height - r.height) < 0.5
            let sameOrigin = abs(old.minX - r.minX) < 0.5 && abs(old.minY - r.minY) < 0.5
            rects[id] = r
            if sameSize && sameOrigin { continue }
            let v = CGVector(dx: (r.minX - old.minX) / sdt, dy: (r.minY - old.minY) / sdt)
            if sameSize || abs(old.minY - r.minY) >= 0.5 {
                // Venster verschoven (of de bovenrand bewogen): alle sneeuw valt eraf.
                shed(s, velocity: v, indices: Array(0..<s.count))
                surfaces[id] = Surface(id: id, x: r.minX, baseY: r.minY, width: r.width,
                                       maxHeight: windowSnowMax, isGround: false)
            } else {
                // Breedte veranderd: wat er niet meer op past valt eraf.
                let ns = Surface(id: id, x: r.minX, baseY: r.minY, width: r.width,
                                 maxHeight: windowSnowMax, isGround: false)
                var outside: [Int] = []
                for i in 0..<s.count {
                    let gx = s.colX(i)
                    if gx < r.maxX - 0.5, let j = ns.index(gx) {
                        ns.h[j] = max(ns.h[j], s.h[i])
                    } else {
                        outside.append(i)
                    }
                }
                shed(s, velocity: CGVector(dx: v.dx * 0.3, dy: 0), indices: outside)
                surfaces[id] = ns
            }
        }
        for id in Array(surfaces.keys) where !seen.contains(id) {
            if let s = surfaces[id] { shed(s, velocity: .zero, indices: Array(0..<s.count)) }
            surfaces[id] = nil
            rects[id] = nil
        }
        order = list.map { $0.0 }
        computeVisibility()
    }

    private func computeVisibility() {
        for (k, id) in order.enumerated() {
            guard let s = surfaces[id] else { continue }
            let line = s.baseY - 1
            for i in 0..<s.count {
                let p = CGPoint(x: s.colX(i), y: line)
                s.visible[i] = screenRects.contains { $0.contains(p) }
            }
            for j in 0..<k {
                guard let fr = rects[order[j]], fr.minY <= line, fr.maxY >= line else { continue }
                let a = max(0, Int(((fr.minX - s.x) / COL).rounded(.down)))
                let b = min(s.count - 1, Int(((fr.maxX - s.x) / COL).rounded(.up)))
                guard a <= b else { continue }
                for i in a...b {
                    let cx = s.colX(i)
                    if cx >= fr.minX && cx <= fr.maxX { s.visible[i] = false }
                }
            }
        }
    }

    /// Laat de sneeuw van de gegeven kolommen als klontjes naar beneden vallen.
    private func shed(_ s: Surface, velocity v: CGVector, indices: [Int]) {
        var idx = 0
        while idx < indices.count {
            let startIdx = idx
            var mass: CGFloat = 0
            var top: CGFloat = 0
            var last = indices[idx]
            while idx < indices.count && idx - startIdx < 3 && (idx == startIdx || indices[idx] == last + 1) {
                let i = indices[idx]
                mass += s.h[i] * COL
                top = max(top, s.h[i])
                s.h[i] = 0
                last = i
                idx += 1
            }
            if mass > 2 {
                let first = indices[startIdx]
                let cx = s.x + (CGFloat(first) + CGFloat(idx - startIdx) / 2) * COL
                let r = max(1.5, min(7, (mass / .pi).squareRoot() * 0.9))
                addChunk(Chunk(p: CGPoint(x: cx + CGFloat.random(in: -1...1), y: s.baseY - top * 0.5),
                               v: CGVector(dx: v.dx * 0.55 + CGFloat.random(in: -40...40),
                                           dy: max(-450, min(200, v.dy * 0.55)) - CGFloat.random(in: 0...70)),
                               mass: mass, r: r))
            }
        }
        for b in balls where b.restingOn == s.id {
            b.v.dx += v.dx * 0.7
            b.v.dy += min(0, v.dy * 0.7)
            b.restingOn = nil
        }
    }

    private func addChunk(_ c: Chunk) {
        if chunks.count >= maxChunks { chunks.removeFirst(chunks.count - maxChunks + 1) }
        chunks.append(c)
    }

    // MARK: - Landen

    private func landing(x: CGFloat, y0: CGFloat, y1: CGFloat) -> Surface? {
        var best: Surface? = nil
        var bestT = CGFloat.infinity
        for id in order {
            guard let s = surfaces[id], let i = s.index(x), s.visible[i] else { continue }
            let t = s.top(i)
            if y0 <= t && y1 >= t && t < bestT { best = s; bestT = t }
        }
        for s in grounds {
            guard let i = s.index(x) else { continue }
            let t = s.top(i)
            if y0 <= t && y1 >= t && t < bestT { best = s; bestT = t }
        }
        return best
    }

    private func updateFlakes(_ dt: CGFloat) {
        let speedUp: CGFloat = intensity == .storm ? 1.5 : 1
        for i in flakes.indices {
            var f = flakes[i]
            f.phase += f.sway * dt
            let nx = f.x + (windNow * f.depth + sin(f.phase) * 14 * f.depth) * dt
            let ny = f.y + f.vy * speedUp * dt
            if f.depth > 0.55, let s = landing(x: nx, y0: f.y, y1: ny) {
                s.deposit(at: nx, area: 6 * f.size)
                f = makeFlake(anywhere: false)
            } else if ny > bounds.maxY + 10 {
                f = makeFlake(anywhere: false)
            } else {
                f.x = nx
                f.y = ny
                if f.x > bounds.maxX + 160 { f.x -= bounds.width + 300 }
                if f.x < bounds.minX - 160 { f.x += bounds.width + 300 }
            }
            flakes[i] = f
        }
    }

    private func updateChunks(_ dt: CGFloat) {
        var i = 0
        while i < chunks.count {
            var c = chunks[i]
            c.v.dy += gravity * dt
            c.v.dx *= (1 - 0.6 * dt)
            let np = CGPoint(x: c.p.x + c.v.dx * dt, y: c.p.y + c.v.dy * dt)
            if c.v.dy > 0, let s = landing(x: np.x, y0: c.p.y, y1: np.y) {
                s.deposit(at: np.x, area: c.mass)
                chunks.swapAt(i, chunks.count - 1)
                chunks.removeLast()
                continue
            }
            if np.y > bounds.maxY + 60 {
                chunks.swapAt(i, chunks.count - 1)
                chunks.removeLast()
                continue
            }
            c.p = np
            chunks[i] = c
            i += 1
        }
    }

    // MARK: - Sneeuwballen rollen

    private func gather(_ dt: CGFloat, _ surfs: [Surface]) {
        guard grabbed == nil else { return }
        let speed = hypot(cursorVel.dx, cursorVel.dy)
        guard speed > 15 else { return }
        let R: CGFloat = 14
        var collected: CGFloat = 0
        for s in surfs {
            guard cursor.x > s.x - R, cursor.x < s.maxX + R,
                  cursor.y > s.baseY - s.maxHeight - R - 6, cursor.y < s.baseY + 6 else { continue }
            let a = max(0, Int(((cursor.x - R - s.x) / COL).rounded(.down)))
            let b = min(s.count - 1, Int(((cursor.x + R - s.x) / COL).rounded(.down)))
            guard a <= b else { continue }
            for i in a...b where s.visible[i] && s.h[i] > 0.2 {
                guard cursor.y > s.top(i) - 8 else { continue }
                let dx = abs(s.colX(i) - cursor.x) / R
                let fall = max(0, 1 - dx * dx)
                let take = min(s.h[i], (45 + speed * 0.08) * dt * fall)
                s.h[i] -= take
                collected += take * COL
            }
        }
        guard collected > 0.5 else { return }

        var target: Ball? = nil
        if let r = rolling, !r.dead, !r.grabbed, hypot(r.p.x - cursor.x, r.p.y - cursor.y) < r.r + 45 {
            target = r
        }
        if target == nil {
            target = balls.first(where: { !$0.dead && !$0.grabbed && hypot($0.p.x - cursor.x, $0.p.y - cursor.y) < $0.r + 10 })
        }
        if target == nil {
            if balls.count >= maxBalls, let oldest = balls.first(where: { !$0.grabbed }) {
                splat(oldest, at: oldest.p, decal: false)
            }
            let nb = Ball(p: CGPoint(x: cursor.x, y: cursor.y - 3), area: 12)
            balls.append(nb)
            target = nb
        }
        guard let b = target else { return }
        b.area = min(maxBallArea, b.area + collected)
        b.v.dx += (max(-700, min(700, cursorVel.dx)) * 0.9 - b.v.dx) * min(1, 10 * dt)
        rolling = b
    }

    // MARK: - Ballen

    private func updateBalls(_ dt: CGFloat, _ surfs: [Surface]) {
        for b in balls where !b.dead {
            if b.grabbed {
                b.angle += cursorVel.dx * dt / b.r
                b.v = cursorVel
                b.p = cursor
                continue
            }
            let r = b.r
            b.v.dy += gravity * dt
            var np = CGPoint(x: b.p.x + b.v.dx * dt, y: b.p.y + b.v.dy * dt)
            var landed: Surface? = nil

            if b.v.dy >= 0 {
                var bestY = CGFloat.infinity
                for s in surfs {
                    guard np.x + r > s.x, np.x - r < s.maxX,
                          let cy = s.supportCenter(x: np.x, r: r) else { continue }
                    if np.y >= cy && b.p.y <= cy + max(6, r * 0.8) && cy < bestY {
                        bestY = cy
                        landed = s
                    }
                }
                if let s = landed {
                    let impact = b.v.dy
                    if b.thrown && impact > 800 {
                        splat(b, at: CGPoint(x: np.x, y: bestY + r * 0.5), decal: false)
                        continue
                    }
                    np.y = bestY
                    b.v.dy = impact > 260 ? -impact * 0.25 : 0
                    if let yl = s.supportCenter(x: np.x - 2, r: r), let yr = s.supportCenter(x: np.x + 2, r: r) {
                        let slope = max(-1.2, min(1.2, (yr - yl) / 4))
                        b.v.dx += slope * gravity * 0.5 * dt
                    }
                    if np.x < s.x { b.v.dx -= gravity * 0.6 * dt }
                    else if np.x > s.maxX { b.v.dx += gravity * 0.6 * dt }
                    b.v.dx *= pow(0.3, dt)
                    if abs(b.v.dx) < 2 { b.v.dx = 0 }
                    b.thrown = false
                    b.restingOn = s.id
                    // Een rollende bal neemt sneeuw mee.
                    if abs(b.v.dx) > 25 && b.area < maxBallArea {
                        let lo = max(0, Int(((np.x - r * 0.5 - s.x) / COL).rounded(.down)))
                        let hi = min(s.count - 1, Int(((np.x + r * 0.5 - s.x) / COL).rounded(.down)))
                        if lo <= hi {
                            for i in lo...hi where s.visible[i] {
                                let take = min(s.h[i], abs(b.v.dx) * dt * 0.03)
                                s.h[i] -= take
                                b.area += take * COL
                            }
                        }
                    }
                } else {
                    b.restingOn = nil
                }
            }

            // Een gegooide bal die tegen een venster aan knalt, spat uiteen.
            if landed == nil && b.thrown && hypot(b.v.dx, b.v.dy) > 380 {
                var hit = false
                for id in order {
                    guard let wr = rects[id] else { continue }
                    if wr.contains(np) {
                        if !wr.contains(b.p) && screenRects.contains(where: { $0.contains(np) }) { hit = true }
                        break
                    }
                }
                if hit {
                    splat(b, at: np, decal: true)
                    continue
                }
            }

            // Schermranden
            if np.x - r < bounds.minX {
                np.x = bounds.minX + r
                if b.thrown && abs(b.v.dx) > 700 { splat(b, at: np, decal: true); continue }
                b.v.dx = abs(b.v.dx) * 0.4
            } else if np.x + r > bounds.maxX {
                np.x = bounds.maxX - r
                if b.thrown && abs(b.v.dx) > 700 { splat(b, at: np, decal: true); continue }
                b.v.dx = -abs(b.v.dx) * 0.4
            }
            if np.y - r < bounds.minY {
                np.y = bounds.minY + r
                if b.thrown && abs(b.v.dy) > 700 { splat(b, at: np, decal: true); continue }
                b.v.dy = abs(b.v.dy) * 0.4
            }
            if hypot(b.v.dx, b.v.dy) < 150 { b.thrown = false }

            b.angle += (np.x - b.p.x) / max(r, 1)
            b.p = np
            if b.p.y - r > bounds.maxY + 150 { b.dead = true }
        }
    }

    private func collideBalls() {
        let n = balls.count
        guard n > 1 else { return }
        for i in 0..<(n - 1) {
            let a = balls[i]
            if a.dead { continue }
            for j in (i + 1)..<n {
                let b = balls[j]
                if b.dead { continue }
                let dx = b.p.x - a.p.x, dy = b.p.y - a.p.y
                let d = hypot(dx, dy)
                let minD = a.r + b.r
                guard d < minD, d > 0.01 else { continue }
                let nx = dx / d, ny = dy / d
                let ma: CGFloat = a.grabbed ? 0 : 1 / a.area
                let mb: CGFloat = b.grabbed ? 0 : 1 / b.area
                let total = ma + mb
                guard total > 0 else { continue }
                let overlap = minD - d
                a.p.x -= nx * overlap * ma / total
                a.p.y -= ny * overlap * ma / total
                b.p.x += nx * overlap * mb / total
                b.p.y += ny * overlap * mb / total
                let rv = (b.v.dx - a.v.dx) * nx + (b.v.dy - a.v.dy) * ny
                if rv < 0 {
                    let jimp = -(1.3) * rv / total
                    a.v.dx -= nx * jimp * ma; a.v.dy -= ny * jimp * ma
                    b.v.dx += nx * jimp * mb; b.v.dy += ny * jimp * mb
                }
            }
        }
    }

    private func splat(_ b: Ball, at p: CGPoint, decal: Bool) {
        b.dead = true
        if grabbed === b { grabbed = nil }
        if rolling === b { rolling = nil }
        let n = Int(min(30, max(5, b.area / 35)))
        let m = b.area / CGFloat(n)
        for _ in 0..<n {
            let ang = CGFloat.random(in: 0..<(2 * .pi))
            let sp = CGFloat.random(in: 60...340)
            addChunk(Chunk(p: CGPoint(x: p.x + cos(ang) * 3, y: p.y + sin(ang) * 3),
                           v: CGVector(dx: cos(ang) * sp - b.v.dx * 0.08, dy: sin(ang) * sp - 140),
                           mass: m * 0.8,
                           r: max(1.5, min(5, (m / .pi).squareRoot()))))
        }
        if decal {
            let r = b.r
            let blobs = (0..<10).map { _ -> (dx: CGFloat, dy: CGFloat, r: CGFloat) in
                let a = CGFloat.random(in: 0..<(2 * .pi))
                let d = CGFloat.random(in: 0...(r * 0.9))
                return (cos(a) * d, sin(a) * d, CGFloat.random(in: (r * 0.2)...(r * 0.55)))
            }
            splats.append(Splat(p: p, age: 0, blobs: [(dx: CGFloat(0), dy: CGFloat(0), r: r * 0.7)] + blobs))
        }
    }

    // MARK: - Opruimen

    func clearAll() {
        for s in surfaces.values { s.clear() }
        for g in grounds { g.clear() }
        chunks.removeAll()
        balls.removeAll()
        splats.removeAll()
        grabbed = nil
        rolling = nil
    }

    func clearBalls() {
        for b in balls { splat(b, at: b.p, decal: false) }
        balls.removeAll()
    }

    // MARK: - Tekenen

    func draw(in ctx: CGContext, rect: CGRect) {
        let area = rect.insetBy(dx: -60, dy: -60)

        for id in order.reversed() {
            if let s = surfaces[id] { drawSurface(s, ctx, area) }
        }
        for g in grounds { drawSurface(g, ctx, area) }

        // Spetters op vensters
        for s in splats where area.contains(s.p) {
            let alpha = max(0, 1 - s.age / 3)
            ctx.setFillColor(CGColor(red: 0.97, green: 0.98, blue: 1, alpha: alpha * 0.95))
            for bl in s.blobs {
                ctx.fillEllipse(in: CGRect(x: s.p.x + bl.dx - bl.r, y: s.p.y + bl.dy - bl.r,
                                           width: bl.r * 2, height: bl.r * 2))
            }
        }

        // Klontjes
        let chunkPath = CGMutablePath()
        for c in chunks where area.contains(c.p) {
            chunkPath.addEllipse(in: CGRect(x: c.p.x - c.r, y: c.p.y - c.r, width: c.r * 2, height: c.r * 1.8))
        }
        if !chunkPath.isEmpty {
            ctx.saveGState()
            ctx.setShadow(offset: CGSize(width: 0, height: -1), blur: 2, color: CGColor(gray: 0, alpha: 0.3))
            ctx.setFillColor(CGColor(red: 0.98, green: 0.99, blue: 1, alpha: 1))
            ctx.addPath(chunkPath)
            ctx.fillPath()
            ctx.restoreGState()
        }

        for b in balls where !b.dead && area.contains(b.p) { drawBall(b, ctx) }

        // Vlokken
        for f in flakes where area.contains(CGPoint(x: f.x, y: f.y)) {
            let d = f.size * 2.4
            ctx.setAlpha(0.3 + 0.65 * f.depth)
            ctx.draw(flakeImage, in: CGRect(x: f.x - d / 2, y: f.y - d / 2, width: d, height: d))
        }
        ctx.setAlpha(1)
    }

    private func drawSurface(_ s: Surface, _ ctx: CGContext, _ area: CGRect) {
        guard s.x < area.maxX, s.maxX > area.minX,
              s.baseY > area.minY, s.baseY - s.maxHeight < area.maxY else { return }
        let path = CGMutablePath()
        let n = s.count
        var i = 0
        while i < n {
            while i < n && !(s.visible[i] && s.h[i] > 0.25) { i += 1 }
            if i >= n { break }
            let start = i
            while i < n && s.visible[i] && s.h[i] > 0.25 { i += 1 }
            let end = i
            let x0 = s.x + CGFloat(start) * COL
            let x1 = min(s.x + CGFloat(end) * COL, s.maxX)
            path.move(to: CGPoint(x: x0, y: s.baseY + 0.5))
            var prev = CGPoint(x: x0, y: s.baseY - s.h[start] * 0.55)
            path.addLine(to: prev)
            for k in start..<end {
                let pt = CGPoint(x: s.colX(k), y: s.top(k))
                path.addQuadCurve(to: CGPoint(x: (prev.x + pt.x) / 2, y: (prev.y + pt.y) / 2), control: prev)
                prev = pt
            }
            path.addQuadCurve(to: CGPoint(x: x1, y: s.baseY - s.h[end - 1] * 0.55), control: prev)
            path.addLine(to: CGPoint(x: x1, y: s.baseY + 0.5))
            path.closeSubpath()
        }
        guard !path.isEmpty else { return }

        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -1), blur: 3, color: CGColor(gray: 0, alpha: 0.28))
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.addPath(path)
        ctx.fillPath()
        ctx.restoreGState()

        ctx.saveGState()
        ctx.addPath(path)
        ctx.clip()
        ctx.drawLinearGradient(snowGradient,
                               start: CGPoint(x: 0, y: s.baseY - s.maxHeight),
                               end: CGPoint(x: 0, y: s.baseY + 1),
                               options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        ctx.restoreGState()
    }

    private func drawBall(_ b: Ball, _ ctx: CGContext) {
        let r = b.r
        let rect = CGRect(x: b.p.x - r, y: b.p.y - r, width: r * 2, height: r * 2)
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: b.grabbed ? -6 : -2),
                      blur: b.grabbed ? 10 : 5, color: CGColor(gray: 0, alpha: 0.35))
        ctx.setFillColor(CGColor(red: 0.93, green: 0.96, blue: 1, alpha: 1))
        ctx.fillEllipse(in: rect)
        ctx.restoreGState()

        ctx.saveGState()
        ctx.addEllipse(in: rect)
        ctx.clip()
        let hl = CGPoint(x: b.p.x - r * 0.35, y: b.p.y - r * 0.4)
        ctx.drawRadialGradient(ballGradient, startCenter: hl, startRadius: 0,
                               endCenter: b.p, endRadius: r * 1.05,
                               options: [.drawsAfterEndLocation])
        ctx.setFillColor(CGColor(red: 0.6, green: 0.7, blue: 0.86, alpha: 0.35))
        for sp in b.speckles {
            let a = sp.a + b.angle
            let c = CGPoint(x: b.p.x + cos(a) * sp.d * r, y: b.p.y + sin(a) * sp.d * r)
            let sr = sp.s * r
            ctx.fillEllipse(in: CGRect(x: c.x - sr, y: c.y - sr, width: sr * 2, height: sr * 2))
        }
        ctx.restoreGState()
    }
}
