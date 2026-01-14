import requests
import json

url = "http://localhost:8082/api/campaign/update_bulk"
payload = {
    "items": [
        {
            "city_slug": "abatia",
            "votes": 123,
            "money": 1000.50
        }
    ]
}

try:
    print(f"Sending payload: {payload}")
    response = requests.post(url, json=payload)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
