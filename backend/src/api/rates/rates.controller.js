import * as ratesService from "../../services/rates.js";

// Données publiques, identiques pour tous : cache navigateur / proxy 1 h.
export async function getRates(req, res, next) {
  try {
    const data = await ratesService.getRates();
    res.set("Cache-Control", "public, max-age=3600");
    res.json(data);
  } catch (err) {
    next(err);
  }
}
