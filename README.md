# Agent Company

A full-stack chatbot powered by **Google Gemini**, built with **FastAPI** (backend) and **Next.js** (frontend).

## Project Structure

```
agent-manager/
├── backend/          # FastAPI + uv (Python 3.14)
│   ├── src/backend/
│   │   ├── main.py           # FastAPI app + CORS
│   │   ├── config.py         # Settings via pydantic-settings
│   │   ├── models.py         # Pydantic request/response models
│   │   ├── gemini_service.py # Gemini API integration
│   │   └── routers/
│   │       └── chat.py       # POST /api/chat endpoint
│   ├── .env                  # Your API key (not committed)
│   └── pyproject.toml
│
└── frontend/         # Next.js 15 + pnpm + TypeScript + Tailwind
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx      # Chat UI
    │   │   ├── layout.tsx    # Root layout
    │   │   └── globals.css   # Design system
    │   └── lib/
    │       └── api.ts        # Backend API client
    └── .env.local            # API URL config
```

## Setup

### 1. Get a Gemini API Key

Go to [Google AI Studio](https://aistudio.google.com/) and create an API key.

### 2. Backend

Choose one of the following methods to setup and run the backend:

#### Option A: Standard Python (with venv & pip)

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows, use: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Add your Gemini API key
echo "GEMINI_API_KEY=your_key_here" > .env

# Run dev server
python -m uvicorn src.backend.main:app --reload --port 8000
```

#### Option B: Using `uv` (Recommended)

```bash
cd backend

# Add your Gemini API key
echo "GEMINI_API_KEY=your_key_here" > .env

# Run dev server using uv
uv run uvicorn src.backend.main:app --reload --port 8000
```

API available at: `http://localhost:8000`  
Docs at: `http://localhost:8000/docs`

### 3. Frontend

```bash
cd frontend
pnpm dev
```

App available at: `http://localhost:3000`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/chat` | Send message to Gemini |

### Chat Request

```json
{
  "message": "Hello!",
  "history": [
    { "role": "user", "content": "Previous message" },
    { "role": "model", "content": "Previous reply" }
  ]
}
```
