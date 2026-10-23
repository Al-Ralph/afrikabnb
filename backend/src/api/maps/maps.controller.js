import axios from "axios";
import * as mapsService from "../../services/maps.js";

function upstreamError(err, req, res, next) {
  if (axios.isAxiosError(err)) {
    req.log.warn(`[maps] Nominatim indisponible : ${err.code || err.response?.status || err.message}`);
    return res.status(502).json({ error: "Service de géocodage indisponible" });
  }
  next(err);
}

export async function geocode(req, res, next) {
  try {
    const { address, limit } = req.query;
    res.json({ results: await mapsService.geocode({ address, limit }) });
  } catch (err) {
    upstreamError(err, req, res, next);
  }
}

export async function reverseGeocode(req, res, next) {
  try {
    const { lat, lon } = req.query;
    res.json(await mapsService.reverseGeocode({ lat, lon }));
  } catch (err) {
    upstreamError(err, req, res, next);
  }
}

export async function listingsInBounds(req, res, next) {
  try {
    res.json({ data: await mapsService.listingsInBounds(req.query) });
  } catch (err) {
    next(err);
  }
}
