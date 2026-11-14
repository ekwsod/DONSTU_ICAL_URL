import UIKit

/// Keep UIKit's tracking, liquid lens and accessibility actions intact.
final class ScheduleSegmentedControl: UISegmentedControl {
    var dateIdentifiers: [String] = []
    var dateLabels: [String] = []
    var dateValues: [String] = []

    override func layoutSubviews() {
        super.layoutSubviews()
        guard accessibilityElementCount() == dateIdentifiers.count else { return }
        for index in dateIdentifiers.indices {
            guard let element = accessibilityElement(at: index) as? NSObject else { continue }
            (element as? UIAccessibilityIdentification)?.accessibilityIdentifier = dateIdentifiers[index]
            element.accessibilityLabel = dateLabels[index]
            element.accessibilityValue = dateValues[index]
        }
    }
}
