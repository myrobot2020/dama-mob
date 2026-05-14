import os
import requests

def test_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    # Try the most likely working model from the list
    model = "gemini-2.0-flash"
    print(f"Testing Gemini with model: {model}...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    data = {
        "contents": [{"parts": [{"text": "Hello, are you working?"}]}]
    }
    try:
        resp = requests.post(url, headers=headers, json=data)
        if resp.ok:
            print("Gemini: SUCCESS!")
            print(f"Response: {resp.json()['candidates'][0]['content']['parts'][0]['text']}")
        else:
            print(f"Gemini: FAILED with status {resp.status_code}")
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Gemini: ERROR: {e}")

if __name__ == "__main__":
    if os.path.exists(".env.local"):
        with open(".env.local") as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    parts = line.strip().split("=", 1)
                    if len(parts) == 2:
                        os.environ[parts[0]] = parts[1]
    test_gemini()
