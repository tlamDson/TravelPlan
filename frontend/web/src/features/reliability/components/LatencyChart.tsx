import type { LatencyStats } from "@travelplan/shared";
import { SLO_LATENCY_THRESHOLD_MS } from "@travelplan/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { useChartColors } from "../lib/chart-colors";

interface LatencyChartProps {
  queueWaitMs: LatencyStats;
  processingMs: LatencyStats;
  endToEndMs: LatencyStats;
}

interface Row {
  stage: string;
  p50: number;
  p95: number;
  p99: number;
}

export function LatencyChart({
  queueWaitMs,
  processingMs,
  endToEndMs,
}: LatencyChartProps) {
  const { t } = useTranslationStore();
  const colors = useChartColors();

  const rows: Row[] = [
    {
      stage: t("reliability.latency.queueWait"),
      p50: queueWaitMs.p50,
      p95: queueWaitMs.p95,
      p99: queueWaitMs.p99,
    },
    {
      stage: t("reliability.latency.processing"),
      p50: processingMs.p50,
      p95: processingMs.p95,
      p99: processingMs.p99,
    },
    {
      stage: t("reliability.latency.endToEnd"),
      p50: endToEndMs.p50,
      p95: endToEndMs.p95,
      p99: endToEndMs.p99,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reliability.latency.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("reliability.latency.subtitle")}
        </p>
        <p className="text-xs" style={{ color: colors.statusWarning }}>
          {t("reliability.latency.thresholdLabel")}
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barGap={4}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={colors.grid}
                vertical={false}
              />
              <XAxis dataKey="stage" stroke={colors.axis} tickLine={false} />
              <YAxis
                stroke={colors.axis}
                tickLine={false}
                tickFormatter={(value: number) =>
                  `${(value / 1000).toFixed(0)}s`
                }
              />
              <Tooltip
                formatter={(value: number | string | undefined) =>
                  `${(Number(value ?? 0) / 1000).toFixed(1)}s`
                }
              />
              <Legend />
              <ReferenceLine
                y={SLO_LATENCY_THRESHOLD_MS}
                stroke={colors.statusWarning}
                strokeDasharray="4 4"
                label={{
                  value: t("reliability.latency.thresholdLabel"),
                  position: "insideTopRight",
                  fill: colors.statusWarning,
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="p50"
                name="p50"
                fill={colors.seriesQueueWait}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="p95"
                name="p95"
                fill={colors.seriesProcessing}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="p99"
                name="p99"
                fill={colors.seriesEndToEnd}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table view — the chart's data restated as text, per the dataviz
            accessibility pass (never SVG-only). Visually hidden, not
            display:none, so screen readers still reach it. */}
        <table className="sr-only">
          <caption>{t("reliability.latency.title")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("reliability.latency.title")}</th>
              <th scope="col">p50</th>
              <th scope="col">p95</th>
              <th scope="col">p99</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stage}>
                <th scope="row">{row.stage}</th>
                <td>{row.p50}ms</td>
                <td>{row.p95}ms</td>
                <td>{row.p99}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
