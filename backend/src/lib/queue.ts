import { Queue, QueueOptions, Worker, WorkerOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";
import { logger } from "./logger";
import { buildRedisConnectionOptions } from "./redis-options";

const connectionBase = buildRedisConnectionOptions(env);

const connection = {
  ...connectionBase,
  maxRetriesPerRequest: null,
};

export const createQueue = (
  name: string,
  options?: Omit<QueueOptions, "connection">,
) => {
  return new Queue(name, {
    connection,
    ...options,
  });
};

export const createWorker = (
  name: string,
  processor: any,
  options?: Omit<WorkerOptions, "connection">,
) => {
  return new Worker(name, processor, {
    connection,
    ...options,
  });
};

export const redisConnection = new IORedis(connectionBase);

redisConnection.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redisConnection.on("connect", () => {
  logger.info(
    { redisHost: connectionBase.host, redisPort: connectionBase.port },
    "Redis connected",
  );
});
