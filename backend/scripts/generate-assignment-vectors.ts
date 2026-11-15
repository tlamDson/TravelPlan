/**
 * Writes packages/shared/fixtures/assignment-vectors.json (B2 plan, PR 6).
 * Run after any change to the assignment algorithm or the vector set:
 *   npm run generate:assignment-vectors -w backend
 * assignment-vectors.test.ts fails until the committed file matches.
 */
import { writeFileSync } from "node:fs";
import {
  ASSIGNMENT_VECTORS_PATH,
  buildAssignmentVectors,
  serializeAssignmentVectors,
} from "../src/features/experiments/vectors/assignment-vectors";

const vectors = buildAssignmentVectors();
writeFileSync(
  ASSIGNMENT_VECTORS_PATH,
  serializeAssignmentVectors(vectors),
  "utf8",
);
process.stdout.write(
  `Wrote ${vectors.length} vectors to ${ASSIGNMENT_VECTORS_PATH}\n`,
);
