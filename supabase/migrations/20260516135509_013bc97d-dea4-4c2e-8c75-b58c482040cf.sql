-- Adicionar colunas necessárias à tabela profiles se não existirem
DO $$ 
BEGIN 
    -- Username único e obrigatório (será preenchido via migração ou trigger)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'username') THEN
        ALTER TABLE public.profiles ADD COLUMN username TEXT UNIQUE;
    END IF;

    -- Campos de Segmentação e Operação
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'cargo') THEN
        ALTER TABLE public.profiles ADD COLUMN cargo TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'setor') THEN
        ALTER TABLE public.profiles ADD COLUMN setor TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'segmento') THEN
        ALTER TABLE public.profiles ADD COLUMN segmento TEXT;
    END IF;

    -- Controle de Primeiro Acesso
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'must_change_password') THEN
        ALTER TABLE public.profiles ADD COLUMN must_change_password BOOLEAN DEFAULT TRUE;
    END IF;

    -- Status de Bloqueio
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_blocked') THEN
        ALTER TABLE public.profiles ADD COLUMN is_blocked BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Tabela de Logs de Acesso e Auditoria
CREATE TABLE IF NOT EXISTS public.user_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    username TEXT,
    action TEXT NOT NULL, -- 'login_success', 'login_failure', 'password_change', 'admin_reset', 'block', 'unblock'
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS nos logs
ALTER TABLE public.user_access_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver logs
CREATE POLICY "Admins can view access logs"
    ON public.user_access_logs FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Função para resolver email a partir do username (Security Definer para o login)
CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    found_email TEXT;
BEGIN
    SELECT email INTO found_email
    FROM public.profiles
    WHERE username = _identifier OR email = _identifier
    LIMIT 1;
    
    RETURN found_email;
END;
$$;

-- Função para registrar logs via RPC (para falhas de login o app chama via Edge Function)
CREATE OR REPLACE FUNCTION public.log_user_access(
    _action TEXT,
    _username TEXT DEFAULT NULL,
    _ip_address TEXT DEFAULT NULL,
    _user_agent TEXT DEFAULT NULL,
    _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.user_access_logs (user_id, username, action, ip_address, user_agent, metadata)
    VALUES (auth.uid(), _username, _action, _ip_address, _user_agent, _metadata);
END;
$$;