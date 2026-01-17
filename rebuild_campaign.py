import json
import os

print("Reconstruindo campaign_data.json...")

votos_data = {}
investments_data = []

# Carrega votos
if os.path.exists("votos_data.json"):
    try:
        with open("votos_data.json", "r", encoding="utf-8") as f:
            votos_data = json.load(f)
    except Exception as e:
        print(f"Erro ao ler votos: {e}")

# Carrega investimentos
if os.path.exists("investments_data.json"):
    try:
        with open("investments_data.json", "r", encoding="utf-8") as f:
            investments_data = json.load(f)
    except Exception as e:
        print(f"Erro ao ler investimentos: {e}")

new_campaign_data = {}

# Processa votos
print(f"Processando votos de {len(votos_data)} cidades...")
for slug, entries in votos_data.items():
    if slug not in new_campaign_data:
        new_campaign_data[slug] = {"votes": 0, "money": 0}
    
    total_votos = sum(e["votos"] for e in entries)
    new_campaign_data[slug]["votes"] = total_votos

# Processa investimentos
print(f"Processando {len(investments_data)} investimentos...")
for inv in investments_data:
    slug = inv.get("cityId")
    if not slug: continue
    
    if slug not in new_campaign_data:
        new_campaign_data[slug] = {"votes": 0, "money": 0}
    
    new_campaign_data[slug]["money"] += inv.get("valor", 0)

# Salva novo arquivo limpo
with open("campaign_data.json", "w", encoding="utf-8") as f:
    json.dump(new_campaign_data, f, indent=2)

print(f"Sucesso! {len(new_campaign_data)} cidades processadas.")
print("Verificando se Curitiba e Cascavel foram removidas...")
if "curitiba" in new_campaign_data:
    print(f"AVISO: Curitiba ainda existe. Votos: {new_campaign_data['curitiba']['votes']}, Money: {new_campaign_data['curitiba']['money']}")
else:
    print("OK: Curitiba removida.")

if "cascavel" in new_campaign_data:
    print(f"AVISO: Cascavel ainda existe. Votos: {new_campaign_data['cascavel']['votes']}, Money: {new_campaign_data['cascavel']['money']}")
else:
    print("OK: Cascavel removida.")
