/loop Audit and improve the entire Admin Page.

Do not completely redesign the admin page by default. First inspect the existing implementation, understand its current design system, layout, components, features, and working functionality.

Preserve the current visual identity and structure whenever they are already effective. Decide carefully whether each element, section, component, or layout actually needs to be changed. Only modify, replace, move, remove, or redesign parts that have clear usability, consistency, responsiveness, accessibility, or functionality issues.

The goal is to refine and improve the existing admin page—not rebuild it unnecessarily.

Audit the following areas:

* Overall layout and information hierarchy
* Sidebar and navigation structure
* Header and page controls
* Spacing, alignment, sizing, and visual balance
* Typography and readability
* Cards, tables, forms, buttons, badges, tabs, and modals
* Responsive behavior across desktop, tablet, and mobile
* Accessibility, focus states, labels, and contrast
* Empty, loading, success, warning, and error states
* User workflows and placement of important actions
* Consistency between pages and reusable components
* Performance and duplicated UI code
* Security-sensitive admin actions

When reviewing each area:

1. Keep it unchanged if it already works well.
2. Refine it if only small improvements are needed.
3. Restructure it if the current layout causes confusion or inefficiency.
4. Redesign only the specific element or section when the existing approach is clearly weak.
5. Avoid changing working components purely for visual preference.

The final interface should feel professional, modern, clean, organized, and suitable for production use. Avoid clutter, oversized components, unnecessary gradients, excessive animations, and decorative effects that reduce usability.

Evaluate whether the admin page needs any of these essential features based on the actual project:

* Clear sidebar navigation with active states and logical grouping
* Page header with title, search, notifications, profile menu, and relevant quick actions
* Dashboard summaries, alerts, recent activity, and system status
* Search, sorting, filters, pagination, and date ranges
* User and role management
* Role-based access control
* Audit logs and administrator activity history
* Announcements and notification management
* System, security, integration, payment, subscription, and email settings
* Confirmation dialogs for destructive actions
* Form validation and clear feedback messages
* Export options for relevant data
* Empty, loading, and error states
* Responsive tables or mobile-friendly alternatives
* Optional dark mode only when consistent with the current project

Do not add every possible feature automatically. Add only features that are useful, relevant, and justified by the project’s purpose.

Use the existing design language where possible. Reuse current colors, typography, components, and patterns unless they are inconsistent or causing usability problems. Build reusable components when improvement is needed and avoid duplicated UI code.

After each improvement cycle:

1. Review the admin page as a strict UI/UX and functionality critic.
2. Identify remaining high-priority issues.
3. Decide whether each issue requires no change, a minor refinement, a layout adjustment, or a targeted redesign.
4. Apply only justified changes.
5. Recheck responsiveness, accessibility, consistency, and working interactions.
6. Repeat until no major issues remain.

Do not only provide recommendations. Inspect the current implementation and apply the improvements directly.

Preserve all working functionality unless a change is required to fix or improve it. Test all affected buttons, navigation, forms, filters, tables, modals, and admin actions.

At the end, provide a concise summary containing:

* Elements that were preserved
* Elements that were refined
* Elements that were restructured or redesigned
* Essential features added
* Issues fixed
* Files modified
* Remaining limitations or recommendations
