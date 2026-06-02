import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type BidStatus = "all" | "ganha" | "perdida" | "em_andamento" | "cancelada";

interface Props {
  value: BidStatus;
  onChange: (v: BidStatus) => void;
}

export function StatusFilter({ value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as BidStatus)}>
      <SelectTrigger className="w-40 h-9 text-xs">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os Status</SelectItem>
        <SelectItem value="em_andamento">Em Andamento</SelectItem>
        <SelectItem value="ganha">Ganhas</SelectItem>
        <SelectItem value="perdida">Perdidas</SelectItem>
        <SelectItem value="cancelada">Canceladas</SelectItem>
      </SelectContent>
    </Select>
  );
}
