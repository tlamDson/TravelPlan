import { Router } from "express";
import { requireUserAuth } from "../../middlewares/auth";
import {
  getExperimentAssignments,
  postExperimentExposure,
} from "./controllers/experiments.controller";

const router = Router();

router.get("/assignments", requireUserAuth, getExperimentAssignments);
router.post("/exposures", requireUserAuth, postExperimentExposure);

export default router;
