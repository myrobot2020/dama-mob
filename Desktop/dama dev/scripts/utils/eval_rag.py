import os
import json
import glob
import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def get_groq_response(system_prompt, user_prompt):
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    data = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2
    }
    resp = requests.post(url, headers=headers, json=data)
    if resp.ok:
        return resp.json()["choices"][0]["message"]["content"]
    else:
        raise Exception(f"Groq failed: {resp.text}")

def load_all_suttas():
    suttas = []
    # Search in data/validated-json
    files = glob.glob("data/validated-json/**/*.json", recursive=True)
    for f in files:
        if "index.json" in f: continue
        with open(f, "r", encoding="utf-8") as jf:
            try:
                data = json.load(jf)
                if data.get("valid"):
                    suttas.append({
                        "id": data.get("sutta_id"),
                        "text": data.get("sutta", "") + "\n" + data.get("commentary", "")
                    })
            except:
                pass
    return suttas

def simple_retrieve(query, suttas, top_k=3):
    # Very simple keyword matching for now
    query_words = set(query.lower().split())
    scored = []
    for s in suttas:
        score = sum(1 for word in query_words if word in s["text"].lower())
        scored.append((score, s))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for score, s in scored[:top_k]]

def eval_grounding(question, answer, context):
    eval_prompt = f"""
    You are an evaluator.
    QUESTION: {question}
    CONTEXT: {context}
    ANSWER: {answer}

    Evaluate if the ANSWER is strictly grounded in the CONTEXT.
    If the answer makes claims NOT in the context, mark it as FAILED.
    Return JSON: {{"pass": boolean, "reason": "string"}}
    """
    res = get_groq_response("You are a strict evaluator.", eval_prompt)
    try:
        # Try to find JSON in response
        import re
        m = re.search(r'\{.*\}', res, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        return {"pass": False, "reason": "Eval returned no JSON"}
    except:
        return {"pass": False, "reason": "JSON Parse Error"}

def run_eval_cycle(questions):
    print("Loading suttas...")
    suttas = load_all_suttas()
    print(f"Loaded {len(suttas)} suttas.")

    results = []
    for q in questions:
        print(f"\nProcessing: {q}")
        retrieved = simple_retrieve(q, suttas)
        context = "\n\n---\n\n".join([f"Sutta {s['id']}:\n{s['text']}" for s in retrieved])

        system_prompt = "You are a helpful assistant. Use ONLY the provided context to answer. If the context doesn't have the answer, say so. End with 1 follow-up question."
        user_prompt = f"CONTEXT:\n{context}\n\nQUESTION: {q}"

        try:
            answer = get_groq_response(system_prompt, user_prompt)
            print(f"Answer generated.")

            evaluation = eval_grounding(q, answer, context)
            print(f"Grounding Eval: {'PASS' if evaluation['pass'] else 'FAIL'} - {evaluation['reason']}")

            results.append({
                "question": q,
                "answer": answer,
                "eval": evaluation
            })
        except Exception as e:
            print(f"Error: {e}")

    return results

if __name__ == "__main__":
    test_questions = [
        "What did Buddha say about dung?",
        "How should I handle anger?",
        "What are the benefits of loving-kindness?"
    ]
    results = run_eval_cycle(test_questions)

    with open("tmp/rag_eval_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nResults saved to tmp/rag_eval_results.json")
