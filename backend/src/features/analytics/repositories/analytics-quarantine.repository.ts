import AnalyticsQuarantine, {
  type IAnalyticsQuarantine,
} from "../models/AnalyticsQuarantine";

export class AnalyticsQuarantineRepository {
  async insertMany(docs: IAnalyticsQuarantine[]): Promise<void> {
    await AnalyticsQuarantine.insertMany(docs, { ordered: true });
  }
}

export const analyticsQuarantineRepository =
  new AnalyticsQuarantineRepository();
