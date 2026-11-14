# iOS interface work

Follow the native design brief below for UI changes. When these project-local skills are installed, also use their applicable guidance:

- `../.agents/skills/impeccable/SKILL.md`: native iOS guidance and Operate mode take priority over marketing-page patterns.
- `../.agents/skills/taste-skill/SKILL.md` (skill name `design-taste-frontend`): apply consistent alignment, readable hierarchy, concise copy, and real-content verification. Its website templates, hero animations, photo requirements, and HTML/browser gates do not apply to SwiftUI views.

Keep the existing SwiftUI stack, system typography, SF Symbols, native controls, accessibility, and deployment target. Verify native UI with the iOS build and simulator when available; do not substitute a web checker for native verification.

## Current design brief

The user likes the Today screen. Preserve its visual design and shared components' appearance there. Redesign Schedule and Homework to feel like the same app.

For Schedule, the latest user references supersede the earlier flat-list direction: neutral lesson cards, colored leading markers and type labels (purple laboratory, green lecture, yellow practice), and dots counting distinct lesson times beneath Monday–Saturday dates. The date bar and its selected-date lens use native Liquid Glass, like the tab bar. The selected-date lens stays transparent and neutral; never reintroduce an opaque blue fill. Support light and dark appearances, a system-material fallback on older iOS, and Reduce Transparency. Keep long titles full-width; move language/subgroup metadata out of the title and keep subgroup numbers together. Use real available data; the current API omits teacher names. Homework retains the quiet grouped-list design. Preserve all existing interactions and data. Keep the original native tab bar and SF Symbols (`clock`, `calendar`, `checklist`), not the references' unrelated navigation destinations.

The user has authorized implementation of the revised concept with these corrections. Preserve the Today layout; its colors may follow the requested neutral palette.

Schedule refinement: keep a single custom header, with the date selector and an actions menu; keep week arrows beside the dates. Use a 16pt page margin, 16pt card padding plus the 4pt marker inset, 8pt card gaps, and 14pt card corners. The native SF hierarchy is 17pt semibold for subjects, 14pt regular for times/rooms, and 12pt medium for type labels; scale these through Dynamic Type. Do not reintroduce a second navigation heading or a large Today pill above the calendar.

Homework interaction: adding from a lesson's context menu opens direct text entry pinned to that exact lesson ID and date, including past lessons. It must not show subject/date selection or start in AI mode. Global add retains manual/AI selection. Pass contextual presentation as one identifiable request; initialize editor state once rather than resetting it on appearance. Never silently redirect a pinned assignment to another lesson, and preserve entered text across navigation and recoverable errors.

Settings live in the Schedule actions menu. Persist system/light/dark theme, accent color, animation enablement and lesson dots. System theme and graphite accent are the defaults. Accent colors apply to controls across tabs while lesson-type colors retain their meaning and the selected-date glass lens stays neutral. Keep demo preferences separate from real user preferences.

The date selector uses one persistent glass lens moving behind stationary labels. Support tap and horizontal scrubbing, with a spring settle and no spatial animation when motion is reduced or disabled. Preserve horizontal scrolling in the narrow/accessibility fallback. The Today hero keeps its layout and white text, but its background follows a deep, high-contrast shade of the selected accent.
