
import requests
import json

try:
    res = requests.post(
        "http://localhost:8082/api/chat",
        json={
            "message": "Qual a população de Curitiba?",
            "city_context": "Curitiba",
            "mayor_context": "Rafael Greca",
            "site_stats": "..."
        }
    )
    print(f"Status: {res.status_code}")
    print(f"Response: {res.text}")
except Exception as e:
    print(f"Request failed: {e}")
