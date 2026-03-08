/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f172a',
        'surface-2': '#1e293b',
        accent: '#6366f1',
        'accent-hover': '#4f46e5',
        danger: '#ef4444',
        success: '#22c55e',
      },
    },
  },
  plugins: [],
};
