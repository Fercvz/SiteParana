"""
Script para baixar e processar dados eleitorais do TSE.
Baixa o arquivo de perfil do eleitorado e agrega por município do Paraná.
"""

import json
import csv
import zipfile
import os
import io
import urllib.request
import unicodedata

# URLs dos dados do TSE
PERFIL_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitorado/perfil_eleitorado_2024.zip"
OUTPUT_FILE = "dados_eleitorais.json"
TEMP_DIR = "temp_tse"

def normalize_key(name):
    """Normaliza nome da cidade para chave."""
    if not name:
        return ""
    # Remove acentos
    nfkd = unicodedata.normalize('NFKD', name)
    clean = "".join([c for c in nfkd if not unicodedata.combining(c)])
    # Converte para minúsculas e remove espaços
    return clean.lower().replace(' ', '_').replace('-', '_').replace("'", "")

def download_and_extract(url, extract_to):
    """Baixa e extrai arquivo ZIP."""
    print(f"Baixando dados de: {url}")
    
    # Cria diretório temporário
    if not os.path.exists(extract_to):
        os.makedirs(extract_to)
    
    # Verifica se já existe o arquivo extraído ou o zip
    if os.path.exists(os.path.join(extract_to, "data.zip")) or any(f.endswith('.csv') for f in os.listdir(extract_to) if os.path.isfile(os.path.join(extract_to, f))):
        print("Arquivo de dados já existe. Pulando download.")
        return extract_to

    # Baixa o arquivo
    zip_path = os.path.join(extract_to, "data.zip")
    urllib.request.urlretrieve(url, zip_path)
    print(f"Download concluído: {zip_path}")
    
    # Extrai
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)
    print(f"Arquivos extraídos em: {extract_to}")
    
    # Lista arquivos extraídos
    files = os.listdir(extract_to)
    print(f"Arquivos encontrados: {files}")
    
    return extract_to

def process_perfil_eleitorado(csv_path):
    """Processa o CSV de perfil do eleitorado."""
    print(f"\nProcessando: {csv_path}")
    
    # Estrutura para armazenar dados por cidade
    cidades = {}
    
    with open(csv_path, 'r', encoding='latin-1') as f:
        # Lê as primeiras linhas para entender a estrutura
        first_lines = [f.readline() for _ in range(5)]
        print("Primeiras linhas do arquivo:")
        for line in first_lines:
            print(f"  {line[:200]}...")
    
    # Reabre para processar
    with open(csv_path, 'r', encoding='latin-1') as f:
        # Tenta detectar o delimitador
        first_line = f.readline()
        f.seek(0)
        
        delimiter = ';' if ';' in first_line else ','
        print(f"Delimitador detectado: '{delimiter}'")
        
        reader = csv.DictReader(f, delimiter=delimiter)
        
        print(f"Colunas encontradas: {reader.fieldnames}")
        
        row_count = 0
        pr_count = 0
        
        for row in reader:
            row_count += 1
            
            # Filtra apenas Paraná (SG_UF = 'PR')
            uf_col = None
            for col in ['SG_UF', 'sg_uf', 'UF', 'uf']:
                if col in row:
                    uf_col = col
                    break
            
            if not uf_col or row.get(uf_col, '').upper() != 'PR':
                continue
            
            pr_count += 1
            
            # Identifica coluna do município
            mun_col = None
            for col in ['NM_MUNICIPIO', 'nm_municipio', 'MUNICIPIO', 'municipio']:
                if col in row:
                    mun_col = col
                    break
            
            if not mun_col:
                continue
            
            cidade = row.get(mun_col, '').strip()
            if not cidade:
                continue
            
            key = normalize_key(cidade)
            
            # Inicializa cidade se não existir
            if key not in cidades:
                cidades[key] = {
                    'nome': cidade,
                    'total_eleitores': 0,
                    'genero': {'masculino': 0, 'feminino': 0, 'nao_informado': 0},
                    'faixa_etaria': {}, # Agora será um dict de dicts
                    'grau_instrucao': {},
                    'estado_civil': {},
                    'cor_raca': {}
                }
            
            # Extrai quantidade de eleitores
            qtd_col = None
            for col in ['QT_ELEITORES_PERFIL', 'qt_eleitores_perfil', 'QT_ELEITORES', 'qt_eleitores']:
                if col in row:
                    qtd_col = col
                    break
            
            qtd = 0
            if qtd_col:
                try:
                    qtd = int(row.get(qtd_col, 0))
                except:
                    qtd = 0
            
            cidades[key]['total_eleitores'] += qtd
            
            # Determina gênero desta linha para usar na faixa etária também
            genero_str = ""
            
            # Gênero
            genero_col = None
            for col in ['DS_GENERO', 'ds_genero', 'GENERO', 'genero']:
                if col in row:
                    genero_col = col
                    break
            
            if genero_col:
                genero = row.get(genero_col, '').upper()
                if 'MASC' in genero:
                    cidades[key]['genero']['masculino'] += qtd
                    genero_str = 'M'
                elif 'FEM' in genero:
                    cidades[key]['genero']['feminino'] += qtd
                    genero_str = 'F'
                else:
                    cidades[key]['genero']['nao_informado'] += qtd
                    genero_str = 'N'
            
            # Faixa etária (Agora com quebra por Gênero)
            faixa_col = None
            for col in ['DS_FAIXA_ETARIA', 'ds_faixa_etaria', 'FAIXA_ETARIA', 'faixa_etaria']:
                if col in row:
                    faixa_col = col
                    break
            
            if faixa_col:
                faixa = row.get(faixa_col, '').strip()
                if faixa:
                    if faixa not in cidades[key]['faixa_etaria']:
                        cidades[key]['faixa_etaria'][faixa] = {'M': 0, 'F': 0, 'N': 0}
                    
                    if genero_str == 'M':
                        cidades[key]['faixa_etaria'][faixa]['M'] += qtd
                    elif genero_str == 'F':
                        cidades[key]['faixa_etaria'][faixa]['F'] += qtd
                    else:
                        cidades[key]['faixa_etaria'][faixa]['N'] += qtd
            
            # Grau de instrução
            instrucao_col = None
            for col in ['DS_GRAU_ESCOLARIDADE', 'ds_grau_escolaridade', 'GRAU_INSTRUCAO', 'grau_instrucao']:
                if col in row:
                    instrucao_col = col
                    break
            
            if instrucao_col:
                instrucao = row.get(instrucao_col, '').strip()
                if instrucao:
                    if instrucao not in cidades[key]['grau_instrucao']:
                        cidades[key]['grau_instrucao'][instrucao] = 0
                    cidades[key]['grau_instrucao'][instrucao] += qtd
            
            # Estado civil
            civil_col = None
            for col in ['DS_ESTADO_CIVIL', 'ds_estado_civil', 'ESTADO_CIVIL', 'estado_civil']:
                if col in row:
                    civil_col = col
                    break
            
            if civil_col:
                civil = row.get(civil_col, '').strip()
                if civil:
                    if civil not in cidades[key]['estado_civil']:
                        cidades[key]['estado_civil'][civil] = 0
                    cidades[key]['estado_civil'][civil] += qtd
            
            # Cor/Raça
            cor_col = None
            for col in ['DS_COR_RACA', 'ds_cor_raca', 'COR_RACA', 'cor_raca']:
                if col in row:
                    cor_col = col
                    break
            
            if cor_col:
                cor = row.get(cor_col, '').strip()
                if cor:
                    if cor not in cidades[key]['cor_raca']:
                        cidades[key]['cor_raca'][cor] = 0
                    cidades[key]['cor_raca'][cor] += qtd
        
        print(f"\nTotal de linhas processadas: {row_count}")
        print(f"Linhas do Paraná: {pr_count}")
        print(f"Cidades encontradas: {len(cidades)}")
    
    return cidades

