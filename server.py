from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import json
from openai import OpenAI
from duckduckgo_search import DDGS

# --- Configuração ---
# IMPORTANTE: Em produção, a chave DEVE vir de uma variável de ambiente por segurança.
API_KEY = "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" 

app = FastAPI()

# Permite conexões do frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelo de dados para a requisição
class ChatRequest(BaseModel):
    message: str
    city_context: Optional[str] = None
    mayor_context: Optional[str] = None
    site_stats: Optional[str] = None

# --- Novos Modelos ---
class LoginRequest(BaseModel):
    username: str
    password: str

class CampaignUpdate(BaseModel):
    city_slug: str
    votes: Optional[int] = 0
    money: Optional[float] = 0.0

# --- Gerenciamento de Dados de Campanha ---
CAMPAIGN_DATA = {} 

def save_campaign_data():
    try:
        with open("campaign_data.json", "w", encoding="utf-8") as f:
            json.dump(CAMPAIGN_DATA, f, indent=2)
    except Exception as e:
        print(f"Erro ao salvar campanha: {e}")

# Carrega na inicialização
if os.path.exists("campaign_data.json"):
    try:
        with open("campaign_data.json", "r", encoding="utf-8") as f:
            CAMPAIGN_DATA = json.load(f)
    except:
        CAMPAIGN_DATA = {}

# --- Novos Endpoints ---

@app.post("/api/login")
async def login(credentials: LoginRequest):
    print(f"Tentativa de login: {credentials.username} / [SENHA OCULTA]")
    # Credenciais mais fortes para evitar alerta de "senha vazada" do navegador
    if credentials.username == "admin" and credentials.password == "Map@Parana2024":
        return {"success": True, "token": "admin-token-mock"}
    raise HTTPException(status_code=401, detail="Credenciais inválidas")

@app.get("/api/campaign/data")
async def get_campaign_data():
    return CAMPAIGN_DATA

@app.post("/api/campaign/update")
async def update_campaign(data: CampaignUpdate):
    slug = data.city_slug
    if slug not in CAMPAIGN_DATA:
        CAMPAIGN_DATA[slug] = {}
    
    CAMPAIGN_DATA[slug]["votes"] = data.votes
    CAMPAIGN_DATA[slug]["money"] = data.money
    
    save_campaign_data()
    return {"success": True, "data": CAMPAIGN_DATA[slug]}

class CampaignBulkItem(BaseModel):
    city_slug: str
    votes: int
    money: float

class CampaignBulkUpdate(BaseModel):
    items: List[CampaignBulkItem]

@app.post("/api/campaign/update_bulk")
async def update_campaign_bulk(data: CampaignBulkUpdate):
    count = 0
    for item in data.items:
        slug = item.city_slug
        if slug not in CAMPAIGN_DATA:
            CAMPAIGN_DATA[slug] = {}
        CAMPAIGN_DATA[slug]["votes"] = item.votes
        CAMPAIGN_DATA[slug]["money"] = item.money
        count += 1
    
    save_campaign_data()
    return {"success": True, "updates": count}

# --- Ferramentas de Busca ---
def search_web(query: str, max_results: int = 3):
    """Busca no DuckDuckGo para obter informações recentes."""
    try:
        results = DDGS().text(query, max_results=max_results)
        return results
    except Exception as e:
        print(f"Erro na busca: {e}")
        return []

# --- Endpoint de Chat ---
# Carregar dados das cidades na inicialização e Gerar Estatísticas Globais
# Carregar dados das cidades na inicialização e Gerar Estatísticas Globais
CITIES_DATA = {}
ELECTORAL_DATA = {}
GLOBAL_STATS = ""

