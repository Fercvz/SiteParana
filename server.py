from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import json
from io import BytesIO
from openpyxl import Workbook
from fastapi.responses import StreamingResponse
from openai import OpenAI
from duckduckgo_search import DDGS
from dotenv import load_dotenv

# --- Configuração ---
load_dotenv()

# Recupera credenciais do ambiente ou usa valores padrão seguros (básico)
API_KEY = os.getenv("OPENAI_API_KEY")
ADMIN_USER = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASSWORD", "Map@Parana2024")

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
    investment_context: Optional[str] = None

# --- Novos Modelos ---
class LoginRequest(BaseModel):
    username: str
    password: str

class CampaignUpdate(BaseModel):
    city_slug: str
    votes: Optional[int] = 0
    money: Optional[float] = 0.0

class CampaignBulkItem(BaseModel):
    city_slug: str
    votes: int
    money: float

class CampaignBulkUpdate(BaseModel):
    items: List[CampaignBulkItem]

# --- Gerenciamento de Dados de Campanha ---
CAMPAIGN_DATA = {} 

def save_campaign_data():
    try:
        with open("campaign_data.json", "w", encoding="utf-8") as f:
            json.dump(CAMPAIGN_DATA, f, indent=2)
    except Exception as e:
        print(f"Erro ao salvar campanha: {e}")

# Carrega na inicialização
# Carrega na inicialização será feito via rebuild_campaign_data() para consistência

# --- Gerenciamento de Dados de Investimentos ---
INVESTMENTS_DATA = []

def save_investments_data():
    try:
        with open("investments_data.json", "w", encoding="utf-8") as f:
            json.dump(INVESTMENTS_DATA, f, indent=2, ensure_ascii=False)
        print(f"Investimentos salvos: {len(INVESTMENTS_DATA)} registros")
    except Exception as e:
        print(f"Erro ao salvar investimentos: {e}")

# Carrega na inicialização
if os.path.exists("investments_data.json"):
    try:
        with open("investments_data.json", "r", encoding="utf-8") as f:
            INVESTMENTS_DATA = json.load(f)
        print(f"Investimentos carregados: {len(INVESTMENTS_DATA)} registros")
    except:
        INVESTMENTS_DATA = []

# --- Gerenciamento de Dados de Votos (por Cidade/Ano) ---
VOTOS_DATA = {}  # { 'cidade-slug': [{ ano: 2024, votos: 15000 }, ...] }

def save_votos_data():
    try:
        with open("votos_data.json", "w", encoding="utf-8") as f:
            json.dump(VOTOS_DATA, f, indent=2, ensure_ascii=False)
        print(f"Votos salvos: {len(VOTOS_DATA)} cidades")
    except Exception as e:
        print(f"Erro ao salvar votos: {e}")

# Carrega votos na inicialização
if os.path.exists("votos_data.json"):
    try:
        with open("votos_data.json", "r", encoding="utf-8") as f:
            VOTOS_DATA = json.load(f)
        print(f"Votos carregados: {len(VOTOS_DATA)} cidades")
    except:

        VOTOS_DATA = {}

# --- Reconstrução de Dados Agregados (CAMPAIGN_DATA) ---
def rebuild_campaign_data():
    global CAMPAIGN_DATA
    CAMPAIGN_DATA = {}
    
    # 1. Agrega Votos
    for slug, entries in VOTOS_DATA.items():
        if slug not in CAMPAIGN_DATA:
            CAMPAIGN_DATA[slug] = {"votes": 0, "money": 0}
        total = sum(e["votos"] for e in entries)
        CAMPAIGN_DATA[slug]["votes"] = total
        
    # 2. Agrega Investimentos
    for inv in INVESTMENTS_DATA:
        slug = inv.get("cityId")
        if not slug: continue
        if slug not in CAMPAIGN_DATA:
            CAMPAIGN_DATA[slug] = {"votes": 0, "money": 0}
        
        CAMPAIGN_DATA[slug]["money"] += inv.get("valor", 0)
        
    # Salva para consistência externa se necessário, mas a memória é a fonte da verdade
    save_campaign_data()
    print(f"Dados de campanha reconstruídos: {len(CAMPAIGN_DATA)} cidades.")