def convert_to_percentages(cidades):
    """Converte valores absolutos para percentuais."""
    for key, cidade in cidades.items():
        total = cidade['total_eleitores']
        if total == 0:
            continue
        
        # Gênero
        for g in cidade['genero']:
            cidade['genero'][g] = round((cidade['genero'][g] / total) * 100, 1)
        
        # Faixa etária (Agora nested)
        for f in cidade['faixa_etaria']:
            # Divide cada genero pelo Total Geral de Eleitores (não pelo total da faixa)
            # Para que a soma de toda a piramide seja 100% (ou próximo)
            cidade['faixa_etaria'][f]['M'] = round((cidade['faixa_etaria'][f]['M'] / total) * 100, 2)
            cidade['faixa_etaria'][f]['F'] = round((cidade['faixa_etaria'][f]['F'] / total) * 100, 2)
            cidade['faixa_etaria'][f]['N'] = round((cidade['faixa_etaria'][f]['N'] / total) * 100, 2)
        
        # Grau de instrução
        for i in cidade['grau_instrucao']:
            cidade['grau_instrucao'][i] = round((cidade['grau_instrucao'][i] / total) * 100, 1)
        
        # Estado civil
        for e in cidade['estado_civil']:
            cidade['estado_civil'][e] = round((cidade['estado_civil'][e] / total) * 100, 1)
        
        # Cor/Raça
        for c in cidade['cor_raca']:
            cidade['cor_raca'][c] = round((cidade['cor_raca'][c] / total) * 100, 1)
    
    return cidades

def main():
    print("="*60)
    print("PROCESSADOR DE DADOS DO TSE")
    print("="*60)
    
    # Baixa e extrai dados
    try:
        extract_dir = download_and_extract(PERFIL_URL, TEMP_DIR)
    except Exception as e:
        print(f"Erro ao baixar dados: {e}")
        return
    
    # Encontra o arquivo CSV
    csv_file = None
    for f in os.listdir(extract_dir):
        if f.endswith('.csv'):
            csv_file = os.path.join(extract_dir, f)
            break
    
    if not csv_file:
        print("Erro: Arquivo CSV não encontrado!")
        return
    
    # Processa os dados
    cidades = process_perfil_eleitorado(csv_file)
    
    # Converte para percentuais
    cidades = convert_to_percentages(cidades)
    
    # Salva JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(cidades, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Dados salvos em: {OUTPUT_FILE}")
    
    # Exibe algumas estatísticas
    print("\n" + "="*60)
    print("EXEMPLOS DE DADOS:")
    print("="*60)
    
    for i, (key, cidade) in enumerate(cidades.items()):
        if i >= 3:
            break
        print(f"\n{cidade['nome']}:")
        print(f"  Total eleitores: {cidade['total_eleitores']:,}")
        print(f"  Gênero: {cidade['genero']}")
        print(f"  Faixas etárias: {len(cidade['faixa_etaria'])} categorias")

if __name__ == "__main__":
    main()
