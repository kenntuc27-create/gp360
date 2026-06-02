import { useMemo } from "react";

export function Sparkline({
  data,
  width = 80,
  height = 28,
  stroke = "currentColor",
  fill = "currentColor",
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
}) {
  const { path, area } = useMemo(() => {
    if (!data.length) return { path: "", area: "" };
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = data.length > 1 ? width / (data.length - 1) : width;
    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return [x, y] as const;
    });
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${path} L${width},${height} L0,${height} Z`;
    return { path, area };
  }, [data, width, height]);

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <path d={area} fill={fill} fillOpacity={0.15} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
