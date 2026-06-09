import fs from 'node:fs';
import path from 'node:path';
import type { Config } from 'tailwindcss';

const DESIGN_TOKEN_FILE = path.join(process.cwd(), 'src', 'assets', 'styles', 'tokens.css');

export const designTokenLayer = fs.readFileSync(DESIGN_TOKEN_FILE, 'utf8');

export default {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bridge: {
          ink: 'var(--pb-text)',
          soft: 'var(--pb-text-soft)',
          subtle: 'var(--pb-text-subtle)',
          bg: 'var(--pb-bg)',
          accent: 'var(--pb-accent)',
          success: 'var(--pb-success)',
          warning: 'var(--pb-warning)',
          danger: 'var(--pb-danger)',
          surface: 'var(--pb-surface)',
        },
      },
      borderRadius: {
        bridge: '0.5rem',
      },
      boxShadow: {
        bridge: 'var(--pb-shadow)',
        'bridge-soft': 'var(--pb-shadow-soft)',
      },
      fontFamily: {
        sans: 'var(--pb-font-sans)',
        display: 'var(--pb-font-display)',
      },
    },
  },
  plugins: [],
} satisfies Config;
