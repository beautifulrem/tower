// Prints the CGWindowID of the largest on-screen, normal-layer window owned
// by a PID (Tower's main window, not a popover or tooltip). Used by
// tools/screenshot.sh to capture only Tower's own window.
import CoreGraphics
import Foundation

guard CommandLine.arguments.count > 1, let pid = Int(CommandLine.arguments[1]) else { exit(2) }
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
var best: (id: Int, area: Double) = (0, 0)
for w in windows where (w[kCGWindowOwnerPID as String] as? Int) == pid && (w[kCGWindowLayer as String] as? Int) == 0 {
    let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
    let area = (b["Width"] ?? 0) * (b["Height"] ?? 0)
    if area > best.area, let id = w[kCGWindowNumber as String] as? Int { best = (id, area) }
}
if best.id == 0 { exit(1) }
print(best.id)
