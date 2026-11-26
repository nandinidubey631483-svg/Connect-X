/**
 * ConnectX Design System & Theme Engine
 * Exact token replica from ConnectX visual design specification.
 */
export const theme = {
  colors: {
    // Primary Indigo & Accents
    primary: "var(--acc, #4F46E5)",
    primaryHover: "#4338CA",
    primaryLight: "var(--acc2, #EEEDFD)",
    primaryBg: "var(--acc2, #EEEDFD)",
    primaryText: "var(--acc, #4F46E5)",

    // Background & Deep Surfaces
    bgApp: "var(--bg, #F5F4F0)",
    bgSidebar: "var(--surf, #FFFFFF)",
    bgCard: "var(--surf, #FFFFFF)",
    bgCardHover: "var(--s2, #FAF9F6)",
    bgInput: "var(--surf, #FFFFFF)",
    bgHeader: "var(--surf, #FFFFFF)",
    bgMessageSent: "var(--me, #17181F)",
    bgMessageReceived: "var(--s2, #FAF9F6)",

    // Borders & Dividers
    border: "var(--line, #E7E5DF)",
    borderLight: "var(--line, #E7E5DF)",
    borderFocus: "var(--acc, #4F46E5)",

    // Typography
    textPrimary: "var(--ink, #16171C)",
    textSecondary: "var(--mut, #6C6E78)",
    textMuted: "var(--mut, #6C6E78)",

    // Semantic Status Colors
    online: "var(--ok, #15803D)",
    away: "#F59E0B",
    offline: "var(--mut, #6C6E78)",
    danger: "var(--bad, #DC2626)",
    dangerHover: "#B91C1C",
    success: "var(--ok, #15803D)",
    signal: "var(--sig, #FF6A3D)",
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
    sm: "0 1px 2px rgba(20, 20, 30, 0.05)",
    md: "0 8px 24px -12px rgba(20, 20, 30, 0.15)",
    lg: "0 12px 28px -12px rgba(20, 20, 30, 0.25)",
    glow: "0 0 16px rgba(79, 70, 229, 0.35)",
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
