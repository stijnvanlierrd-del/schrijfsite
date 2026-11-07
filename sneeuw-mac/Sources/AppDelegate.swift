import AppKit
import ServiceManagement

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let world = World()
    private var overlays: [(panel: OverlayPanel, view: SnowView)] = []
    private var timer: Timer?
    private var statusItem: NSStatusItem!
    private var lastTick: CFTimeInterval = 0
    private var running = true
    private var eco = false
    private var cursorState = 0   // 0 = normaal, 1 = open hand, 2 = dichte hand
    private let defaults = UserDefaults.standard

    func applicationDidFinishLaunching(_ notification: Notification) {
        if defaults.object(forKey: "intensity") != nil {
            world.intensity = Intensity(rawValue: defaults.integer(forKey: "intensity")) ?? .normal
        }
        if defaults.object(forKey: "wind") != nil { world.wind = defaults.bool(forKey: "wind") }
        eco = defaults.bool(forKey: "eco")

        world.configureScreens()
        buildOverlays()
        setupStatusItem()
        startTimer()

        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged),
                                               name: NSApplication.didChangeScreenParametersNotification,
                                               object: nil)

        if !defaults.bool(forKey: "welcomed") {
            defaults.set(true, forKey: "welcomed")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                self?.showHelp()
            }
        }
    }

    // MARK: - Overlays

    private func buildOverlays() {
        for o in overlays { o.panel.orderOut(nil) }
        overlays = NSScreen.screens.map { screen in
            let panel = OverlayPanel(screen: screen)
            let view = SnowView(world: world, cgFrame: world.cgRect(screen.frame), size: screen.frame.size)
            panel.contentView = view
            if running { panel.orderFrontRegardless() }
            return (panel, view)
        }
    }

    @objc private func screensChanged() {
        world.configureScreens()
        buildOverlays()
    }

    // MARK: - Animatie

    private func startTimer() {
        timer?.invalidate()
        lastTick = CACurrentMediaTime()
        let t = Timer(timeInterval: eco ? 1.0 / 30 : 1.0 / 60, target: self,
                      selector: #selector(tick), userInfo: nil, repeats: true)
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    @objc private func tick() {
        let now = CACurrentMediaTime()
        let dt = CGFloat(min(max(now - lastTick, 0.001), 1.0 / 20))
        lastTick = now
        world.step(dt: dt)
        for o in overlays {
            let want = world.wantsMouse(in: o.view.cgFrame)
            if o.panel.ignoresMouseEvents == want { o.panel.ignoresMouseEvents = !want }
            o.view.needsDisplay = true
        }
        let state = world.grabbed != nil ? 2 : (world.hoveringBall ? 1 : 0)
        if state != cursorState {
            switch state {
            case 2: NSCursor.closedHand.set()
            case 1: NSCursor.openHand.set()
            default: NSCursor.arrow.set()
            }
            cursorState = state
        }
    }

    // MARK: - Menu

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let img = NSImage(systemSymbolName: "snowflake", accessibilityDescription: "Sneeuw") {
            img.isTemplate = true
            statusItem.button?.image = img
        } else {
            statusItem.button?.title = "❄"
        }
        rebuildMenu()
    }

    private func item(_ title: String, _ action: Selector, key: String = "", on: Bool? = nil, tag: Int = 0) -> NSMenuItem {
        let it = NSMenuItem(title: title, action: action, keyEquivalent: key)
        it.target = self
        it.tag = tag
        if let on = on { it.state = on ? .on : .off }
        return it
    }

    private func rebuildMenu() {
        let m = NSMenu()
        m.addItem(item("Laat het sneeuwen", #selector(togglePause), on: running))

        let amount = NSMenu()
        amount.addItem(item("Licht", #selector(setIntensity(_:)), on: world.intensity == .light, tag: 0))
        amount.addItem(item("Normaal", #selector(setIntensity(_:)), on: world.intensity == .normal, tag: 1))
        amount.addItem(item("Sneeuwstorm", #selector(setIntensity(_:)), on: world.intensity == .storm, tag: 2))
        let amountItem = NSMenuItem(title: "Hoeveelheid", action: nil, keyEquivalent: "")
        amountItem.submenu = amount
        m.addItem(amountItem)

        m.addItem(item("Wind", #selector(toggleWind), on: world.wind))
        m.addItem(item("Zuinige modus (30 fps)", #selector(toggleEco), on: eco))
        m.addItem(.separator())
        m.addItem(item("Sneeuw wegvegen", #selector(clearSnow)))
        m.addItem(item("Sneeuwballen weghalen", #selector(clearBalls)))
        m.addItem(.separator())
        if #available(macOS 13.0, *) {
            m.addItem(item("Openen bij inloggen", #selector(toggleLogin),
                           on: SMAppService.mainApp.status == .enabled))
        }
        m.addItem(item("Hoe werkt het?", #selector(showHelp)))
        m.addItem(.separator())
        m.addItem(item("Stop Sneeuw", #selector(quit), key: "q"))
        statusItem.menu = m
    }

    @objc private func togglePause() {
        running.toggle()
        if running {
            for o in overlays { o.panel.orderFrontRegardless() }
            startTimer()
        } else {
            timer?.invalidate()
            timer = nil
            for o in overlays { o.panel.orderOut(nil) }
        }
        rebuildMenu()
    }

    @objc private func setIntensity(_ sender: NSMenuItem) {
        world.intensity = Intensity(rawValue: sender.tag) ?? .normal
        defaults.set(sender.tag, forKey: "intensity")
        rebuildMenu()
    }

    @objc private func toggleWind() {
        world.wind.toggle()
        defaults.set(world.wind, forKey: "wind")
        rebuildMenu()
    }

    @objc private func toggleEco() {
        eco.toggle()
        defaults.set(eco, forKey: "eco")
        if running { startTimer() }
        rebuildMenu()
    }

    @objc private func clearSnow() { world.clearAll() }
    @objc private func clearBalls() { world.clearBalls() }

    @objc private func toggleLogin() {
        if #available(macOS 13.0, *) {
            let service = SMAppService.mainApp
            if service.status == .enabled {
                try? service.unregister()
            } else {
                try? service.register()
            }
            rebuildMenu()
        }
    }

    @objc private func showHelp() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Het sneeuwt! ❄"
        alert.informativeText = """
        • Sneeuw dwarrelt over je scherm en hoopt zich op boven op je vensters en onderaan het scherm.
        • Verschuif een venster of maak het smaller, en de sneeuw die erop lag valt eraf.
        • Beweeg je muis door de sneeuw: zo rol je er sneeuwballen van.
        • Pak een sneeuwbal vast met de muis en gooi hem weg. Gooi je hard tegen een venster, dan spat hij uiteen.

        Alles regel je via het sneeuwvlokje in de menubalk.
        """
        alert.addButton(withTitle: "Leuk!")
        alert.runModal()
    }

    @objc private func quit() { NSApp.terminate(nil) }
}
