import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Supplier {
  id: string;
  razao_social: string;
  segmento: string;
  tipo: string;
  whatsapp: string;
  email: string;
}

interface SupplierPickerProps {
  suppliers: Supplier[];
  selected: Set<string>;
  onToggle: (id: string, v: boolean) => void;
  onSelectAll: (ids: string[], v: boolean) => void;
  bidSegmentId?: string | null;
}

export function SupplierPicker({
  suppliers,
  selected,
  onToggle,
  onSelectAll,
  bidSegmentId,
}: SupplierPickerProps) {
  const [search, setSearch] = useState("");
  const [segmento, setSegmento] = useState<string>(bidSegmentId || "__all");
  const [tipo, setTipo] = useState<string>("__all");

  const segmentos = useMemo(
    () => Array.from(new Set(suppliers.map((s) => (s.segmento || "").trim()).filter(Boolean))).sort(),
    [suppliers]
  );
  const tipos = useMemo(
    () => Array.from(new Set(suppliers.map((s) => (s.tipo || "").trim()).filter(Boolean))).sort(),
    [suppliers]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (segmento !== "__all" && (s.segmento || "") !== segmento) return false;
      if (tipo !== "__all" && (s.tipo || "") !== tipo) return false;
      if (!q) return true;
      return (
        s.razao_social?.toLowerCase().includes(q) ||
        s.segmento?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.whatsapp?.toLowerCase().includes(q)
      );
    });
  }, [suppliers, search, segmento, tipo]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <Input
          placeholder="🔍 Pesquisar fornecedor (nome, segmento, e-mail, WhatsApp)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={segmento} onValueChange={setSegmento}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Empresa / Segmento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas as empresas</SelectItem>
            {segmentos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos os tipos</SelectItem>
            {tipos.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} de {suppliers.length} fornecedores · {selected.size} selecionado(s)</span>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onSelectAll(filtered.map((s) => s.id), !allFilteredSelected)}>
              {allFilteredSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}
            </Button>
          )}
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onSelectAll([...selected], false)}>Limpar</Button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((s) => {
          const sel = selected.has(s.id);
          return (
            <label key={s.id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${sel ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
              <Checkbox checked={sel} onCheckedChange={(v) => onToggle(s.id, !!v)} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.razao_social}</div>
                <div className="text-xs text-muted-foreground truncate">{s.segmento || "—"}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="outline" className="text-[10px] capitalize">{s.tipo || "distribuidor"}</Badge>
                  {s.whatsapp && <Badge variant="secondary" className="text-[10px]">WhatsApp</Badge>}
                </div>
              </div>
            </label>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-muted-foreground text-sm col-span-full py-8 text-center">
            {suppliers.length === 0 ? "Nenhum fornecedor cadastrado. Vá em Fornecedores." : "Nenhum fornecedor encontrado com esses filtros."}
          </div>
        )}
      </div>
    </>
  );
}
