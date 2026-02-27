/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                darkBg: '#0f172a',    // Cinematic dark background
                panelBg: '#1e293b',   // Slightly lighter for cards/panels
                neonAccent: '#38bdf8',// Bright accent color
            },
            screens: {
                'xs': '480px',
                '3xl': '1920px',
            },
            transitionProperty: {
                'height': 'height',
                'spacing': 'margin, padding',
            }
        },
    },
    plugins: [],
}
