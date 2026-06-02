-- Add payment tracking to bid_deliveries
ALTER TABLE public.bid_deliveries 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;

-- Create delivery logs for audit
CREATE TABLE public.bid_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES public.bid_deliveries(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL, -- 'create', 'update', 'status_change', 'upload', 'signature'
    changes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bid_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Policy for viewing logs
CREATE POLICY "Users can view logs of deliveries they have access to"
ON public.bid_delivery_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.bid_deliveries d
        JOIN public.bids b ON b.id = d.bid_id
        WHERE d.id = public.bid_delivery_logs.delivery_id
        AND (
            -- Same logic as other bid-related tables
            b.tipo_cotacao = ANY (
                SELECT unnest(string_to_array(COALESCE(auth.jwt() -> 'user_metadata' ->> 'allowed_tipos', 'empreendimentos,medicamentos'), ','))
            )
            OR (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
        )
    )
);

-- Trigger to log status changes automatically (optional but good)
CREATE OR REPLACE FUNCTION public.log_bid_delivery_changes()
RETURNS TRIGGER AS $$
DECLARE
    changes_json JSONB := '{}'::jsonb;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        IF (OLD.status IS DISTINCT FROM NEW.status) THEN
            changes_json := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
            INSERT INTO public.bid_delivery_logs (delivery_id, user_id, action, changes)
            VALUES (NEW.id, auth.uid(), 'status_change', changes_json);
        END IF;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.bid_delivery_logs (delivery_id, user_id, action, changes)
        VALUES (NEW.id, auth.uid(), 'create', jsonb_build_object('status', NEW.status));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_log_bid_delivery_changes
AFTER INSERT OR UPDATE ON public.bid_deliveries
FOR EACH ROW EXECUTE FUNCTION public.log_bid_delivery_changes();
