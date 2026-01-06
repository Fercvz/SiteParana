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

    # Tenta carregar dados eleitorais
    if os.path.exists("dados_eleitorais.json"):
        with open("dados_eleitorais.json", "r", encoding="utf-8") as f:
            ELECTORAL_DATA = json.load(f)
        print(f"Dados eleitorais de {len(ELECTORAL_DATA)} cidades carregados.")
    
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
    
    # 2. Busca na Web (apenas se necessário ou complementar)
    query_entity = target_city_data.get("nome") if target_city_data else "Paraná política"
    search_query = f"{query_entity} {request.message}"
    
    is_ranking_question = any(x in request.message.lower() for x in ["mais populoso", "maior população", "maior cidade", "menor cidade", "maiores cidades"])
    
    if not is_ranking_question:
        print(f"Buscando no DuckDuckGo: {search_query}")
        search_results = search_web(search_query, max_results=3)
        if search_results:
            search_context = "\n\nInformações RECENTES da Web (DuckDuckGo):\n"
            for res in search_results:
                search_context += f"- {res['title']}: {res['body']} (Fonte: {res['href']})\n"
                sources.append({"title": res['title'], "url": res['href']})
    else:
        print("Pergunta estatística detectada, usando dados locais globais.")

    # 3. Montar o Prompt do Sistema Refinado com GUARDRAILS
    system_prompt = f"""
    Você é um assistente virtual integrado ao "Mapa Interativo do Paraná".
    Sua missão é explicar e analisar os dados do site.

    Contexto de Dados:
    1. RANKINGS ESTADUAIS (Top 10):
    {GLOBAL_STATS}
    
    2. DADOS DA CIDADE SELECIONADA ({target_city_data.get('nome') if target_city_data else 'Indefinida'}):
    {local_data_context}
    
    3. INFORMAÇÕES EXTERNAS (APENAS SE RELEVANTE):
    {search_context}
    
    ---
    
    DIRETRIZES DE ESCOPO (IMPORTANTE):
    Você deve responder APENAS a perguntas relacionadas a:
    - Dados do site (População, Eleitorado, Prefeitos, Partidos, IDH, PIB).
    - Geografia e Política do Paraná.
    - Análises estatísticas baseadas nos dados fornecidos.
    
    FILTRO DE RELEVÂNCIA:
    Antes de responder, analise: "Esta pergunta tem a ver com o Paraná, seus municípios ou dados públicos/políticos?"
    - SIM: Responda com base nos dados.
    - NÃO (ex: "Receita de bolo", "Quem ganhou a copa?", "Dicas de Python", "Resumo de filme"):
      Responda: "Desculpe, sou um assistente especializado apenas em dados políticos e demográficos do Paraná. Não posso ajudar com outros assuntos."
    
    Instruções de Resposta:
    1. Se a pergunta for sobre estatísticas (ex: "quantas mulheres?"), USE OS DADOS JSON FORNECIDOS. Calcule se necessário.
    2. Se a pergunta for vaga (ex: "fale sobre a cidade"), faça um resumo dos dados principais (População, Prefeito, PIB).
    3. Seja direto.
    """

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
        raise HTTPException(status_code=500, detail=str(e))

# Servir arquivos estáticos (HTML, CSS, JS) na raiz
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    print("Iniciando servidor na porta 8082...")
    print("Acesse: http://localhost:8082")
    uvicorn.run(app, host="0.0.0.0", port=8082)