try:
    with open("cidades_pr.json", "r", encoding="utf-8") as f:
        CITIES_DATA = json.load(f)
    print(f"Dados de {len(CITIES_DATA)} cidades carregados com sucesso.")

    # 1. Carregar e Agregar Dados Eleitorais Globais
    GLOBAL_ELECTORAL_SUMMARY = ""
    if os.path.exists("dados_eleitorais.json"):
        with open("dados_eleitorais.json", "r", encoding="utf-8") as f:
            ELECTORAL_DATA = json.load(f)
        print(f"Dados eleitorais de {len(ELECTORAL_DATA)} cidades carregados.")
        
        # Agregação Global Simplificada
        total_eleitores_state = 0
        gender_counts = {"FEMININO": 0, "MASCULINO": 0}
        
        for d in ELECTORAL_DATA.values():
            total_eleitores_state += d.get("total_eleitores", 0)
            g = d.get("genero", {})
            gender_counts["FEMININO"] += g.get("FEMININO", 0)
            gender_counts["MASCULINO"] += g.get("MASCULINO", 0)
            
        GLOBAL_STATS += f"\n**Estatísticas Eleitorais do Estado (Paraná):**\n"
        GLOBAL_STATS += f"- Eleitorado Total: {total_eleitores_state:,}\n"
        GLOBAL_STATS += f"- Mulheres: {gender_counts['FEMININO']:,} | Homens: {gender_counts['MASCULINO']:,}\n"
    else:
        ELECTORAL_DATA = {}
    
    # 1. Top 10 População
    top_pop = sorted(CITIES_DATA.values(), key=lambda x: int(x.get('habitantes', 0)), reverse=True)[:10]
    GLOBAL_STATS += "**Top 10 Cidades Mais Populosas:**\n"
    for i, c in enumerate(top_pop, 1):
        pop_fmt = f"{c.get('habitantes'):,}".replace(",", ".")
        GLOBAL_STATS += f"{i}. {c.get('nome')} ({pop_fmt} hab.)\n"
    
    # 2. Top 10 PIB per Capita
    GLOBAL_STATS += "\n**Top 10 PIB per Capita:**\n"
    def get_pib(c):
        val = c.get('pib_per_capita', 0)
        return float(val) if val else 0
        
    top_pib = sorted(CITIES_DATA.values(), key=get_pib, reverse=True)[:10]
    for i, c in enumerate(top_pib, 1):
        pib_val = get_pib(c)
        GLOBAL_STATS += f"{i}. {c.get('nome')} (R$ {pib_val:,.2f})\n"

    # 3. Top 10 Área
    GLOBAL_STATS += "\n**Top 10 Maior Área:**\n"
    top_area = sorted(CITIES_DATA.values(), key=lambda x: float(str(x.get('area_km2', 0)).replace(',', '.')), reverse=True)[:10]
    for i, c in enumerate(top_area, 1):
        GLOBAL_STATS += f"{i}. {c.get('nome')} ({c.get('area_km2')} km²)\n"

    # 4. Estatísticas de Partidos (Top 10)
    party_counts = {}
    for c in CITIES_DATA.values():
        p = c.get('partido', 'Outros')
        party_counts[p] = party_counts.get(p, 0) + 1
    
    sorted_parties = sorted(party_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    GLOBAL_STATS += "\n**Top 10 Partidos com Mais Prefeitos:**\n"
    for i, (partido, count) in enumerate(sorted_parties, 1):
        GLOBAL_STATS += f"{i}. {partido}: {count} cidades\n"

    GLOBAL_STATS += f"\n**Total de Cidades no Banco de Dados:** {len(CITIES_DATA)}\n"

except Exception as e:
    print(f"Erro ao carregar ou processar dados: {e}")
    GLOBAL_STATS = "Dados globais indisponíveis no momento."

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    if not API_KEY:
        # Modo de Simulação
        return {
            "response": "⚠️ **A API Key da OpenAI não foi configurada.**\n\n"
                        "Para ativar a inteligência real, configure a chave no arquivo `server.py`.",
            "sources": []
        }

    client = OpenAI(api_key=API_KEY)
    
    # 1. Identificar Contexto de Cidade e Buscar Dados Locais
    target_city_data = None
    target_city_slug = None # Para buscar no JSON eleitoral
    target_city_name = request.city_context
    search_context = ""
    db_analysis_context = ""
    sources = []

    # Se o frontend mandou "Paraná (Estado Geral)", tentamos achar uma cidade específica na mensagem
    if not target_city_name or "Estado Geral" in target_city_name:
        message_lower = request.message.lower()
        for slug, data in CITIES_DATA.items():
            if data.get("nome", "").lower() in message_lower:
                target_city_name = data["nome"]
                target_city_data = data
                target_city_slug = slug
                break
    else:
        # Se o frontend já mandou
        for slug, data in CITIES_DATA.items():
            if data.get("nome", "") in target_city_name:
                target_city_data = data
                target_city_slug = slug
                break

    # Se achamos dados locais, formatamos para o prompt
    local_data_context = ""
    if target_city_data:
        local_data_context = f"""
    DADOS GERAIS DE {target_city_data.get('nome').upper()}:
    - Prefeito: {target_city_data.get('prefeito')} ({target_city_data.get('partido')})
    - Habitantes: {target_city_data.get('habitantes')} (Fonte: IBGE)
    - Área: {target_city_data.get('area_km2')} km²
    - PIB per Capita: R$ {target_city_data.get('pib_per_capita')}
    - IDHM: {target_city_data.get('idhm')}
    - Descrição: {target_city_data.get('descricao')}
    """
        
        # BUSCAR E INJETAR DADOS ELEITORAIS (Se disponível)
        # O slug em CITIES_DATA geralmente bate com o formato snake_case, mas vamos garantir normalização
        if target_city_slug:
            # Tenta encontrar a chave correta em ELECTORAL_DATA
            # Normalização simples: remover acentos e lowercase e substituir espaços/hifens por _
            normalized_slug = target_city_slug.lower().replace("-", "_")
            
            # Tenta busca direta ou iterativa
            city_electoral = ELECTORAL_DATA.get(normalized_slug)
            
            if not city_electoral:
                # Tenta buscar pelo nome da cidade se o slug falhar
                search_name = target_city_data.get('nome', '').lower()
                for k, v in ELECTORAL_DATA.items():
                   if v.get('nome', '').lower() == search_name:
                       city_electoral = v
                       break

            if city_electoral:
                # Injeta o JSON bruto eleitoral para a IA processar
                local_data_context += f"""
    \n--- DADOS ELEITORAIS DETALHADOS (TSE) ---
    Total de Eleitores: {city_electoral.get('total_eleitores')}
    Estatísticas de Gênero: {json.dumps(city_electoral.get('genero', {}), ensure_ascii=False)}
    Faixa Etária (Mulheres/Homens): {json.dumps(city_electoral.get('faixa_etaria', {}), ensure_ascii=False)}
    Grau de Instrução: {json.dumps(city_electoral.get('grau_instrucao', {}), ensure_ascii=False)}
    Estado Civil: {json.dumps(city_electoral.get('estado_civil', {}), ensure_ascii=False)}
    """

        # DADOS DA CAMPANHA E INSIGHTS
        if target_city_slug in CAMPAIGN_DATA:
            camp = CAMPAIGN_DATA[target_city_slug]
            votes = camp.get('votes', 0)
            money = camp.get('money', 0)
            
            # Derived Metrics
            pop = int(target_city_data.get('habitantes', 0))
            cost_vote = (money / votes) if votes > 0 else 0
            cost_pop = (money / pop) if pop > 0 else 0
            
            # Tentar pegar eleitorado para Taxa de Conversão
            normalized_slug = target_city_slug.lower().replace("-", "_")
            total_eleitores = 0
            if ELECTORAL_DATA.get(normalized_slug):
                total_eleitores = ELECTORAL_DATA[normalized_slug].get('total_eleitores', 0)
            
            conversion_rate = (votes / total_eleitores * 100) if total_eleitores > 0 else 0

            local_data_context += f"""
    \n--- DADOS DE CAMPANHA E INSIGHTS (Base Interna) ---
    - Votos Recebidos: {votes:,}
    - Investimento Total: R$ {money:,.2f}
    - Custo por Voto (ROI): R$ {cost_vote:.2f}
    - Custo por Habitante: R$ {cost_pop:.2f}
    - Taxa de Conversão (Votos/Eleitorado): {conversion_rate:.2f}%
    """

    # SE NÃO TEM CIDADE SELECIONADA (OU PEDIU RESUMO GERAL), INJETAR DADOS ESTRATÉGICOS GLOBAIS
    # Para permitir insights como "onde investir", "quais cidades tem maior retorno"
    if not target_city_data or "investimento" in request.message.lower() or "retorno" in request.message.lower() or "conversão" in request.message.lower() or "gerar insights" in request.message.lower():
        
        # Gerar Dataset Simplificado para Análise (Limitado a Top 30 para não estourar tokens se necessário, mas 30 é pouco. 
        # Vamos pegar Top 10 de várias categorias para dar um panorama rico).
        
        all_campaigns = []
        for slug, camp in CAMPAIGN_DATA.items():
            if slug not in CITIES_DATA: continue
            city = CITIES_DATA[slug]
            
            votes = camp.get('votes', 0)
            money = camp.get('money', 0)
            if votes == 0 and money == 0: continue # Skip empty
            
            pop = int(city.get('habitantes', 0))
            
            # Pega eleitorado
            n_slug = slug.lower().replace("-", "_")
            eleitores = 0
            if ELECTORAL_DATA.get(n_slug):
                eleitores = ELECTORAL_DATA[n_slug].get('total_eleitores', 0)
            
            conv = (votes/eleitores*100) if eleitores > 0 else 0
            cpv = (money/votes) if votes > 0 else 0
            
            all_campaigns.append({
                "nome": city['nome'],
                "votes": votes,
                "money": money,
                "conversion": conv,
                "cost_vote": cpv
            })
            
        # Top 5 Maior Investimento
        top_money = sorted(all_campaigns, key=lambda x: x['money'], reverse=True)[:5]
        # Top 5 Maior Conversão (eficiência)
        top_conv = sorted(all_campaigns, key=lambda x: x['conversion'], reverse=True)[:5]
        # Top 5 Menor Custo Voto (eficiência financeira) - filtrar votos > 100 para evitar ruido
        top_roi = sorted([x for x in all_campaigns if x['votes'] > 100], key=lambda x: x['cost_vote'])[:5]

        db_analysis_context += "\n--- RELATÓRIO ESTRATÉGICO DE CAMPANHA (GLOBAL) ---\n"
        db_analysis_context += "Top 5 Maior Investimento:\n" + "\n".join([f"- {x['nome']}: R$ {x['money']:,.2f} ({x['votes']} votos)" for x in top_money]) + "\n\n"
        
        db_analysis_context += "Top 5 Maior Conversão (Votos/Eleitores):\n" + "\n".join([f"- {x['nome']}: {x['conversion']:.2f}%" for x in top_conv]) + "\n\n"
        
        db_analysis_context += "Top 5 'Voto Barato' (Menor Custo/Voto):\n" + "\n".join([f"- {x['nome']}: R$ {x['cost_vote']:.2f}" for x in top_roi]) + "\n"
        
        db_analysis_context += "\nUSE ESTES DADOS PARA GERAR INSIGHTS SOBRE ONDE INVESTIR (Busque cidades com alta conversão e baixo custo, ou cidades grandes com baixo investimento).\n"

    
    # a. Estatísticas de Partido (se mencionado)
    # Coletar todos os partidos únicos
    unique_parties = set(c.get('partido') for c in CITIES_DATA.values() if c.get('partido'))
    mentioned_parties = [p for p in unique_parties if p.lower() in request.message.lower().split()]
    
    if mentioned_parties:
        db_analysis_context += "\n--- ANÁLISE DE PARTIDOS ENCONTRADOS NO BANCO ---\n"
        for p in mentioned_parties:
            # Conta e lista principais cidades
            cities_of_party = [c for c in CITIES_DATA.values() if c.get('partido') == p]
            count = len(cities_of_party)
            # Ordena por população
            cities_of_party.sort(key=lambda x: int(x.get('habitantes', 0)), reverse=True)
            top_5 = [c['nome'] for c in cities_of_party[:5]]
            
            db_analysis_context += f"Partido {p}: {count} prefeitos eleitos.\n"
            db_analysis_context += f"Maiores cidades governadas pelo {p}: {', '.join(top_5)}...\n"

    # b. Busca Semântica Simples (Prefeitos ou Cidades aleatórias na query)
    # Se a pergunta for "Quem é o prefeito de X?" e X não foi capturado no target_city_data (caso raro)
    # Vamos varrer o banco procurando qualquer nome de cidade mencionado
    mentioned_cities = []
    for slug, c in CITIES_DATA.items():
        if c.get('nome', '').lower() in request.message.lower() and c.get('nome') != target_city_data.get('nome', ''):
             mentioned_cities.append(c)
    
    if mentioned_cities:
         db_analysis_context += "\n--- OUTRAS CIDADES MENCIONADAS ---\n"
         for c in mentioned_cities[:3]: # Limita a 3 para não poluir
             db_analysis_context += f"{c['nome']}: Prefeito {c.get('prefeito')} ({c.get('partido')}), {c.get('habitantes')} hab.\n"

    # 3. Busca na Web (apenas se necessário ou complementar)
    # RESTRIÇÃO: Apenas IBGE e TSE/STF
    query_entity = target_city_data.get("nome") if target_city_data else "Paraná"
    
    # Construir query restritiva
    # Simplificando a sintaxe para evitar erros do DDG
    safe_message = request.message.replace('"', '').replace("'", "")
    # Query primária bem específica
    search_query = f'{safe_message} "{query_entity}" site:ibge.gov.br' 

    is_ranking_question = any(x in request.message.lower() for x in [
        "mais populoso", "maior população", "maior cidade", "menor cidade", "maiores cidades",
        "qual partido", "quantos prefeitos", "partido com mais", "ranking", "quais cidades tem mais",
        "quantas cidades"
    ])
    
    # Se já temos a resposta no DB Analysis, evitamos busca externa
    if mentioned_parties or (is_ranking_question and not "brasil" in request.message.lower()):
        print("Dados encontrados no banco local. Priorizando contexto interno.")
        search_query = None # Desativa busca
    
    if search_query:
        print(f"Buscando: {search_query}")
        try:
            search_results = search_web(search_query, max_results=4)
            if not search_results:
                # Fallback: remove site: para tentar pegar o snippet do google/ddg que as vezes vem de lá
                fallback_query = f'{safe_message} "{query_entity}" Paraná dados oficiais'
                print(f"Fallback busca: {fallback_query}")
                search_results = search_web(fallback_query, max_results=3)

            if search_results:
                search_context = "\n\nInformações RECENTES da Web (Fontes Oficiais IBGE/TSE/STF):\n"
                for res in search_results:
                    search_context += f"- {res['title']}: {res['body']} (Fonte: {res['href']})\n"
                    sources.append({"title": res['title'], "url": res['href']})
        except Exception as e:
            print(f"Erro na busca: {e}")
            search_context += "\n(Erro ao realizar busca web externa. Baseando-se apenas em dados locais.)"

    # 3. Montar o Prompt do Sistema Refinado com GUARDRAILS ESPECÍFICOS
    # NOTA: Usamos substituição segura para evitar erros de formatação com f-strings (braces)
    
    city_name = target_city_data.get('nome') if target_city_data else 'Indefinida'
    
    system_prompt_template = """
    Você é um assistente virtual INTEGRADO ao Mapa Interativo do Paraná.
    
    ⚠️ DIRETRIZES DE RESPOSTA (HÍBRIDA):
    1. DADOS ESPECÍFICOS (População, Votos, Quem é o prefeito): USE ESTRITAMENTE AS FONTES FORNECIDAS (JSON/Busca). Se não tiver o dado, diga que não tem.
    2. TÓPICOS CONCEITUAIS (Estratégia, Marketing, "Como ganhar eleição", "Tendências"): USE SEU CONHECIMENTO GERAL DE I.A.
       - Você tem liberdade para ser criativo e consultivo nesses tópicos.
       - Aplique conceitos de ciência política e marketing aos dados do Paraná sempre que possível.
    
    PERMISSÃO PARA ESTRATÉGIA E MARKETING (MODO CONSULTOR):
    Você PODE e DEVE atuar como um CONSULTOR DE MARKETING POLÍTICO SÊNIOR.
    - SEJA CRIATIVO: Sugira slogans, temas para vídeos, jingles e ideias de eventos.
    - SEJA TÁTICO: Não dê conselhos genéricos ("use redes sociais"). Dê o plano: ("Crie um vídeo de 15s no TikTok mostrando o problema do buraco na rua X").
    - USE GATILHOS MENTAIS: Aplique conceitos de Autoridade, Prova Social, Escassez e Inimigo Comum nas suas sugestões.
    
    SE O USUÁRIO PERGUNTAR SOBRE PÚBLICO-ALVO OU CAMPANHA:
    1. SEGMENTAÇÃO PROFUNDA: Use a Pirâmide Etária e Gênero do JSON. Se a maioria for mulheres, sugira pautas de saúde da mulher, creches e segurança. Se for jovens, fale de emprego e inovação.
    2. CANAIS: Diga exatamente ONDE investir (Ex: "Como seu público é 45+, foque 70% da verba em Facebook e Rádio, esqueça o TikTok").
    3. TOM DE VOZ: Ajuste a linguagem baseada na escolaridade (Simples e direto para ensino fundamental, mais elaborado para áreas nobres).
    
    FILTRO DE TEMA (O QUE RECUSAR):
    - Recuse APENAS assuntos totalmente desconexos (Ex: "Receita de bolo", "Futebol", "Programação em Java", "Resumo de filme").
    - Se for sobre Política, Gestão Pública, Cidades, Paraná, Eleições ou Marketing, VOCÊ DEVE RESPONDER.
    
    NÃO responda com conhecimento genérico de fora dessas fontes (ex: não dê opinião pessoal, não busque em blogs, wikipedia, etc., a menos que a busca do Google traga links diretos do IBGE/TSE).

    Contexto de Dados do Site:
    1. RANKINGS ESTADUAIS (Top 10):
    PLACEHOLDER_GLOBAL_STATS
    
    2. DADOS DA CIDADE SELECIONADA (PLACEHOLDER_CITY_NAME):
    PLACEHOLDER_LOCAL_DATA
    
    3. ANÁLISE AUTOMÁTICA DO BANCO DE DADOS (Extraídos da sua pergunta):
    PLACEHOLDER_DB_ANALYSIS
    
    4. RESULTADOS DA BUSCA WEB (IBGE/TSE/STF):
    PLACEHOLDER_SEARCH_CONTEXT
    
    ---
    
    Instruções de Resposta:
    - ATUE COMO UM ESTRATEGISTA POLÍTICO DE DADOS.
    - Se o usuário pedir "Insights", analise o "RELATÓRIO ESTRATÉGICO":
        - Identifique onde o voto está "barato" (oportunidade de ampliar).
        - Identifique onde a conversão é alta (bastiões eleitorais).
        - Avise onde o custo está muito alto (ineficiência).
    - Priorize os dados numéricos exatos fornecidos no "Contexto de Dados do Site" (População, Eleitorado, Gênero).
    - Se usar dados da busca web, cite explicitamente a fonte (ex: "Segundo o TSE...").
    - Seja analítico: cruze os dados de população (IBGE) com eleitorado (TSE) se a pergunta pedir.
    """
    
    # Injeção segura
    system_prompt = system_prompt_template.replace("PLACEHOLDER_GLOBAL_STATS", str(GLOBAL_STATS))
    system_prompt = system_prompt.replace("PLACEHOLDER_CITY_NAME", str(city_name))
    system_prompt = system_prompt.replace("PLACEHOLDER_LOCAL_DATA", str(local_data_context))
    system_prompt = system_prompt.replace("PLACEHOLDER_DB_ANALYSIS", str(db_analysis_context))
    system_prompt = system_prompt.replace("PLACEHOLDER_SEARCH_CONTEXT", str(search_context))

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ],
            temperature=0.5, # Menor temperatura para ser mais rigoroso
            max_tokens=600
        )
        
        answer = response.choices[0].message.content
        return {"response": answer, "sources": sources}

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"CRITICAL CHAT ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Servir arquivos estáticos (HTML, CSS, JS) na raiz
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    print("Iniciando servidor na porta 8082...")
    print("Acesse: http://localhost:8082")
    uvicorn.run(app, host="0.0.0.0", port=8082)
