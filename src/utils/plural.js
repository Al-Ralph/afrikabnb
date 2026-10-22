// Remplace {nom} par vars.nom dans un texte traduit.
export function interpolate(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Texte pluralisé selon Intl.PluralRules : cherche `${key}.${catégorie}` (one, other…)
// puis `${key}.other` ; {n} est remplacé par le nombre.
export function pluralize(t, language, key, n) {
  const category = new Intl.PluralRules(language).select(n);
  let text = t(`${key}.${category}`);
  if (text === `${key}.${category}`) text = t(`${key}.other`);
  return interpolate(text, { n });
}
