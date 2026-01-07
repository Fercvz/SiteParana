
import requests
print("START DEBUG")
try:
    r = requests.post("http://localhost:8082/api/chat", json={"message":"Test", "city_context": "Curitiba"}, timeout=15)
    print(f"STATUS: {r.status_code}")
    print(f"BODY: {r.text}")
except Exception as e:
    print(f"ERROR: {e}")
print("END DEBUG")