# Executa reconstrução inicial
rebuild_campaign_data()

# --- Dados Globais (Carregados na inialização) ---
CITIES_DATA = {}
ELECTORAL_DATA = {}
GLOBAL_STATS = ""

def load_data():
    global CITIES_DATA, ELECTORAL_DATA, GLOBAL_STATS
    try:
        with open("cidades_pr.json", "r", encoding="utf-8") as f:
            CITIES_DATA = json.load(f)
        print(f"Dados de {len(CITIES_DATA)} cidades carregados com sucesso.")

        # 1. Carregar e Agregar Dados Eleitorais Globais
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

# Inicializa os dados
load_data()

# --- Novos Endpoints ---

@app.post("/api/login")
async def login(credentials: LoginRequest):
    # Comparação segura com variáveis de ambiente
    if credentials.username == ADMIN_USER and credentials.password == ADMIN_PASS:
        return {"success": True, "token": "admin-token-secure"}
    raise HTTPException(status_code=401, detail="Credenciais inválidas")

@app.get("/api/campaign/data")
async def get_campaign_data():
    return CAMPAIGN_DATA

@app.get("/api/status")
async def api_status():
    """Endpoint leve para verificar conectividade do App."""
    return {"status": "online", "message": "Servidor do Mapa Paraná operando!"}

@app.get("/api/cities")
async def get_cities_list():
    """Retorna lista simplificada de cidades para o App (Dropdown/Busca)."""
    # Retorna lista para facilitar iteração no React Native
    simple_list = []
    for slug, data in CITIES_DATA.items():
        simple_list.append({
            "id": slug,
            "nome": data.get("nome"),
            "habitantes": data.get("habitantes"),
            "partido": data.get("partido")
        })
    # Ordena por nome
    simple_list.sort(key=lambda x: x["nome"])
    return simple_list

@app.post("/api/campaign/update")
async def update_campaign(data: CampaignUpdate):
    slug = data.city_slug
    if slug not in CAMPAIGN_DATA:
        CAMPAIGN_DATA[slug] = {}
    
    CAMPAIGN_DATA[slug]["votes"] = data.votes
    CAMPAIGN_DATA[slug]["money"] = data.money
    
    save_campaign_data()
    return {"success": True, "data": CAMPAIGN_DATA[slug]}

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

# --- Endpoints de Investimentos ---

class InvestmentItem(BaseModel):
    cityId: str
    cityName: str
    ano: int
    valor: float
    area: Optional[str] = ""
    tipo: Optional[str] = ""
    descricao: Optional[str] = ""

class InvestmentsUpdate(BaseModel):
    investments: List[InvestmentItem]

@app.get("/api/investments/data")
async def get_investments_data():
    """Retorna todos os investimentos salvos."""
    return {"investments": INVESTMENTS_DATA, "count": len(INVESTMENTS_DATA)}

@app.post("/api/investments/save")
async def save_investments(data: InvestmentsUpdate):
    """Salva/sobrescreve todos os investimentos."""
    global INVESTMENTS_DATA
    INVESTMENTS_DATA = [inv.dict() for inv in data.investments]
    save_investments_data()
    rebuild_campaign_data() # Atualiza agregados
    return {"success": True, "count": len(INVESTMENTS_DATA)}

# --- Endpoints de Votos (por Cidade/Ano) ---

class VotosUpdate(BaseModel):
    votos: dict  # { 'cidade-slug': [{ ano: int, votos: int }, ...] }

@app.get("/api/votos/data")
async def get_votos_data():
    """Retorna todos os votos salvos por cidade/ano."""
    return {"votos": VOTOS_DATA, "count": len(VOTOS_DATA)}

@app.post("/api/votos/save")
async def save_votos(data: VotosUpdate):
    """Salva/sobrescreve todos os votos."""
    global VOTOS_DATA
    VOTOS_DATA = data.votos
    save_votos_data()
    rebuild_campaign_data() # Atualiza agregados
    return {"success": True, "count": len(VOTOS_DATA)}

# --- Exportação Excel (Backend) ---
class ExportItem(BaseModel):
    city: str
    votes: int
    investment: float
    conversion: float
    cost_per_vote: float
    cost_per_pop: float
    share: float

class ExportRequest(BaseModel):
    items: List[ExportItem]

