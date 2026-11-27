/**
 * ConnectX Design System & Theme Engine
 * Exact token replica from ConnectX visual design specification.
 */
export const theme = {
  colors: {
    // Primary Terracotta & Accents
    primary: "var(--acc, #D98B70)",
    primaryHover: "#C4775D",
    primaryLight: "var(--acc2, #FBF3EF)",
    primaryBg: "var(--acc2, #FBF3EF)",
    primaryText: "var(--acc, #D98B70)",

    // Background & Deep Surfaces
    bgApp: "var(--bg, #F5F2ED)",
    bgSidebar: "var(--surf, #FFFFFF)",
    bgCard: "var(--surf, #FFFFFF)",
    bgCardHover: "var(--s2, #FAF8F5)",
    bgInput: "var(--surf, #FFFFFF)",
    bgHeader: "var(--surf, #FFFFFF)",
    bgMessageSent: "var(--me, #D98B70)",
    bgMessageReceived: "var(--s2, #FAF8F5)",

    // Borders & Dividers
    border: "var(--line, #E6E1D8)",
    borderLight: "var(--line, #E6E1D8)",
    borderFocus: "var(--acc, #D98B70)",

    // Typography
    textPrimary: "var(--ink, #252321)",
    textSecondary: "var(--mut, #7A756F)",
    textMuted: "var(--mut, #7A756F)",

    // Semantic Status Colors
    online: "var(--ok, #2E7D32)",
    away: "#F59E0B",
    offline: "var(--mut, #7A756F)",
    danger: "var(--bad, #DC2626)",
    dangerHover: "#B91C1C",
    success: "var(--ok, #2E7D32)",
    signal: "var(--sig, #D98B70)",
  },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    serif: "'Inter Tight', Inter, system-ui, sans-serif",
    brand: "Outfit, Inter, system-ui, sans-serif",
  },
  borderRadius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    full: "9999px",
  },
  shadows: {
    sm: "0 1px 2px rgba(37, 35, 33, 0.05)",
    md: "0 8px 24px -12px rgba(37, 35, 33, 0.15)",
    lg: "0 12px 28px -12px rgba(37, 35, 33, 0.25)",
    glow: "0 0 16px rgba(217, 139, 112, 0.35)",
  },
  transitions: {
    default: "all 0.15s ease",
    smooth: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  breakpoints: {
    mobile: "768px",
    tablet: "1024px",
    desktop: "1280px",
  },
};
