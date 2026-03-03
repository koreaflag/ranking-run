import ClockKit
import SwiftUI

/// Provides Watch face complications for RUNVS.
/// Registering a CLKComplicationDataSource gives the app its own
/// settings section in the iPhone Watch companion app (like Nike Run Club).
class ComplicationController: NSObject, CLKComplicationDataSource {

    // MARK: - Complication Configuration

    func getComplicationDescriptors(handler: @escaping ([CLKComplicationDescriptor]) -> Void) {
        let descriptors = [
            CLKComplicationDescriptor(
                identifier: "runvs_shortcut",
                displayName: "RUNVS",
                supportedFamilies: [
                    .graphicCircular,
                    .graphicCorner,
                    .graphicBezel,
                    .graphicRectangular,
                    .graphicExtraLarge,
                    .modularSmall,
                    .utilitarianSmall,
                    .utilitarianSmallFlat,
                    .circularSmall
                ]
            )
        ]
        handler(descriptors)
    }

    // MARK: - Timeline Configuration

    func getTimelineEndDate(for complication: CLKComplication, withHandler handler: @escaping (Date?) -> Void) {
        handler(nil)
    }

    func getPrivacyBehavior(for complication: CLKComplication, withHandler handler: @escaping (CLKComplicationPrivacyBehavior) -> Void) {
        handler(.showOnLockScreen)
    }

    // MARK: - Timeline Population

    func getCurrentTimelineEntry(for complication: CLKComplication, withHandler handler: @escaping (CLKComplicationTimelineEntry?) -> Void) {
        handler(makeEntry(for: complication, date: Date()))
    }

    func getTimelineEntries(for complication: CLKComplication, after date: Date, limit: Int, withHandler handler: @escaping ([CLKComplicationTimelineEntry]?) -> Void) {
        handler(nil)
    }

    // MARK: - Placeholder / Preview

    func getLocalizableSampleTemplate(for complication: CLKComplication, withHandler handler: @escaping (CLKComplicationTemplate?) -> Void) {
        handler(makeTemplate(for: complication))
    }

    // MARK: - Template Builders

    private func makeEntry(for complication: CLKComplication, date: Date) -> CLKComplicationTimelineEntry? {
        guard let template = makeTemplate(for: complication) else { return nil }
        return CLKComplicationTimelineEntry(date: date, complicationTemplate: template)
    }

    private func makeTemplate(for complication: CLKComplication) -> CLKComplicationTemplate? {
        switch complication.family {

        case .graphicCircular:
            let template = CLKComplicationTemplateGraphicCircularStackText(
                line1TextProvider: CLKSimpleTextProvider(text: "RUN"),
                line2TextProvider: CLKSimpleTextProvider(text: "VS")
            )
            return template

        case .graphicCorner:
            let template = CLKComplicationTemplateGraphicCornerStackText(
                innerTextProvider: CLKSimpleTextProvider(text: "RUNVS"),
                outerTextProvider: CLKSimpleTextProvider(text: "RUN")
            )
            return template

        case .graphicRectangular:
            let template = CLKComplicationTemplateGraphicRectangularStandardBody(
                headerTextProvider: CLKSimpleTextProvider(text: "RUNVS"),
                body1TextProvider: CLKSimpleTextProvider(text: "탭하여 러닝 시작")
            )
            return template

        case .modularSmall:
            let template = CLKComplicationTemplateModularSmallSimpleText(
                textProvider: CLKSimpleTextProvider(text: "RUN")
            )
            return template

        case .utilitarianSmall, .utilitarianSmallFlat:
            let template = CLKComplicationTemplateUtilitarianSmallFlat(
                textProvider: CLKSimpleTextProvider(text: "RUNVS")
            )
            return template

        case .circularSmall:
            let template = CLKComplicationTemplateCircularSmallSimpleText(
                textProvider: CLKSimpleTextProvider(text: "RUN")
            )
            return template

        default:
            return nil
        }
    }

}
