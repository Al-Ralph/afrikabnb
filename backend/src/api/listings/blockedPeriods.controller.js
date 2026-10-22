import * as blockedPeriodsService from "../../services/blockedPeriods.js";
import { formatDay } from "../../utils/booking.js";

// Vue propriétaire (avec la raison, privée).
export function blockedPeriodToJson(p) {
  return {
    id: p.id,
    listingId: p.listingId,
    startDate: formatDay(p.startDate),
    endDate: formatDay(p.endDate),
    reason: p.reason,
    createdAt: p.createdAt,
  };
}

// GET /api/listings/:id/blocked-periods (propriétaire) : périodes en cours ou à venir par défaut.
export async function list(req, res, next) {
  try {
    const periods = await blockedPeriodsService.listBlockedPeriods({
      listingId: req.params.id,
      userId: req.user.id,
      from: req.query.from,
    });
    res.json({ data: periods.map(blockedPeriodToJson) });
  } catch (err) {
    next(err);
  }
}

// POST /api/listings/:id/blocked-periods { startDate, endDate, reason? } -> 201
// 409 si la période chevauche une réservation bloquante.
export async function create(req, res, next) {
  try {
    const { startDate, endDate, reason } = req.body;
    const period = await blockedPeriodsService.createBlockedPeriod({
      listingId: req.params.id,
      userId: req.user.id,
      startDate,
      endDate,
      reason,
    });
    res.status(201).json(blockedPeriodToJson(period));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/listings/:id/blocked-periods/:periodId -> 204
export async function remove(req, res, next) {
  try {
    await blockedPeriodsService.removeBlockedPeriod({
      listingId: req.params.id,
      periodId: req.params.periodId,
      userId: req.user.id,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
