import type { LineSeries, SimpleLineChart } from "@/components/charts/simple-line-chart";

const colors = ["#1d4ed8", "#b45309"];
const number = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Fixed SVG coordinates keep printed forecasts independent of viewport resizing. */
export function PrintForecast({ title, data, series, domain }: {
  title: string;
  data: Parameters<typeof SimpleLineChart>[0]["data"];
  series: LineSeries[];
  domain?: [number, number];
}) {
  const values = data.flatMap((row) => series.map((line) => Number(row[line.key])));
  const min = domain?.[0] ?? Math.min(0, ...values);
  const max = domain?.[1] ?? Math.max(1, ...values);
  const x = (i: number) => 55 + (i / Math.max(1, data.length - 1)) * 430;
  const y = (value: number) => 170 - ((value - min) / Math.max(1, max - min)) * 145;
  return (
    <svg className="report-print-chart hidden w-full" viewBox="0 0 510 220" role="img" aria-label={title}>
      {[0, 0.5, 1].map((fraction) => {
        const value = min + (max - min) * fraction;
        return (
          <g key={fraction}>
            <line x1="55" x2="485" y1={y(value)} y2={y(value)} stroke="#ddd" />
            <text x="50" y={y(value) + 4} textAnchor="end" fontSize="11" fill="#333">{number.format(value)}</text>
          </g>
        );
      })}
      {series.map((line, index) => (
        <g key={line.key}>
          <polyline points={data.map((row, i) => `${x(i)},${y(Number(row[line.key]))}`).join(" ")}
            fill="none" stroke={colors[index % colors.length]} strokeWidth="2" strokeDasharray={line.dashed ? "5 4" : undefined} />
          {data.map((row, i) => (
            <circle key={i} cx={x(i)} cy={y(Number(row[line.key]))} r="2.5" fill={colors[index % colors.length]} />
          ))}
          <text x={55 + index * 200} y="212" fontSize="12" fill={colors[index % colors.length]}>{line.label}</text>
        </g>
      ))}
      {data.filter((_, i) => i === 0 || i === data.length - 1 || i % Math.max(1, Math.ceil(data.length / 6)) === 0).map((row) => (
        <text key={String(row.year)} x={x(data.indexOf(row))} y="190" textAnchor="middle" fontSize="11" fill="#333">{row.year}</text>
      ))}
    </svg>
  );
}
