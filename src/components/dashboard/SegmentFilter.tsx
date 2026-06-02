import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface Segment {
  id: string;
  name: string;
}

interface Props {
  value: string; // id do segmento ou "all"
  onChange: (v: string) => void;
}

export function SegmentFilter({ value, onChange }: Props) {
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("segments").select("id, name").order("name");
      if (data) setSegments(data);
    })();
  }, []);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48 h-9 text-xs">
        <SelectValue placeholder="Todos os Segmentos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os Segmentos</SelectItem>
        {segments.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
