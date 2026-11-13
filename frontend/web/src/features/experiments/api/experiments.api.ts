import {
  experimentAssignmentsResponseSchema,
  experimentExposureResponseSchema,
  type ExperimentAssignment,
  type ExperimentExposureRequest,
  type ExperimentExposureResponse,
} from "@travelplan/shared";
import { apiClient } from "@/lib/axios";

/** The signed-in user's variants in every running experiment. */
export async function getExperimentAssignments(): Promise<
  ExperimentAssignment[]
> {
  const response = await apiClient.get("/experiments/assignments");
  return experimentAssignmentsResponseSchema.parse(response.data).assignments;
}

/** Logs that a variant rendered; the server decides which variant. */
export async function postExperimentExposure(
  body: ExperimentExposureRequest,
): Promise<ExperimentExposureResponse> {
  const response = await apiClient.post("/experiments/exposures", body);
  return experimentExposureResponseSchema.parse(response.data);
}
