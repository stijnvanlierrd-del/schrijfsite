import CoreGraphics

/// Breedte van één sneeuwkolom in punten.
let COL: CGFloat = 3

/// Een oppervlak waarop sneeuw kan liggen: de bovenrand van een venster,
/// of de onderkant van een scherm (de "grond" boven het Dock).
/// Alle coördinaten zijn globaal, met de oorsprong linksboven (y loopt naar beneden),
/// net als bij CGWindowList.
final class Surface {
    let id: Int
    let isGround: Bool
    var x: CGFloat
    var baseY: CGFloat
    var width: CGFloat
    var maxHeight: CGFloat
    var h: [CGFloat]
    var visible: [Bool]
    var spillLeft: CGFloat = 0
    var spillRight: CGFloat = 0

    init(id: Int, x: CGFloat, baseY: CGFloat, width: CGFloat, maxHeight: CGFloat, isGround: Bool) {
        self.id = id
        self.x = x
        self.baseY = baseY
        self.width = width
        self.maxHeight = maxHeight
        self.isGround = isGround
        let n = max(1, Int((width / COL).rounded(.up)))
        h = Array(repeating: 0, count: n)
        visible = Array(repeating: true, count: n)
    }

    var count: Int { h.count }
    var maxX: CGFloat { x + width }

    func index(_ gx: CGFloat) -> Int? {
        let f = (gx - x) / COL
        if f < 0 { return nil }
        let i = Int(f)
        return i < h.count ? i : nil
    }

    func colX(_ i: Int) -> CGFloat { x + (CGFloat(i) + 0.5) * COL }
    func top(_ i: Int) -> CGFloat { baseY - h[i] }

    /// Voeg een hoeveelheid sneeuw (oppervlakte in pt²) toe rond gx.
    func deposit(at gx: CGFloat, area: CGFloat) {
        guard let c = index(gx) else { return }
        let w: [CGFloat] = [1, 2, 3, 2, 1]
        for k in -2...2 {
            let i = c + k
            guard i >= 0 && i < h.count else { continue }
            let add = area * w[k + 2] / 9 / COL
            let soft = max(0.12, 1 - h[i] / maxHeight)
            h[i] = min(maxHeight, h[i] + add * soft)
        }
    }

    /// Laat de sneeuw zich zetten: te steile hellingen glijden uit,
    /// en aan de randen van een venster valt er langzaam wat af.
    /// Geeft de hoeveelheid (pt²) terug die links en rechts over de rand gaat.
    func relax() -> (left: CGFloat, right: CGFloat) {
        let n = h.count
        guard n > 1 else { return (0, 0) }
        let maxDiff: CGFloat = 1.5
        for i in 0..<(n - 1) {
            let d = h[i] - h[i + 1]
            if d > maxDiff {
                let t = (d - maxDiff) * 0.3
                h[i] -= t; h[i + 1] += t
            } else if d < -maxDiff {
                let t = (-d - maxDiff) * 0.3
                h[i + 1] -= t; h[i] += t
            }
        }
        var l: CGFloat = 0, r: CGFloat = 0
        if !isGround {
            let edgeMax: CGFloat = 5
            if h[0] > edgeMax { l = (h[0] - edgeMax) * 0.03; h[0] -= l }
            if h[n - 1] > edgeMax { r = (h[n - 1] - edgeMax) * 0.03; h[n - 1] -= r }
        }
        return (l * COL, r * COL)
    }

    /// Hoogste positie (kleinste y) voor het middelpunt van een bal met straal r die op x ligt.
    func supportCenter(x bx: CGFloat, r: CGFloat) -> CGFloat? {
        let lo = max(0, Int(((bx - r - x) / COL).rounded(.down)))
        let hi = min(h.count - 1, Int(((bx + r - x) / COL).rounded(.down)))
        guard lo <= hi else { return nil }
        var best: CGFloat? = nil
        for i in lo...hi where visible[i] {
            let dx = colX(i) - bx
            let q = r * r - dx * dx
            guard q > 0 else { continue }
            let cy = top(i) - q.squareRoot()
            if best == nil || cy < best! { best = cy }
        }
        return best
    }

    func clear() {
        for i in h.indices { h[i] = 0 }
    }
}
