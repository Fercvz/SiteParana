
import requests
import json
import time

print("Testing connection to http://localhost:8082/api/chat...")

try:
    # 1. Test Health/Root
    try:
        r = requests.get("http://localhost:8082/")
        print(f"Root Status: {r.status_code}") # Should be 404 or index.html if static mounted
    except Exception as e:
        print(f"Root connection failed: {e}")

    # 2. Test Chat
    payload = {
        "message": "Teste de conexão",
        "city_context": "Curitiba",
        "mayor_context": "Greca",
        "site_stats": "Stats"
    }
    
    headers = {'Content-Type': 'application/json'}
    
    print("Sending POST request...")
    res = requests.post("http://localhost:8082/api/chat", json=payload, headers=headers, timeout=10)
    
    print(f"Chat Status: {res.status_code}")
    print(f"Response: {res.text[:500]}")

except Exception as e:
    print(f"\nCRITICAL ERROR: {e}")
