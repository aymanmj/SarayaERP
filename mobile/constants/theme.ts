export const COLORS = {
  primary: '#0d9488', // Teal 600 (Luxurious medical emerald/teal)
  primaryLight: '#2dd4bf', // Teal 400
  primaryDark: '#0f766e', // Teal 700
  secondary: '#4f46e5', // Indigo 600 (Modern accent color)
  secondaryLight: '#818cf8', // Indigo 400
  background: '#0b0f19', // Deepest dark slate background
  surface: '#151f32', // Rich dark slate card background
  text: '#ffffff', // White rich typography for readability
  textLight: '#cbd5e1', // Slate 300
  textMuted: '#64748b', // Slate 500
  border: 'rgba(255, 255, 255, 0.08)', // Soft dark border
  error: '#f43f5e', // Rose 500 (Clinical critical value red)
  success: '#10b981', // Emerald 500 (Clean success green)
  warning: '#f59e0b', // Amber 500 (Attention warning)
  info: '#3b82f6', // Blue 500
  darkBackground: '#0b0f19', // Deepest dark slate
  darkSurface: '#151f32', // Rich dark slate card background
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
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 28,
  round: 9999,
};

export const SHADOWS = {
  small: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  medium: {
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  large: {
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
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
