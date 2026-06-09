# -*- coding: utf-8 -*-
import requests
import json
import sys
import os

API_KEY = os.environ.get("CLAUDE_API_KEY")
BASE_URL = os.environ.get("CLAUDE_API_BASE_URL", "https://rsxermu666.cn")

MODELS = {
    "1": "claude-opus-4-8 (1M)",
    "2": "claude-opus-4-8-thinking",
    "3": "claude-opus-4-7",
    "4": "claude-opus-4-7-thinking",
    "5": "claude-opus-4-6",
    "6": "claude-opus-4-6 (1M)",
    "7": "claude-opus-4-6-thinking",
    "8": "claude-haiku-4-5"
}

def select_model():
    print("\n=== Select Model ===")
    for key, value in MODELS.items():
        print("  {}. {}".format(key, value))
    print("  q. Quit")
    
    choice = input("\nSelect (1-8): ").strip()
    if choice == 'q':
        sys.exit(0)
    
    return MODELS.get(choice, "claude-opus-4-8 (1M)")

def chat(model, message):
    headers = {
        "x-api-key": API_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01"
    }
    
    data = {
        "model": model,
        "max_tokens": 4000,
        "messages": [{"role": "user", "content": message}]
    }
    
    try:
        response = requests.post("{}/v1/messages".format(BASE_URL), headers=headers, json=data, timeout=60)
        result = response.json()
        
        if "content" in result:
            return result["content"][0]["text"]
        elif "error" in result:
            return "API Error: {}".format(result['error'])
        else:
            return "Unexpected response: {}".format(json.dumps(result, indent=2))
    except requests.exceptions.Timeout:
        return "Error: Request timeout"
    except requests.exceptions.ConnectionError:
        return "Error: Connection failed"
    except Exception as e:
        return "Error: {}".format(str(e))

def main():
    if not API_KEY:
        print("Error: CLAUDE_API_KEY is not set")
        sys.exit(1)

    print("=" * 50)
    print("  Claude CLI - Third-party API")
    print("=" * 50)
    
    model = select_model()
    print("\nCurrent model: {}".format(model))
    print("-" * 50)
    print("Type '/model' to switch model")
    print("Type '/quit' or 'quit' to exit")
    print("-" * 50)
    
    while True:
        try:
            user_input = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\nGoodbye!")
            break
        
        if not user_input:
            continue
        
        if user_input.lower() in ['/quit', 'quit', 'exit']:
            print("\nGoodbye!")
            break
        
        if user_input.lower() == '/model':
            model = select_model()
            print("\nSwitched to: {}".format(model))
            continue
        
        print("\nClaude: ", end="", flush=True)
        response = chat(model, user_input)
        print(response)

if __name__ == "__main__":
    main()
