import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

// Équivalent de l'ancienne config "react-app" de CRA (eslint-config-react-app) :
// règles JS recommandées + sélection React / hooks / accessibilité JSX de react-app.
const reactAppRules = {
  "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],

  "react/jsx-uses-react": "warn",
  "react/jsx-uses-vars": "warn",
  "react/jsx-no-comment-textnodes": "warn",
  "react/jsx-no-duplicate-props": "warn",
  "react/jsx-no-target-blank": "warn",
  "react/jsx-no-undef": "error",
  "react/jsx-pascal-case": ["warn", { allowAllCaps: true, ignore: [] }],
  "react/no-danger-with-children": "warn",
  "react/no-direct-mutation-state": "warn",
  "react/no-is-mounted": "warn",
  "react/no-typos": "error",
  "react/require-render-return": "error",
  "react/style-prop-object": "warn",

  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn",

  "jsx-a11y/alt-text": "warn",
  "jsx-a11y/anchor-has-content": "warn",
  "jsx-a11y/anchor-is-valid": ["warn", { aspects: ["noHref", "invalidHref"] }],
  "jsx-a11y/aria-activedescendant-has-tabindex": "warn",
  "jsx-a11y/aria-props": "warn",
  "jsx-a11y/aria-proptypes": "warn",
  "jsx-a11y/aria-role": ["warn", { ignoreNonDOM: true }],
  "jsx-a11y/aria-unsupported-elements": "warn",
  "jsx-a11y/heading-has-content": "warn",
  "jsx-a11y/iframe-has-title": "warn",
  "jsx-a11y/img-redundant-alt": "warn",
  "jsx-a11y/no-access-key": "warn",
  "jsx-a11y/no-distracting-elements": "warn",
  "jsx-a11y/no-redundant-roles": "warn",
  "jsx-a11y/role-has-required-aria-props": "warn",
  "jsx-a11y/role-supports-aria-props": "warn",
  "jsx-a11y/scope": "warn",
};

export default [
  { ignores: ["build/**", "coverage/**", "playwright-report/**", "test-results/**", "blob-report/**"] },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: "detect" } },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactAppRules,
    },
  },
  {
    // Tests Vitest (globals: true) exécutés sous Node + jsdom.
    files: ["src/**/*.test.{js,jsx}", "src/setupTests.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
    },
  },
  {
    // Tests de bout en bout Playwright (Node ; les callbacks de page.evaluate s'exécutent dans le navigateur).
    files: ["e2e/**/*.js", "playwright.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
      // Les fixtures Playwright sans dépendance s'écrivent `async ({}, use) => …`.
      "no-empty-pattern": "off",
    },
  },
];
