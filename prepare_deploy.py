import os
import shutil

def prepare_deploy():
    # Define source and destination
    source_dir = os.getcwd()
    dist_dir = os.path.join(source_dir, 'dist')
    
    # Files to include in the deployment
    files_to_copy = [
        'index.html',
        'styles.css',
        'script.js',
        'mapa_pr.svg',
        'cidades_pr.json',
        'dados_eleitorais.json'
    ]
    
    # Create dist directory (clean it if it exists)
    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
        print(f"Limpando diretório anterior: {dist_dir}")
    
    os.makedirs(dist_dir)
    print(f"Criando diretório de deploy: {dist_dir}")
    
    # Copy files
    print("\nCopiando arquivos...")
    for filename in files_to_copy:
        src = os.path.join(source_dir, filename)
        dst = os.path.join(dist_dir, filename)
        
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"✓ Copiado: {filename}")
        else:
            print(f"❌ ERRO: Arquivo não encontrado: {filename}")
            
    print("\n" + "="*50)
    print("PRONTO PARA DEPLOY!")
    print("="*50)
    print(f"Os arquivos finais estão na pasta: {dist_dir}")
    print("\nOpções para publicar:")
    print("1. Netlify Drop: Arraste a pasta 'dist' para https://app.netlify.com/drop")
    print("2. Vercel/GitHub: Suba o conteúdo da pasta 'dist' (ou a raiz configurada) para seu repositório.")

if __name__ == "__main__":
    prepare_deploy()
