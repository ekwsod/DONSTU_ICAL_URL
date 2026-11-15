// Run from the repository root: swift ios/tools/render-brand-icon.swift
// One vector drawing produces the native icon and all web icon sizes.
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let background = NSColor(srgbRed: 36 / 255, green: 40 / 255, blue: 43 / 255, alpha: 1).cgColor
let paper = NSColor(srgbRed: 242 / 255, green: 239 / 255, blue: 233 / 255, alpha: 1).cgColor
let coral = NSColor(srgbRed: 214 / 255, green: 136 / 255, blue: 106 / 255, alpha: 1).cgColor

let bookmark = CGMutablePath()
bookmark.move(to: CGPoint(x: 256, y: 240))
bookmark.addLine(to: CGPoint(x: 352, y: 240))
bookmark.addLine(to: CGPoint(x: 352, y: 784))
bookmark.addLine(to: CGPoint(x: 304, y: 744))
bookmark.addLine(to: CGPoint(x: 256, y: 784))
bookmark.closeSubpath()

let bowl = CGMutablePath()
bowl.move(to: CGPoint(x: 424, y: 240))
bowl.addLine(to: CGPoint(x: 504, y: 240))
bowl.addCurve(to: CGPoint(x: 776, y: 512), control1: CGPoint(x: 672, y: 240), control2: CGPoint(x: 776, y: 350))
bowl.addCurve(to: CGPoint(x: 504, y: 784), control1: CGPoint(x: 776, y: 674), control2: CGPoint(x: 672, y: 784))
bowl.addLine(to: CGPoint(x: 424, y: 784))
bowl.addLine(to: CGPoint(x: 424, y: 688))
bowl.addLine(to: CGPoint(x: 504, y: 688))
bowl.addCurve(to: CGPoint(x: 680, y: 512), control1: CGPoint(x: 614, y: 688), control2: CGPoint(x: 680, y: 616))
bowl.addCurve(to: CGPoint(x: 504, y: 336), control1: CGPoint(x: 680, y: 408), control2: CGPoint(x: 614, y: 336))
bowl.addLine(to: CGPoint(x: 424, y: 336))
bowl.closeSubpath()

func svgPath(_ path: CGPath) -> String {
    var commands: [String] = []
    path.applyWithBlock { pointer in
        let element = pointer.pointee
        func point(_ index: Int) -> String { "\(Int(element.points[index].x)) \(Int(element.points[index].y))" }
        switch element.type {
        case .moveToPoint: commands.append("M\(point(0))")
        case .addLineToPoint: commands.append("L\(point(0))")
        case .addCurveToPoint: commands.append("C\(point(0)) \(point(1)) \(point(2))")
        case .closeSubpath: commands.append("Z")
        case .addQuadCurveToPoint: preconditionFailure("Unexpected quadratic curve")
        @unknown default: preconditionFailure("Unexpected path element")
        }
    }
    return commands.joined(separator: " ")
}

let svg = """
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>Daymark</title>
  <rect width="1024" height="1024" fill="#24282b"/>
  <path d="\(svgPath(bookmark))" fill="#d6886a"/>
  <path d="\(svgPath(bowl))" fill="#f2efe9"/>
</svg>

"""
try svg.write(to: root.appendingPathComponent("bot/public/app/icon.svg"), atomically: true, encoding: .utf8)

for (size, path) in [(1024, "ios/MyPairs/Assets.xcassets/AppIcon.appiconset/AppIcon.png"), (512, "bot/public/app/daymark-512.png"), (180, "bot/public/app/daymark-touch.png")] {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    context.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    context.setFillColor(background)
    context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
    context.translateBy(x: 0, y: 1024)
    context.scaleBy(x: 1, y: -1)
    for (shape, color) in [(bookmark, coral), (bowl, paper)] {
        context.addPath(shape)
        context.setFillColor(color)
        context.fillPath()
    }
    let image = NSBitmapImageRep(cgImage: context.makeImage()!)
    try image.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent(path))
}
