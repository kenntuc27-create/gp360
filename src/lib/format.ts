export const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

export const fmtNum = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(n) || 0);

export const fmtDate = (d: string | Date) => {
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return String(d); }
};
