#!/usr/bin/env python3
"""
Lista diária de lembretes no WhatsApp (envio manual pelo Erick).

Lê quem aceitou lembretes na tela do primeiro preço (`perfil.whatsapp_lembretes`)
e gera uma página local com, para cada pessoa: o que já fez no app, há quanto
tempo não abre, uma mensagem pronta e um botão que abre o WhatsApp com o texto.
O app não envia nada sozinho; a página só prepara o envio.

Saída: whatsapp-lembretes/lista-AAAA-MM-DD.html (fora do git via
.git/info/exclude: tem telefone de cliente). Precisa de SUPABASE_ACCESS_TOKEN
no .env.local (Management API, só leitura).

Rodar: python3 scripts/whatsapp-lista.py
"""
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJETO = 'lwznqpxzmqptrpbifvka'
APP = 'https://app.precificaiapp.com'
BRT = dt.timezone(dt.timedelta(hours=-3))

SQL = """
with o as (
  select p.user_id, p.nome_negocio, p.telefone, p.whatsapp_lembretes_em, u.created_at,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') nome
  from perfil p join auth.users u on u.id = p.user_id
  where p.whatsapp_lembretes and coalesce(p.telefone, '') <> ''
)
select o.user_id::text uid, o.nome, o.nome_negocio, o.telefone,
  o.whatsapp_lembretes_em aceite, o.created_at cadastro,
  (select max(t) from (
     select max(greatest(s.updated_at, coalesce(s.refreshed_at at time zone 'UTC', s.updated_at))) t from auth.sessions s where s.user_id = o.user_id
     union all select max(coalesce(updated_at, created_at)) from produtos where user_id = o.user_id
     union all select max(coalesce(updated_at, created_at)) from materias_primas where user_id = o.user_id
     union all select max(aberto_em) from app_aberturas where user_id = o.user_id
   ) x) ultimo_uso,
  (select coalesce(json_agg(json_build_object('nome', nome, 'preco', preco_venda) order by created_at), '[]'::json)
     from produtos where user_id = o.user_id and coalesce(preco_venda, 0) > 0) produtos
from o order by o.whatsapp_lembretes_em
"""


def token():
    with open(os.path.join(RAIZ, '.env.local')) as f:
        for linha in f:
            if linha.startswith('SUPABASE_ACCESS_TOKEN='):
                return linha.split('=', 1)[1].strip().strip('"').strip("'")
    sys.exit('SUPABASE_ACCESS_TOKEN ausente no .env.local')


def consultar(sql):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{PROJETO}/database/query',
        data=json.dumps({'query': sql}).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json', 'User-Agent': 'curl/8'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode() or '[]')


def quando(iso):
    if not iso:
        return None
    s = re.sub(r'(\.\d+)?([+-]\d\d)(:?\d\d)?$', r'\2:00', str(iso).replace(' ', 'T'))
    return dt.datetime.fromisoformat(s).astimezone(BRT)


def reais(v):
    s = f'{float(v):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return f'R$ {s}'


def numero_wa(tel):
    d = re.sub(r'\D', '', tel or '')
    if d.startswith('55') and len(d) in (12, 13):
        return d
    return '55' + d if len(d) in (10, 11) else None


def primeiro_nome(nome):
    p = (nome or '').strip().split()
    return p[0].capitalize() if p else ''


def mensagem(r):
    oi = f'Oi, {primeiro_nome(r["nome"])}!' if primeiro_nome(r['nome']) else 'Oi!'
    prods = r['produtos'] or []
    sair = 'Para parar de receber, responda SAIR.'
    if len(prods) >= 3:
        negocio = (r['nome_negocio'] or '').strip()
        tabela = '\n'.join(f'{p["nome"].strip()}: {reais(p["preco"])}' for p in prods)
        titulo = f'*{negocio}*\nTabela de preços' if negocio else '*Tabela de preços*'
        return (f'{oi} Aqui é o Erick, do Precificaí. Sua tabela de preços está pronta para mandar aos clientes:\n\n'
                f'{titulo}\n{tabela}\n\n'
                f'Quando o preço de algum ingrediente mudar, atualize aqui: {APP}\n\n{sair}')
    if prods:
        ult = prods[-1]
        falta = 3 - len(prods)
        return (f'{oi} Aqui é o Erick, do Precificaí. Você calculou o preço de {ult["nome"].strip()}: {reais(ult["preco"])}.\n\n'
                f'Faça agora o do próximo produto, leva 15 segundos: {APP}\n\n'
                f'Faltam {falta} para a sua tabela de preços ficar pronta para mandar no WhatsApp.\n\n{sair}')
    return (f'{oi} Aqui é o Erick, do Precificaí. Descubra o preço do seu primeiro produto em 30 segundos: {APP}\n\n{sair}')


