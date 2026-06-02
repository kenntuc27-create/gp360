import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type PeriodKey = "hoje" | "7d" | "30d" | "mes" | "ano" | "personalizado";

export interface PeriodRange {
  key: PeriodKey;
  start: Date;
  end: Date;
}

export function getPeriodRange(key: PeriodKey, customStart?: string, customEnd?: string): PeriodRange {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  switch (key) {
    case "hoje": break;
    case "7d": start.setDate(start.getDate() - 6); break;
    case "30d": start.setDate(start.getDate() - 29); break;
    case "mes": start.setDate(1); break;
    case "ano": start.setMonth(0, 1); break;
    case "personalizado":
      if (customStart) start.setTime(new Date(customStart).getTime());
      if (customEnd) { const e = new Date(customEnd); e.setHours(23, 59, 59, 999); end.setTime(e.getTime()); }
      break;
  }
  return { key, start, end };
}

interface Props {
  value: PeriodKey;
  onChange: (v: PeriodKey, customStart?: string, customEnd?: string) => void;
}

export function PeriodFilter({ value, onChange }: Props) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v) => onChange(v as PeriodKey, start, end)}>
        <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="hoje">Hoje</SelectItem>
          <SelectItem value="7d">Últimos 7 dias</SelectItem>
          <SelectItem value="30d">Últimos 30 dias</SelectItem>
          <SelectItem value="mes">Este mês</SelectItem>
          <SelectItem value="ano">Este ano</SelectItem>
          <SelectItem value="personalizado">Personalizado</SelectItem>
        </SelectContent>
      </Select>
      {value === "personalizado" && (
        <>
          <Input type="date" value={start} className="h-9 w-36"
            onChange={(e) => { setStart(e.target.value); onChange("personalizado", e.target.value, end); }} />
          <Input type="date" value={end} className="h-9 w-36"
            onChange={(e) => { setEnd(e.target.value); onChange("personalizado", start, e.target.value); }} />
        </>
      )}
    </div>
  );
}
