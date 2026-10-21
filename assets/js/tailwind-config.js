// Tema de Tailwind compartido por todas las páginas. Debe cargarse como
// <script> clásico justo después del CDN de Tailwind (no como módulo ni vía
// fetch), para que la configuración exista antes de que se generen los estilos.
//
// Paleta tomada del logo de Universidad Fleming IMIFLE (azul #001590) y, como
// acento puntual, del rojo de red CONOCER (#E01C26).
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#001590",
        "primary-hover": "#000F6B",
        secondary: "#2C4FC7",
        "brand-dark": "#000B4D",
        // Para resaltar texto sobre fondos brand-dark, donde primary no se lee.
        "brand-light": "#A9B8FF",
        accent: "#E01C26",
        "background-light": "#F9FAFB",
        "background-dark": "#111827",
        "surface-light": "#FFFFFF",
        "surface-dark": "#1F2937",
        "text-light": "#1F2937",
        "text-dark": "#F3F4F6",
        "secondary-text-light": "#4B5563",
        "secondary-text-dark": "#9CA3AF",
      },
      fontFamily: {
        display: ["Montserrat", "sans-serif"],
        body: ["Montserrat", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(0, 0, 0, 0.1)",
        glow: "0 0 15px rgba(0, 21, 144, 0.3)",
      },
    },
  },
};
