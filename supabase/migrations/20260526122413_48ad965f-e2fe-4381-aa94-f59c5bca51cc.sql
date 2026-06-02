-- Restaurar Constraints e Índices originais das migrações

-- 1. Sector Metrics Unique
ALTER TABLE public.sector_metrics DROP CONSTRAINT IF EXISTS sector_metrics_sector_id_name_key;
ALTER TABLE public.sector_metrics ADD CONSTRAINT sector_metrics_sector_id_name_key UNIQUE (sector_id, name);

-- 2. Daily Production Metrics Unique
ALTER TABLE public.daily_production_metrics DROP CONSTRAINT IF EXISTS daily_production_metrics_employee_id_metric_id_production_da_key;
ALTER TABLE public.daily_production_metrics ADD CONSTRAINT daily_production_metrics_employee_id_metric_id_production_da_key UNIQUE (employee_id, metric_id, production_date);

-- 3. Adherence Status Unique
ALTER TABLE public.adherence_status DROP CONSTRAINT IF EXISTS adherence_status_employee_id_reference_date_key;
ALTER TABLE public.adherence_status ADD CONSTRAINT adherence_status_employee_id_reference_date_key UNIQUE (employee_id, reference_date);

-- 4. Work Schedules Unique
ALTER TABLE public.work_schedules DROP CONSTRAINT IF EXISTS work_schedules_employee_id_weekday_key;
ALTER TABLE public.work_schedules ADD CONSTRAINT work_schedules_employee_id_weekday_key UNIQUE (employee_id, weekday);

-- 5. User Roles Unique
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
