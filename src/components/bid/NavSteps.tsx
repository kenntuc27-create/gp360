import { Button } from "@/components/ui/button";
import { Lock, ArrowLeft, ArrowRight } from "lucide-react";

interface NavStepsProps {
  current: string;
  onPrev?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  hint?: string;
}

export function NavSteps({ current, onPrev, onNext, nextDisabled, hint }: NavStepsProps) {
  return (
    <div className="sticky bottom-0 left-0 right-0 z-20 -mx-4 sm:-mx-6 mt-4 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t border-border flex justify-between items-center gap-2">
      {onPrev ? (
        <Button variant="outline" size="sm" onClick={onPrev}>
          <ArrowLeft className="size-4 mr-1" />Voltar
        </Button>
      ) : <span />}
      
      <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[60%]">
        {nextDisabled && hint ? (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Lock className="size-3" />{hint}
          </span>
        ) : (
          <>Etapa: {current}</>
        )}
      </span>
      
      {onNext ? (
        <Button size="sm" onClick={onNext} disabled={nextDisabled} title={nextDisabled ? hint : ""}>
          Avançar<ArrowRight className="size-4 ml-1" />
        </Button>
      ) : <span />}
    </div>
  );
}
