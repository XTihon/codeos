/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg:             '#1C1410',
        surface:        '#261C14',
        'surface-2':    '#30231A',
        border:         '#4A3428',
        'border-hover': '#6B4C38',
        accent:         '#E8693A',
        'accent-hover': '#F07848',
        'accent-muted': '#E8693A33',
        success:        '#5CB87A',
        warning:        '#F5A623',
        danger:         '#E85C4A',
        muted:          '#8B7060',
        'text-base':    '#F0E0CC',
        'text-dim':     '#C4A882',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'warm': '0 2px 12px rgba(232, 105, 58, 0.12)',
        'warm-lg': '0 8px 32px rgba(232, 105, 58, 0.18)',
      }
    }
  },
  plugins: []
}
