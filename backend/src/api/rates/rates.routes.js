import { Router } from "express";
import * as ratesController from "./rates.controller.js";

const router = Router();

// GET /api/rates -> { base: "XOF", rates: { EUR, USD, … }, updatedAt, source }
router.get("/", ratesController.getRates);

export default router;
