import os
import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

def test_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Gemini: SKIPPED (No key)")
        return
    model = "gemini-1.5-flash"
    print(f"Testing Gemini ({model})...")
    # Trying v1 instead of v1beta
    url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    data = {"contents": [{"parts": [{"text": "Hello"}]}]}
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=10)
        if resp.ok:
            print("Gemini: SUCCESS!")
        else:
            print(f"Gemini: FAILED {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"Gemini: ERROR: {e}")

def test_groq():
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        print("Groq: SKIPPED (No key in env)")
        return

    print(f"Testing Groq...")
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    data = {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": "Hello"}]
    }
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=10)
        if resp.ok:
            print("Groq: SUCCESS!")
        else:
            print(f"Groq: FAILED {resp.status_code}")
    except Exception as e:
        print(f"Groq: ERROR: {e}")

if __name__ == "__main__":
    test_gemini()
    test_groq()
