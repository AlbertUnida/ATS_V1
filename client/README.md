# React + TypeScript + Vite

Esta plantilla proporciona una configuración básica para que React funcione en Vite con HMR y algunas reglas de ESLint.
Actualmente, hay dos plugins oficiales disponibles:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) usa [Babel](https://babeljs.io/) para la actualización rápida.
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) usa [SWC](https://swc.rs/) para la actualización rápida.

## Ampliación de la configuración de ESLint

Si está desarrollando una aplicación de producción, le recomendamos actualizar la configuración para habilitar las reglas de lint con reconocimiento de tipos:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Otras Configuraciones...

      // Eliminar tseslint.configs.recommended y reemplazar con esto:
      tseslint.configs.recommendedTypeChecked,
      // Alternativamente, usar esto para reglas más estrictas:
      tseslint.configs.strictTypeChecked,
      // Opcionalmente, agregar esto para reglas de estilo:
      tseslint.configs.stylisticTypeChecked,

      // Otras Configuraciones...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // otras opciones...
    },
  },
])
```

También puedes instalar [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) y [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) para reglas de lint específicas de React:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Habilitar reglas de lint para React
      reactX.configs['recommended-typescript'],
      // Habilitar reglas de lint para React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // otras opciones...
    },
  },
])
```
