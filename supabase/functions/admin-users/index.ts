import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Apenas administradores" }, 403);

    const body = await req.json();
    const { action } = body;

    // ===== HELPERS =====
    const audit = async (act: string, table: string, recordId: string | null, data: Record<string, unknown>) => {
      // Registrar log detalhado na nova tabela
      await admin.from("user_access_logs").insert({
        user_id: act === "login_failure" ? null : (recordId && recordId.length === 36 ? recordId : user.id),
        username: data.username as string || "",
        action: act,
        ip_address: req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for"),
        user_agent: req.headers.get("user-agent"),
        metadata: data,
      });

      // Manter auditoria antiga se existir a tabela
      try {
        await admin.from("audit_log").insert({
          user_id: user.id,
          user_email: user.email || "",
          action: act,
          table_name: table,
          record_id: recordId,
          new_data: data,
        });
      } catch {
        // Ignora se audit_log não existir
      }
    };

    const findAuthUserByEmail = async (email: string) => {
      const e = email.trim().toLowerCase();
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      return data?.users.find((u) => (u.email || "").toLowerCase() === e) || null;
    };

    const validateLogin = async (email: string, password: string): Promise<string | null> => {
      // Cria um client isolado (sem header de auth) e tenta autenticar.
      const probe = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      // Pequeno delay: createUser é eventually consistent em alguns cenários.
      await new Promise((r) => setTimeout(r, 800));
      const { error } = await probe.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      await probe.auth.signOut();
      return null;
    };

    // ===== CREATE =====
    if (action === "create") {
      const { 
        username: rawUsername, 
        full_name, 
        roles, 
        company_id, 
        company_tipo, 
        business_id,
        nivel_acesso,
        cargo,
        setor,
        segmento
      } = body as {
        username: string; full_name: string; roles: string[];
        company_id?: string | null; company_tipo?: string | null; business_id?: string | null; nivel_acesso?: string;
        cargo?: string; setor?: string; segmento?: string;
      };

      const slugify = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
      const username = slugify(rawUsername || "");
      if (!username) return json({ error: "Nome de usuário obrigatório" }, 400);

      const email = `${username}@interno.local`;

      // Senha temporária automática (forte e legível)
      const genPwd = () => {
        const letters = "abcdefghjkmnpqrstuvwxyz";
        const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
        const digits = "23456789";
        const pick = (s: string, n: number) =>
          Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
        return `${pick(upper, 1)}${pick(letters, 4)}@${pick(digits, 3)}`;
      };
      const password = genPwd();

      // 1) Duplicidade — auth.users
      const existingAuth = await findAuthUserByEmail(email);
      if (existingAuth) return json({ error: "Já existe um usuário com este nome" }, 409);
      // 2) Duplicidade — profiles (username ou email)
      const { data: dupProf } = await admin.from("profiles")
        .select("user_id").or(`email.ilike.${email},username.ilike.${username}`).maybeSingle();
      if (dupProf) return json({ error: "Já existe um perfil com este nome de usuário" }, 409);

      // 3) Cria no Auth (com email confirmado)
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (cErr || !created.user) return json({ error: cErr?.message || "Falha ao criar usuário" }, 400);

      // 4) Sincroniza profiles
      await admin.from("profiles").update({
        full_name, email, username,
        company_id: company_id || null,
        company_tipo: company_tipo || null,
        business_id: business_id || null,
        nivel_acesso: nivel_acesso || "operacional",
        cargo,
        setor,
        segmento,
        must_change_password: true,
      }).eq("user_id", created.user.id);


      // 5) Roles
      if (roles?.length) {
        await admin.from("user_roles").insert(roles.map((r) => ({ user_id: created.user!.id, role: r })));
      }

      // 6) Validação: tenta login. Se falhar, rollback.
      const loginErr = await validateLogin(email, password);
      if (loginErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        await audit("create_user_failed", "auth.users", created.user.id, { email, error: loginErr });
        return json({ error: `Usuário criado mas autenticação falhou: ${loginErr}. Operação revertida.` }, 400);
      }

      await audit("create_user", "auth.users", created.user.id, { username, email, full_name, nivel_acesso });
      return json({ ok: true, user_id: created.user.id, username, email, password, must_change_password: true });
    }

    if (action === "update_profile") {
      const { user_id, full_name, company_id, company_tipo, business_id, nivel_acesso, cargo, setor, segmento } = body as {
        user_id: string; full_name?: string; company_id?: string | null; company_tipo?: string | null; business_id?: string | null; nivel_acesso?: string;
        cargo?: string; setor?: string; segmento?: string;
      };
      if (!user_id) return json({ error: "user_id obrigatório" }, 400);
      const patch: Record<string, unknown> = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (company_id !== undefined) patch.company_id = company_id;
      if (company_tipo !== undefined) patch.company_tipo = company_tipo;
      if (business_id !== undefined) patch.business_id = business_id;
      if (nivel_acesso !== undefined) patch.nivel_acesso = nivel_acesso;
      if (cargo !== undefined) patch.cargo = cargo;
      if (setor !== undefined) patch.setor = setor;
      if (segmento !== undefined) patch.segmento = segmento;

      
      const { error } = await admin.from("profiles").update(patch).eq("user_id", user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "set_active") {
      const { user_id, active } = body as { user_id: string; active: boolean };
      if (!user_id) return json({ error: "user_id obrigatório" }, 400);
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: active ? "none" : "876000h",
      } as never);
      if (error) return json({ error: error.message }, 400);
      await audit(active ? "activate_user" : "deactivate_user", "auth.users", user_id, { active });
      return json({ ok: true });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id obrigatório" }, 400);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      await audit("delete_user", "auth.users", user_id, {});
      return json({ ok: true });
    }

    if (action === "set_roles") {
      const { user_id, roles } = body as { user_id: string; roles: string[] };
      if (!user_id) return json({ error: "user_id obrigatório" }, 400);
      await admin.from("user_roles").delete().eq("user_id", user_id);
      if (roles?.length) {
        await admin.from("user_roles").insert(roles.map((r) => ({ user_id, role: r })));
      }
      return json({ ok: true });
    }

    // ===== RESET PASSWORD =====
    if (action === "reset_password") {
      const { user_id } = body as { user_id: string; password?: string };
      if (!user_id) return json({ error: "user_id obrigatório" }, 400);

      // Senha temporária automática
      const genPwd = () => {
        const letters = "abcdefghjkmnpqrstuvwxyz";
        const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
        const digits = "23456789";
        const pick = (s: string, n: number) =>
          Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
        return `${pick(upper, 1)}${pick(letters, 4)}@${pick(digits, 3)}`;
      };
      const password = (body as { password?: string }).password || genPwd();
      if (password.length < 6) return json({ error: "Senha precisa ter ao menos 6 caracteres" }, 400);

      const { data: updated, error } = await admin.auth.admin.updateUserById(user_id, {
        password,
        email_confirm: true,
      });
      if (error || !updated.user) return json({ error: error?.message || "Falha ao atualizar senha" }, 400);

      await admin.from("profiles").update({ must_change_password: true }).eq("user_id", user_id);

      const email = updated.user.email || "";
      if (email) {
        const loginErr = await validateLogin(email, password);
        if (loginErr) {
          await audit("reset_password_failed", "auth.users", user_id, { email, error: loginErr });
          return json({ error: `Senha redefinida mas autenticação falhou: ${loginErr}` }, 400);
        }
      }

      const { data: prof } = await admin.from("profiles").select("username").eq("user_id", user_id).maybeSingle();
      const username = (prof as { username?: string } | null)?.username || email.split("@")[0];
      await audit("reset_password", "auth.users", user_id, { email, username });
      return json({ ok: true, email, username, password, must_change_password: true });
    }

    if (action === "list_status") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return json({ error: error.message }, 400);
      // deno-lint-ignore no-explicit-any
      return json({ users: data.users.map((u) => ({ id: u.id, banned_until: (u as any).banned_until || null })) });
    }

    // Cria usuário interno para um funcionário existente (mantido).
    if (action === "create_employee_user") {
      const { employee_id } = body as { employee_id: string };
      if (!employee_id) return json({ error: "employee_id obrigatório" }, 400);

      const { data: emp, error: empErr } = await admin
        .from("employees")
        .select("id, full_name, user_id")
        .eq("id", employee_id)
        .maybeSingle();
      if (empErr || !emp) return json({ error: "Funcionário não encontrado" }, 404);
      if (emp.user_id) return json({ error: "Funcionário já possui login" }, 400);

      const slugify = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40) || "user";
      const base = slugify(emp.full_name);

      let username = base;
      let suffix = 1;
      let fakeEmail = `${username}@interno.local`;
      while (true) {
        const [{ data: clashUser }, { data: clashEmail }] = await Promise.all([
          admin.from("profiles").select("user_id").ilike("username", username).maybeSingle(),
          admin.from("profiles").select("user_id").ilike("email", fakeEmail).maybeSingle(),
        ]);
        const clashAuth = await findAuthUserByEmail(fakeEmail);
        if (!clashUser && !clashEmail && !clashAuth) break;
        suffix += 1;
        username = `${base}${suffix}`;
        fakeEmail = `${username}@interno.local`;
      }

      const tempPassword = `Para@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: fakeEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: emp.full_name },
      });
      if (cErr || !created.user) {
        return json({ error: `${cErr?.message || "Falha ao criar login"} (tentou ${fakeEmail})` }, 400);
      }

      await admin.from("profiles").update({
        full_name: emp.full_name,
        email: fakeEmail,
        username,
        must_change_password: true,
      }).eq("user_id", created.user.id);

      await admin.from("employees").update({ user_id: created.user.id, email: fakeEmail }).eq("id", emp.id);

      // Validação
      const loginErr = await validateLogin(fakeEmail, tempPassword);
      if (loginErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        await admin.from("employees").update({ user_id: null }).eq("id", emp.id);
        return json({ error: `Login criado mas autenticação falhou: ${loginErr}. Revertido.` }, 400);
      }

      await audit("create_employee_user", "auth.users", created.user.id, { username, email: fakeEmail });
      return json({ ok: true, username, password: tempPassword, email: fakeEmail });
    }

    if (action === "log_external") {
      const { event, username, metadata } = body as { event: string; username?: string; metadata?: Record<string, unknown> };
      await audit(event, "external", null, { ...metadata, username });
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
