import AppKit

/// Doorzichtig paneel over een heel scherm. Het steelt nooit de focus.
final class OverlayPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    init(screen: NSScreen) {
        super.init(contentRect: screen.frame,
                   styleMask: [.borderless, .nonactivatingPanel],
                   backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .statusBar
        collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        ignoresMouseEvents = true
        isFloatingPanel = true
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = true
        animationBehavior = .none
        isReleasedWhenClosed = false
        setFrame(screen.frame, display: false)
    }
}

/// Tekent de sneeuwwereld voor één scherm.
final class SnowView: NSView {
    let world: World
    let cgFrame: CGRect

    init(world: World, cgFrame: CGRect, size: NSSize) {
        self.world = world
        self.cgFrame = cgFrame
        super.init(frame: NSRect(origin: .zero, size: size))
        wantsLayer = true
        layerContentsRedrawPolicy = .onSetNeedsDisplay
    }

    required init?(coder: NSCoder) { fatalError("niet gebruikt") }

    override var isFlipped: Bool { true }
    override var isOpaque: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.clear(bounds)
        ctx.saveGState()
        ctx.translateBy(x: -cgFrame.minX, y: -cgFrame.minY)
        world.draw(in: ctx, rect: cgFrame)
        ctx.restoreGState()
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) { world.grab() }
    override func mouseDragged(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) { world.release() }
}
