/**
 * The palette is intentionally small and semantic. Components never name a hue —
 * they name a role (surface, line, ink, danger), and the theme decides the hue.
 * That is what makes light mode work without a single `dark:` variant.
 *
 * Colour carries meaning here: ok / warn / danger report service state, accent marks
 * the interactive path. Everything structural is neutral.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: '#000',
      white: '#fff',

      // Structure, back to front.
      canvas: token('canvas'),
      surface: token('surface'),
      raised: token('raised'),
      sunken: token('sunken'),

      // Hairlines.
      line: token('line'),
      'line-strong': token('line-strong'),

      // Text, most to least prominent.
      ink: token('ink'),
      muted: token('muted'),
      faint: token('faint'),

      // Meaning.
      accent: token('accent'),
      'accent-ink': token('accent-ink'),
      ok: token('ok'),
      warn: token('warn'),
      danger: token('danger')
    },
    borderRadius: {
      none: '0',
      // Two steps only: controls, then containers.
      DEFAULT: '5px',
      md: '5px',
      lg: '8px',
      full: '9999px'
    },
    fontSize: {
      // A four-step scale. Anything outside it is a mistake, not a decision.
      meta: ['11px', { lineHeight: '16px' }],
      xs: ['12px', { lineHeight: '17px' }],
      sm: ['13px', { lineHeight: '19px' }],
      base: ['15px', { lineHeight: '22px' }],
      lg: ['18px', { lineHeight: '26px' }]
    },
    extend: {
      fontFamily: {
        // Installed fonts only. This app must render identically offline.
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif'
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace'
        ]
      },
      boxShadow: {
        panel: '0 1px 2px rgb(0 0 0 / 0.04), 0 12px 32px -8px rgb(0 0 0 / 0.22)',
        pop: '0 1px 2px rgb(0 0 0 / 0.06), 0 6px 16px -4px rgb(0 0 0 / 0.20)'
      },
      transitionDuration: {
        DEFAULT: '120ms'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'panel-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.995)' },
          to: { opacity: '1', transform: 'none' }
        }
      },
      animation: {
        // Entrances only. Nothing in this UI pulses, pings, or breathes for decoration.
        'fade-in': 'fade-in 100ms ease-out',
        'panel-in': 'panel-in 140ms cubic-bezier(0.2, 0.8, 0.3, 1)'
      }
    }
  },
  plugins: []
};
