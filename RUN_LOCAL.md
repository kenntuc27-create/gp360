# Rodar o GP3K Sistemas localmente (Windows + Cloudflare Tunnel)

O app continua usando o **mesmo banco de dados e usuários** da Lovable Cloud (Supabase remoto `xmjypjvjtqxbtxdjjhoa`). Nada é copiado para sua máquina — você só roda o frontend/servidor localmente e expõe via Cloudflare Tunnel.

---

## 1. Pré-requisitos (uma vez só)

Abra o **PowerShell como Administrador** e instale:

```powershell
# Bun (runtime / package manager)
irm bun.sh/install.ps1 | iex

# Cloudflared (tunel)
winget install --id Cloudflare.cloudflared

# Git (se ainda não tiver)
winget install --id Git.Git
```

Feche e reabra o PowerShell para o PATH atualizar.

---

## 2. Baixar o projeto

```powershell
cd $HOME\Documents
git clone <URL_DO_SEU_REPO_GITHUB> gp3k
cd gp3k
```

> Se ainda não conectou o GitHub no Lovable, abra o projeto → **GitHub → Connect** e dê push para um repositório. Esse passo garante que você consiga clonar.

---

## 3. Configurar variáveis de ambiente

```powershell
.\scripts\setup.ps1
```

O script instala dependências e cria um arquivo `.env` a partir do `.env.example`. **Abra `.env`** (Notepad, VS Code) e preencha os 2 segredos:

```env
SUPABASE_SERVICE_ROLE_KEY=...   # Lovable → Cloud → Backend → Service Role Key
LOVABLE_API_KEY=...             # Lovable → Cloud → AI Gateway → API Key
```

As demais variáveis (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, etc.) já vêm preenchidas apontando para o mesmo banco que roda aqui no Lovable.

---

## 4. Rodar em desenvolvimento (hot reload)

```powershell
.\scripts\dev.ps1
```

Abre em http://localhost:3000

---

## 5. Rodar em produção + Cloudflare Tunnel

### Opção A — URL temporária (sem conta Cloudflare)

```powershell
.\scripts\start.ps1
```

O script faz build, sobe o servidor na porta 3000 e abre um túnel. Você verá no terminal uma URL tipo:

```
https://random-words-1234.trycloudflare.com
```

Compartilhe essa URL. Enquanto o terminal estiver aberto, o app responde.

### Opção B — Domínio fixo (recomendado para produção)

1. Faça login uma vez:
   ```powershell
   cloudflared tunnel login
   ```
2. Crie o túnel nomeado:
   ```powershell
   cloudflared tunnel create gp3k
   cloudflared tunnel route dns gp3k app.seudominio.com
   ```
3. Rode:
   ```powershell
   .\scripts\start.ps1 -Hostname app.seudominio.com
   ```

---

## 6. Configuração extra IMPORTANTE no Supabase

Para o login funcionar na nova URL, adicione-a em:

**Lovable → Cloud → Backend (abrir Supabase) → Authentication → URL Configuration**

- **Site URL**: `https://app.seudominio.com` (ou a URL temporária)
- **Redirect URLs**: adicione a mesma URL + `http://localhost:3000`

Sem isso, o login redireciona para a URL antiga.

---

## 7. Estrutura criada

```
.env.example          # template - commitar
.env                  # seus segredos - NAO commitar
scripts/
  setup.ps1           # instala bun + deps + cria .env
  dev.ps1             # modo dev
  start.ps1           # build + preview + cloudflared
RUN_LOCAL.md          # este arquivo
```

---

## Troubleshooting

| Problema | Solução |
|---|---|
| `bun: command not found` | Feche e reabra PowerShell após instalar |
| `cloudflared: command not found` | `winget install Cloudflare.cloudflared` e reabra terminal |
| Login não funciona via túnel | Adicione a URL do túnel em Supabase → Auth → URL Configuration |
| Erro 500 em server functions | Verifique `SUPABASE_SERVICE_ROLE_KEY` e `LOVABLE_API_KEY` no `.env` |
| Porta 3000 em uso | `.\scripts\start.ps1 -Port 3001` |

---

## O que NÃO muda

- ✅ Banco de dados (mesmo Supabase)
- ✅ Usuários e autenticação (mesma tabela `auth.users`)
- ✅ Storage buckets (editais, logos, supplier-quotes, delivery-evidences)
- ✅ Edge Functions já deployadas
- ✅ Todos os módulos (Posto, Crédito, Licitação, etc.)
