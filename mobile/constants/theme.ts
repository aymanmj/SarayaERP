export const COLORS = {
  primary: '#0284c7', // Sky 600
  primaryLight: '#38bdf8', // Sky 400
  primaryDark: '#0369a1', // Sky 700
  secondary: '#0ea5e9', // Sky 500
  background: '#f8fafc', // Slate 50
  surface: '#ffffff', // White
  text: '#1e293b', // Slate 800
  textLight: '#64748b', // Slate 500
  textMuted: '#94a3b8', // Slate 400
  border: '#e2e8f0', // Slate 200
  error: '#ef4444', // Red 500
  success: '#22c55e', // Green 500
  warning: '#eab308', // Yellow 500
  info: '#3b82f6', // Blue 500
  darkBackground: '#0f172a', // Slate 900
  darkSurface: '#1e293b', // Slate 800
};

export const SIZES = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  round: 9999,
};

export const SHADOWS = {
  small: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const theme = {
  colors: COLORS,
  sizes: SIZES,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS,
};

export default theme;
