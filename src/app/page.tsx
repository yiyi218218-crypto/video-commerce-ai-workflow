import { Workbench } from "../components/workbench";
import { MetricsService } from "../services/metrics/metrics-service.js";
import { samplePerformanceInput } from "../web/sample-performance.js";

export default function HomePage() {
  const initialSnapshot = new MetricsService().calculate(
    samplePerformanceInput,
  );

  return (
    <Workbench
      initialInput={samplePerformanceInput}
      initialSnapshot={initialSnapshot}
    />
  );
}
