/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        h2: '#2563eb',
        hot: '#dc2626',
        cold: '#0891b2',
      },
    },
  },
  plugins: [],
};