@app.post("/api/export_excel")
async def export_excel(data: ExportRequest):
    wb = Workbook()
    ws = wb.active
    ws.title = "Resumo Campanha"
    
    # Headers
    headers = ["Cidade", "Votos", "Investimento (R$)", "Conversão (%)", "R$/Voto", "R$/Pop", "Participação (%)"]
    ws.append(headers)
    
    for item in data.items:
        ws.append([
            item.city, 
            item.votes, 
            item.investment, 
            item.conversion, 
            item.cost_per_vote, 
            item.cost_per_pop, 
            item.share
        ])
        
    # Ajuste de largura
    ws.column_dimensions['A'].width = 25
    ws.column_dimensions['B'].width = 15
    ws.column_dimensions['C'].width = 20
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 15
    ws.column_dimensions['F'].width = 15
    ws.column_dimensions['G'].width = 15

    # Salvar em disco (Static File) para garantir download robusto
    filename = "resumo_campanha.xlsx"
    filepath = os.path.join(os.getcwd(), filename)
    
    try:
        wb.save(filepath)
    except Exception as e:
        print(f"Erro ao salvar arquivo excel: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao gerar arquivo no disco.")

    # Retorna a URL direta para download
    return {"success": True, "download_url": f"/{filename}"}


# --- Ferramentas de Busca ---
def search_web(query: str, max_results: int = 3):
    """Busca no DuckDuckGo para obter informações recentes."""
    try:
        results = DDGS().text(query, max_results=max_results)
        return results
    except Exception as e:
        print(f"Erro na busca: {e}")
        return []

# --- Lógica de Chat ---

def get_target_city(message: str, current_context: Optional[str]):
    """Identifica a cidade alvo na mensagem ou contexto."""
    target_city_data = None
    target_city_slug = None
    
    # 1. Se contexto for genérico, busca na mensagem
    if not current_context or "Estado Geral" in current_context:
        message_lower = message.lower()
        for slug, data in CITIES_DATA.items():
            if data.get("nome", "").lower() in message_lower:
                return data, slug
    else:
        # 2. Se contexto já existe, tenta validar
        for slug, data in CITIES_DATA.items():
            if data.get("nome", "") in current_context:
                return data, slug
                
    return None, None

def build_local_data_context(city_data, city_slug):
    """Constrói o contexto de dados locais da cidade."""
    if not city_data:
        return ""
        
    context = f"""
    DADOS GERAIS DE {city_data.get('nome').upper()}:
    - Prefeito: {city_data.get('prefeito')} ({city_data.get('partido')})
    - Habitantes: {city_data.get('habitantes')} (Fonte: IBGE)
    - Área: {city_data.get('area_km2')} km²
    - PIB per Capita: R$ {city_data.get('pib_per_capita')}
    - IDHM: {city_data.get('idhm')}
    - Descrição: {city_data.get('descricao')}
    """
    
    # Dados Eleitorais
    if city_slug:
        normalized_slug = city_slug.lower().replace("-", "_")
        city_electoral = ELECTORAL_DATA.get(normalized_slug)
        
        if not city_electoral:
             # Fallback: search by name
             search_name = city_data.get('nome', '').lower()
             for v in ELECTORAL_DATA.values():
                 if v.get('nome', '').lower() == search_name:
                     city_electoral = v
                     break
                     
        if city_electoral:
            context += f"""
            \n--- DADOS ELEITORAIS DETALHADOS (TSE) ---
            Total de Eleitores: {city_electoral.get('total_eleitores')}
            Estatísticas de Gênero: {json.dumps(city_electoral.get('genero', {}), ensure_ascii=False)}
            Faixa Etária (Mulheres/Homens): {json.dumps(city_electoral.get('faixa_etaria', {}), ensure_ascii=False)}
            Grau de Instrução: {json.dumps(city_electoral.get('grau_instrucao', {}), ensure_ascii=False)}
            Estado Civil: {json.dumps(city_electoral.get('estado_civil', {}), ensure_ascii=False)}
            """
            
    # Dados de Campanha
    if city_slug in CAMPAIGN_DATA:
        camp = CAMPAIGN_DATA[city_slug]
        votes = camp.get('votes', 0)
        money = camp.get('money', 0)
        
        pop = int(city_data.get('habitantes', 0))
        cost_vote = (money / votes) if votes > 0 else 0
        cost_pop = (money / pop) if pop > 0 else 0
        
        # Conversão
        normalized_slug = city_slug.lower().replace("-", "_")
        total_eleitores = 0
        if ELECTORAL_DATA.get(normalized_slug):
            total_eleitores = ELECTORAL_DATA[normalized_slug].get('total_eleitores', 0)
            
        conversion_rate = (votes / total_eleitores * 100) if total_eleitores > 0 else 0
        
        context += f"""
        \n--- DADOS DE CAMPANHA E INSIGHTS (Base Interna) ---
        - Votos Recebidos: {votes:,}
        - Investimento Total: R$ {money:,.2f}
        - Custo por Voto (ROI): R$ {cost_vote:.2f}
        - Custo por Habitante: R$ {cost_pop:.2f}
        - Taxa de Conversão (Votos/Eleitorado): {conversion_rate:.2f}%
        """
        
    return context

