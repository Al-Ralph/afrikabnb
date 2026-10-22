// Valide req[source] avec un schéma zod et remplace la valeur par la version parsée.
// Les ZodError sont transmises au errorHandler (réponse 400 avec détails).
export const validate = (schema, source = "body") => (req, res, next) => {
  let input = req[source] ?? {};
  if (source === "query") {
    // Un paramètre de query vide (?minPrice=) est traité comme absent.
    input = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== ""));
  }
  const result = schema.safeParse(input);
  if (!result.success) return next(result.error);
  req[source] = result.data;
  next();
};
