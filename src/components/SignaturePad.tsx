import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface Props {
  value?: string;
  onChange: (dataUrl: string) => void;
  height?: number;
}

export function SignaturePad({ value, onChange, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    if (value) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height); setHasInk(true); };
      img.src = value;
    }
  }, []); // eslint-disable-line

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * canvasRef.current!.width) / r.width, y: ((e.clientY - r.top) * canvasRef.current!.height) / r.height };
  }

  function down(e: React.PointerEvent) {
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange("");
  }

  return (
    <div className="space-y-2">
      <div className="border rounded-md bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={height}
          className="w-full touch-none cursor-crosshair"
          style={{ height }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{hasInk ? "Assinado" : "Assine no quadro acima"}</span>
        <Button type="button" size="sm" variant="ghost" onClick={clear}><Eraser className="size-3 mr-1" />Limpar</Button>
      </div>
    </div>
  );
}