import re

def get_demographic_summary(slug):
    """Retorna resumo demográfico para uma cidade."""
    n_slug = slug.lower().replace("-", "_")
    data = ELECTORAL_DATA.get(n_slug)
    if not data:
        # Tenta fallback pelo nome nas keys
        for k, v in ELECTORAL_DATA.items():
            if slug.replace("-", " ") in k.replace("_", " "):
                data = v
                break
    
    if not data:
        return "Dados demográficos não disponíveis."
        
    total = data.get('total_eleitores', 0)
    
    # Gênero
    gen = data.get('genero', {})
    fem = gen.get('FEMININO', 0)
    masc = gen.get('MASCULINO', 0)
    fem_pct = (fem / total * 100) if total > 0 else 0
    
    # Faixa Etária Dominante
    faixas = data.get('faixa_etaria', {})
    # Simplifica para achar a maior faixa (somando M+F)
    best_faixa = "N/A"
    max_count = -1
    for faixa, counts in faixas.items():
        total_faixa = counts.get('M', 0) + counts.get('F', 0)
        if total_faixa > max_count:
            max_count = total_faixa
            best_faixa = faixa
            
    return f"Eleitorado: {total:,} | Mulheres: {fem_pct:.1f}% | Faixa etária principal: {best_faixa}"

