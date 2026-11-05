// Tailwind v3 config for DietPal. Rebuild app.css after changing classes in index.html / app.js:
//   npx tailwindcss@3 -i src/app.input.css -o app.css --minify
module.exports = {
  content: ['./index.html', './app.js', './foods.js'],
  safelist: [{ pattern: /^grid-cols-[1-6]$/ }],   // segmented controls build `grid-cols-${n}` at runtime
  theme: {
    extend: {
      fontFamily: { sans: ['"Nunito Sans"', 'system-ui', 'sans-serif'], heading: ['Nunito', '"Nunito Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50:'#eef5ef',100:'#e4efe5',200:'#c9dfcc',500:'#2f8a60',600:'#24764f',700:'#1e6b4a',800:'#1e4d37',900:'#163a2a' },
        veg: '#6ba539', pro: '#e0573f', carb: '#e9b21c', water: '#5baee0',
        cream: '#fbf7ee', paper: '#fffdf7', sand: '#f1eadb', line: '#eadfcb', ink: '#1b2a22', mute: '#65705e'
      },
      boxShadow: { card: '0 1px 2px rgba(60,45,20,.04), 0 6px 20px rgba(60,45,20,.05)', float: '0 8px 28px rgba(27,42,34,.14)' }
    }
  }
};
