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
API_KEY = os.getenv("OPENAI_API_KEY") 

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
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    if not API_KEY:
        # Modo de Simulação se não houver chave
        return {
            "response": "⚠️ **A API Key da OpenAI não foi configurada.**\n\n"
                        "Para ativar a inteligência real, configure a chave no arquivo `server.py`.\n\n"
                        f"Eu buscaria informações sobre: *{request.city_context}* e responderia sua pergunta: *'{request.message}'*.",
            "sources": []
        }

    client = OpenAI(api_key=API_KEY)
    
    # 1. Analisar se precisa de busca na web (Simples heurística ou chamada direta)
    # Para este MVP, sempre buscaremos se houver contexto de cidade para enriquecer
    search_context = ""
    sources = []
    
    if True: 
        # 1. Identificar se o usuário mencionou uma cidade específica na mensagem
        # Isso evita buscar "Paraná (Estado Geral)" quando a pergunta é sobre "Londrina"
        target_entity = request.city_context
        
        # Lista simples de grandes cidades para heurística ou apenas usar o texto da pergunta
        if not target_entity or "Estado Geral" in target_entity or "Paraná" in target_entity:
            # Tenta pegar termos relevantes da mensagem (heurística simples)
            # Se o usuário disse "Londrina", usamos "Londrina"
            common_cities = ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "Foz do Iguaçu", "São José dos Pinhais", "Colombo", "Guarapuava", "Paranaguá"]
            for city in common_cities:
                if city.lower() in request.message.lower():
                    target_entity = city
                    break
            
            if not target_entity or "Estado Geral" in target_entity:
                target_entity = "Paraná"

        # 2. Montar Query Limpa
        # Ex: "Londrina prefeito ações Natal 2024"
        search_query = f"{target_entity} {request.message}"
        
        # Remove palavras de ligação para busca ficar mais densa
        # (Opcional, mas ajuda no DuckDuckGo)
        
        # Reformula para notícias se for pergunta de atualidades
        if any(term in request.message.lower() for term in ["prefeito", "natal", "obra", "ação", "aconteceu"]):
            search_query = f"{target_entity} notícias recentes {request.message}"

        print(f"Buscando no DuckDuckGo: {search_query}")
        
        # Aumentar resultados para garantir informação
        search_results = search_web(search_query, max_results=5)
        
        if search_results:
            search_context = "\n\nInformações RECENTES da Web (DuckDuckGo):\n"
            for res in search_results:
                search_context += f"- {res['title']}: {res['body']} (Fonte: {res['href']})\n"
                sources.append({"title": res['title'], "url": res['href']})

    # 2. Montar o Prompt do Sistema
    system_prompt = f"""
    Você é um assistente especialista em geografia e política do Paraná, integrado a um mapa interativo.
    
    Contexto Atual:
    Cidade: {request.city_context}
    Prefeito: {request.mayor_context}
    
    Dados Estatísticos do Site (IMPORTANTE):
    {request.site_stats}
    
    {search_context}
    
    Instruções:
    1. Responda de forma concisa e útil.
    2. USE as informações da busca web para responder sobre eventos recentes.
    3. Se não souber, diga que não encontrou informações recentes.
    4. Mantenha um tom profissional e cívico.
    5. RESTRIÇÃO IMPORTANTE: Você deve responder APENAS a perguntas relacionadas à política (prefeitos, eleições, obras, gestão pública) e informações geográficas/demográficas do site.
    6. Se o usuário perguntar sobre outros assuntos (esportes, culinária, entretenimento, etc.), responda educadamente: "Desculpe, sou uma IA especializada apenas em política e dados do Paraná. Posso ajudar com informações sobre prefeitos, eleições ou dados demográficos?"
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o", # Ou gpt-3.5-turbo
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ],
            temperature=0.7,
            max_tokens=500
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