def build_strategic_report(message):
    """Gera insights estratégicos, busca dados e demografia."""
    message_lower = message.lower()
    
    keywords = ["invest", "voto", "gast", "dinheiro", "quais", "onde", "cidade", "quanto", "relatório", "analis", "melhor", "público", "idade", "perfil"]
    if not any(k in message_lower for k in keywords):
        return ""
        
    clean_msg = message.replace(".", "").replace(",", ".")
    numbers = re.findall(r'\d+', clean_msg)
    target_values = [float(n) for n in numbers if len(n) > 1]

    all_campaigns = []
    
    matches_money = []
    matches_votes = []
    
    active_campaigns = 0
    total_invested = 0
    
    for slug, camp in CAMPAIGN_DATA.items():
        if slug not in CITIES_DATA: continue
        city = CITIES_DATA[slug]
        
        votes = camp.get('votes', 0)
        money = camp.get('money', 0)
        
        if votes == 0 and money == 0: continue
        
        active_campaigns += 1
        total_invested += money
        
        n_slug = slug.lower().replace("-", "_")
        eleitores = 0
        if ELECTORAL_DATA.get(n_slug):
            eleitores = ELECTORAL_DATA[n_slug].get('total_eleitores', 0)
        
        conv = (votes/eleitores*100) if eleitores > 0 else 0
        cpv = (money/votes) if votes > 0 else 0
        
        # Busca demografia
        demo_summary = get_demographic_summary(slug)
        
        item = {
            "nome": city['nome'],
            "votes": votes,
            "money": money,
            "conversion": conv,
            "cost_vote": cpv,
            "demo": demo_summary
        }
        all_campaigns.append(item)
        
        for val in target_values:
            if abs(money - val) < 1.0: matches_money.append(item)
            if abs(votes - val) < 1.0: matches_votes.append(item)

    top_money = sorted(all_campaigns, key=lambda x: x['money'], reverse=True)
    top_votes = sorted(all_campaigns, key=lambda x: x['votes'], reverse=True)
    top_conv = sorted(all_campaigns, key=lambda x: x['conversion'], reverse=True)
    
    report = "\n--- DADOS COMPLETOS PARA ANÁLISE ESTRATÉGICA ---\n"
    report += f"Resumo Global: {active_campaigns} cidades ativas. Total Investido: R$ {total_invested:,.2f}.\n\n"
    
    if matches_money:
        report += f"🎯 MATCH FINANCEIRO (Valor exato encontrado):\n"
        for m in matches_money:
            report += f"- {m['nome']}: Investimento R$ {m['money']:,.2f} | {m['demo']}\n"
        report += "\n"
        
    report += "🏆 Top 10 Maior Investimento (Use para analisar custo-benefício):\n"
    for x in top_money[:10]:
        report += f"- {x['nome']}: R$ {x['money']:,.2f} | Votos: {x['votes']} | Conv: {x['conversion']:.2f}% | R$/Voto: {x['cost_vote']:.2f} | {x['demo']}\n"
    report += "\n"
    
    report += "🏆 Top 10 Melhor Conversão (Cidades mais eficientes):\n"
    for x in top_conv[:10]:
         report += f"- {x['nome']}: Conv: {x['conversion']:.2f}% | Invest: R$ {x['money']:,.2f} | Votos: {x['votes']} | {x['demo']}\n"
    report += "\n"

    # Se a pergunta pedir "todas" ou "quais", e a lista for curta, manda tudo
    if len(all_campaigns) <= 50 and ("quais" in message_lower or "lista" in message_lower or "todas" in message_lower or "melhor" in message_lower):
        report += "📋 Relatório Geral de Todas as Campanhas:\n"
        for x in top_money:
             report += f"- {x['nome']}: R$ {x['money']:,.2f} | Votos: {x['votes']} | Conv: {x['conversion']:.2f}% | {x['demo']}\n"
    
    return report

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    if not API_KEY:
        return {
            "response": "⚠️ **A API Key da OpenAI não foi configurada.**\n\n"
                        "Configure a chave no arquivo `.env` para ativar a inteligência.",
            "sources": []
        }

    client = OpenAI(api_key=API_KEY)
    
    # 1. Identificar Cidade
    target_city_data, target_city_slug = get_target_city(request.message, request.city_context)
    city_name = target_city_data.get('nome') if target_city_data else 'Indefinida'
    
    # 2. Construir Contextos
    local_data_context = build_local_data_context(target_city_data, target_city_slug)
    db_analysis_context = build_strategic_report(request.message)
    
    # Contexto de Partidos (se mencionado)
    unique_parties = set(c.get('partido') for c in CITIES_DATA.values() if c.get('partido'))
    mentioned_parties = [p for p in unique_parties if p.lower() in request.message.lower().split()]
    
    if mentioned_parties:
        db_analysis_context += "\n--- ANÁLISE DE PARTIDOS ---\n"
        for p in mentioned_parties:
            cities_of_party = [c for c in CITIES_DATA.values() if c.get('partido') == p]
            count = len(cities_of_party)
            cities_of_party.sort(key=lambda x: int(x.get('habitantes', 0)), reverse=True)
            top_5 = [c['nome'] for c in cities_of_party[:5]]
            db_analysis_context += f"Partido {p}: {count} prefeitos. Maiores cidades: {', '.join(top_5)}...\n"

    # Contexto de Cidades Mencionadas (se não for a alvo)
    mentioned_cities = []
    if not target_city_data: # Só busca outras se não focar em uma
        for slug, c in CITIES_DATA.items():
            if c.get('nome', '').lower() in request.message.lower():
                 mentioned_cities.append(c)
        if mentioned_cities:
             db_analysis_context += "\n--- OUTRAS CIDADES MENCIONADAS ---\n"
             for c in mentioned_cities[:3]: 
                 db_analysis_context += f"{c['nome']}: Prefeito {c.get('prefeito')} ({c.get('partido')}), {c.get('habitantes')} hab.\n"

    # 3. Busca Web (se necessário)
    search_context = ""
    sources = []
    
    # Lógica de decisão de busca
    needs_search = True
    if mentioned_parties: needs_search = False
    if target_city_data and "população" in request.message.lower(): needs_search = False # Já temos no local
    
    if needs_search:
        query_entity = target_city_data.get("nome") if target_city_data else "Paraná"
        safe_message = request.message.replace('"', '').replace("'", "")
        
        # Busca restrita a sites oficiais (IBGE e TSE)
        # Tenta buscar diretamente nos dominios solicitados
        search_query = f'{safe_message} "{query_entity}" (site:ibge.gov.br OR site:tse.jus.br)'
        
        print(f"Buscando: {search_query}")
        search_results = search_web(search_query, max_results=4)
        
        # Se falhar, tenta uma busca mais aberta mas ainda focada em dados oficiais
        if not search_results:
             fallback_query = f'{safe_message} "{query_entity}" dados oficiais TSE IBGE'
             print(f"Fallback busca: {fallback_query}")
             search_results = search_web(fallback_query, max_results=3)
             
        if search_results:
            search_context = "\n\nInformações Oficiais da Web (IBGE/TSE):\n"
            for res in search_results:
                search_context += f"- {res['title']}: {res['body']} (Link: {res['href']})\n"
                # sources.append({"title": res['title'], "url": res['href']}) # Desabilitado conforme solicitado

    # 4. Investment Context
    investment_analysis = request.investment_context or ""
    
    # 5. Prompt System
    system_prompt = f"""
    Você é um Estrategista de Marketing Político e Analista de Investimentos Públicos de elite.
    
    OBJETIVO:
    Analisar os dados de campanha, demográficos E DE INVESTIMENTOS/EMENDAS para responder às perguntas do usuário com insights de alto nível.
    
    INSTRUÇÕES:
    1. **Análise de Eficiência**: Sempre que possível, avalie a eficiência do gasto. Custo/Voto baixo é bom. Conversão alta é ótima.
    2. **Insights Demográficos**: Use os dados de "Faixa Etária Principal" e "Porcentagem de Mulheres" para sugerir como conversar com o eleitorado dessas cidades.
    3. **Melhores Cidades**: Se perguntado sobre "onde investir", cruze o 'Custo/Voto' com a 'Conversão'. Cidades com muitos eleitores e pouco investimento atual são minas de ouro.
    4. **Análise de Investimentos/Emendas**: Quando perguntado sobre investimentos, emendas, projetos ou recursos:
       - Use os dados de INVESTIMENTOS IMPORTADOS para responder
       - Identifique tendências de crescimento ou redução ao longo dos anos
       - Analise a distribuição por ÁREA (Saúde, Educação, Infraestrutura, etc.) e TIPO (Bancada, Impositiva, Estado, etc.)
       - Compare investimentos entre cidades
       - Sugira oportunidades baseadas nos dados
    5. **Tom de Voz**: Profissional, analítico, mas direto. Use bullet points e tabelas markdown para facilitar a leitura.
    
    CONTEXTO DISPONÍVEL:
    [CIDADE SELECIONADA: {city_name}]
    {local_data_context}
    
    [ANÁLISE ESTRATÉGICA E DEMOGRÁFICA (GLOBAL/COMPARATIVA)]
    {db_analysis_context}
    
    [DADOS DE INVESTIMENTOS/EMENDAS PARLAMENTARES]
    {investment_analysis}
    
    [RESULTADOS DE BUSCA COMPLEMENTAR]
    {search_context}
    
    ---
    Responda em markdown. Seja o consultor que o político precisa para vencer.
    Se perguntado sobre investimentos e não houver dados, informe que nenhum dado de investimento foi importado ainda.
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ],
            temperature=0.5,
            max_tokens=600
        )
        # O frontend espera 'sources', mas o usuário pediu para não retornar/mostrar.
        # Vamos mandar vazio ou oculto.
        return {"response": response.choices[0].message.content, "sources": []}

    except Exception as e:
        print(f"Erro OpenAI: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Middleware para desabilitar cache (Desenvolvimento Mobile)
@app.middleware("http")
async def add_no_cache_header(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Servir arquivos estáticos (HTML, CSS, JS) na raiz
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    print("Iniciando servidor na porta 8082...")
    print("Acesse: http://localhost:8082")
    uvicorn.run(app, host="0.0.0.0", port=8082, reload=False)