def main():
    agora = dt.datetime.now(BRT)
    linhas = consultar(SQL)
    if isinstance(linhas, dict):
        sys.exit(f'Erro na consulta: {linhas}')
    cartoes = []
    for r in linhas:
        wa = numero_wa(r['telefone'])
        ult = quando(r['ultimo_uso'])
        dias = (agora.date() - ult.date()).days if ult else None
        texto = mensagem(r)
        link = f'https://wa.me/{wa}?text={urllib.parse.quote(texto)}' if wa else ''
        prods = r['produtos'] or []
        status = 'usou hoje' if dias == 0 else ('usou ontem' if dias == 1 else (f'{dias} dias sem abrir' if dias is not None else 'sem uso registrado'))
        cartoes.append({
            'id': r['uid'][:8], 'nome': r['nome'] or '(sem nome)', 'negocio': r['nome_negocio'] or '',
            'tel': r['telefone'], 'wa': link, 'texto': texto, 'status': status, 'dias': dias if dias is not None else 99,
            'precos': len(prods), 'aceite': quando(r['aceite']).strftime('%d/%m %H:%M') if r['aceite'] else '',
            'cadastro': quando(r['cadastro']).strftime('%d/%m'),
        })
    cartoes.sort(key=lambda c: -c['dias'])
    pasta = os.path.join(RAIZ, 'whatsapp-lembretes')
    os.makedirs(pasta, mode=0o700, exist_ok=True)
    destino = os.path.join(pasta, f'lista-{agora:%Y-%m-%d}.html')
    with open(os.open(destino, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
        f.write(pagina(cartoes, agora))
    print(f'{len(cartoes)} pessoa(s) na lista: {destino}')


def pagina(cartoes, agora):
    itens = []
    for c in cartoes:
        botao = (f'<a class="btn" href="{html.escape(c["wa"])}" target="_blank" rel="noopener" data-id="{c["id"]}">Abrir no WhatsApp</a>'
                 if c['wa'] else '<span class="aviso">Número inválido</span>')
        itens.append(f'''
<article data-id="{c["id"]}">
  <header><strong>{html.escape(c["nome"])}</strong> <span class="neg">{html.escape(c["negocio"])}</span></header>
  <p class="meta">{html.escape(c["tel"])} · {c["precos"]} produto(s) com preço · {c["status"]} · cadastro {c["cadastro"]} · aceitou {c["aceite"]}</p>
  <pre>{html.escape(c["texto"])}</pre>
  <div class="acoes">{botao}<span class="enviado"></span></div>
</article>''')
    vazio = '<p>Ninguém aceitou lembretes ainda.</p>' if not cartoes else ''
    return f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lembretes WhatsApp</title>
<style>
:root {{ --bg:#f7f5f0; --card:#fff; --tx:#1d1d1b; --mut:#6b6b66; --ok:#1f8f4e; --bd:#e4e0d6; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#141413; --card:#1f1f1d; --tx:#f0eee8; --mut:#a3a19a; --bd:#33322f; }} }}
body {{ margin:0; background:var(--bg); color:var(--tx); font:15px/1.45 -apple-system,system-ui,sans-serif; }}
main {{ max-width:720px; margin:0 auto; padding:16px; }}
h1 {{ font-size:20px; margin:8px 0 4px; }} .sub {{ color:var(--mut); margin:0 0 16px; }}
article {{ background:var(--card); border:1px solid var(--bd); border-radius:12px; padding:14px; margin-bottom:12px; }}
article.feito {{ opacity:.55; }}
.neg {{ color:var(--mut); }} .meta {{ color:var(--mut); font-size:13px; margin:4px 0 8px; }}
pre {{ white-space:pre-wrap; font:inherit; background:var(--bg); border-radius:8px; padding:10px; margin:0 0 10px; }}
.acoes {{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; }}
.btn {{ background:var(--ok); color:#fff; text-decoration:none; padding:10px 14px; border-radius:8px; font-weight:600; }}
.enviado {{ color:var(--mut); font-size:13px; }} .aviso {{ color:#b3261e; }}
</style></head><body><main>
<h1>Lembretes no WhatsApp</h1>
<p class="sub">Gerada em {agora:%d/%m/%Y %H:%M}. Mande só para quem não abriu o app hoje e no máximo 1 mensagem a cada 2 dias por pessoa. Quem responder SAIR: desmarque no banco (perfil.whatsapp_lembretes = false).</p>
{vazio}{"".join(itens)}
</main>
<script>
const K = 'pcf_wa_enviados';
let env = {{}}; try {{ env = JSON.parse(localStorage.getItem(K) || '{{}}'); }} catch (e) {{}}
function marca() {{
  document.querySelectorAll('article').forEach(a => {{
    const d = env[a.dataset.id]; const s = a.querySelector('.enviado');
    if (d) {{ s.textContent = 'Enviado em ' + d; if (d === new Date().toLocaleDateString('pt-BR')) a.classList.add('feito'); }}
  }});
}}
document.querySelectorAll('a.btn').forEach(b => b.addEventListener('click', () => {{
  env[b.dataset.id] = new Date().toLocaleDateString('pt-BR');
  try {{ localStorage.setItem(K, JSON.stringify(env)); }} catch (e) {{}}
  marca();
}}));
marca();
</script></body></html>'''


if __name__ == '__main__':
    main()
