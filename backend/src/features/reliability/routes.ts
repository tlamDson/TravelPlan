import { Router } from "express";
import { getSloReport } from "./controllers/reliability.controller";
import { requireUserAuth } from "../../middlewares/auth";

const router = Router();

router.get("/slo", requireUserAuth, getSloReport);

export default router;
