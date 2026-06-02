import ExcelJS from "exceljs";

export interface ImportedItem {
  item_number: number;
  descricao: string;
  unidade: string;
  quantidade: number;
}

const HEAD_MAP: Record<string, keyof ImportedItem> = {
  item: "item_number", "n": "item_number", "nº": "item_number", "numero": "item_number", "número": "item_number",
  descricao: "descricao", "descrição": "descricao", produto: "descricao", item_descricao: "descricao",
  unidade: "unidade", un: "unidade", "und": "unidade", unid: "unidade",
  quantidade: "quantidade", qtd: "quantidade", "qtde": "quantidade", quant: "quantidade",
};

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export async function importItemsFromExcel(file: File): Promise<ImportedItem[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  // Detecta linha do cabeçalho (primeira linha com pelo menos "descrição" e "quantidade")
  let headerRow = 1;
  let headers: (keyof ImportedItem | null)[] = [];
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const cols: (keyof ImportedItem | null)[] = [];
    let hits = 0;
    row.eachCell({ includeEmpty: true }, (cell) => {
      const key = HEAD_MAP[norm(cell.value)] ?? null;
      cols.push(key);
      if (key) hits++;
    });
    if (hits >= 2 && cols.includes("descricao") && cols.includes("quantidade")) {
      headerRow = r; headers = cols; break;
    }
  }
  if (headers.length === 0) return [];

  const items: ImportedItem[] = [];
  let counter = 1;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: Partial<ImportedItem> = {};
    headers.forEach((key, i) => {
      if (!key) return;
      const v = row.getCell(i + 1).value as unknown;
      if (key === "item_number" || key === "quantidade") {
        const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
        (obj as Record<string, unknown>)[key] = Number.isFinite(n) ? n : 0;
      } else {
        (obj as Record<string, unknown>)[key] = String(v ?? "").trim();
      }
    });
    if (!obj.descricao) continue;
    items.push({
      item_number: Number(obj.item_number) || counter,
      descricao: obj.descricao,
      unidade: obj.unidade || "UN",
      quantidade: Number(obj.quantidade) || 1,
    });
    counter++;
  }
  return items;
}
