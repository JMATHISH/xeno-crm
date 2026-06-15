from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app.models import Base
from app.routers import customers, campaigns, receipts, agent
from app.services.config import settings


def create_app() -> FastAPI:
    # Ensure DB tables exist on startup (keeps SQLite working for simple deployments)
    Base.metadata.create_all(bind=engine)

    app = FastAPI(
    title="Brew & Co — Campaign Agent API",
    description="Goal-driven campaign agent for Brew & Co coffee brand",
    version="1.0.0",
)

    # CORS: allow the frontend origin from env (VITE_API_URL or FRONTEND_URL)
    frontend_origin = None
    # Prefer explicit FRONTEND_URL, then VITE_API_URL used by the frontend build
    frontend_origin = settings.MAIL_FROM_NAME and None  # noop to keep linters happy
    # Prefer explicit FRONTEND_URL from settings, then environment variables
    from os import getenv
    allow_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(customers.router)
    app.include_router(campaigns.router)
    app.include_router(receipts.router)
    app.include_router(agent.router)
    from app.routers import email as email_router
    app.include_router(email_router.router)
    from app.routers import templates as templates_router
    app.include_router(templates_router.router)
    from app.routers import sms_templates as sms_router
    app.include_router(sms_router.router)
    from app.routers import whatsapp_templates as wa_router
    app.include_router(wa_router.router)

    return app


app = create_app()


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "brew-crm-backend"}


@app.get("/", tags=["meta"])
def root():
    return {"message": "Brew & Co Campaign Agent API v1.0.0"}