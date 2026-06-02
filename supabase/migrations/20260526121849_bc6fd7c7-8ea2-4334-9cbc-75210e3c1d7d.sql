-- Add missing columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS setor TEXT;

-- Assign roles to the correct user
DO $$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = 'grupopara.gerencia@hotmail.com';
    
    IF target_user_id IS NOT NULL THEN
        -- Perfil
        INSERT INTO public.profiles (user_id, full_name, nivel_acesso, company_tipo, username, email)
        VALUES (target_user_id, 'Administrador Gerência', 'admin', 'empreendimentos', 'admin', 'grupopara.gerencia@hotmail.com')
        ON CONFLICT (user_id) DO UPDATE 
        SET nivel_acesso = 'admin', email = 'grupopara.gerencia@hotmail.com', updated_at = now();

        -- Roles
        INSERT INTO public.user_roles (user_id, role) VALUES (target_user_id, 'admin') ON CONFLICT DO NOTHING;
        INSERT INTO public.user_roles (user_id, role) VALUES (target_user_id, 'empreendimentos') ON CONFLICT DO NOTHING;
        INSERT INTO public.user_roles (user_id, role) VALUES (target_user_id, 'medicamentos') ON CONFLICT DO NOTHING;
    END IF;
END $$;
