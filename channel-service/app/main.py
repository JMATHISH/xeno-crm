import asyncio
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.simulator import simulate_message

app = FastAPI(
    title="Brew & Co — Channel Service",
    description="Simulates message delivery across WhatsApp, Email, and SMS with async callbacks",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SendRequest(BaseModel):
    idempotency_key: str
    channel: str
    message: str
    callback_url: str


@app.post("/send", status_code=202)
async def send_message(req: SendRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        simulate_message,
        idempotency_key=req.idempotency_key,
        channel=req.channel,
        callback_url=req.callback_url,
    )

    return {
        "status": "accepted",
        "idempotency_key": req.idempotency_key,
        "channel": req.channel,
    }


@app.get("/")
def root():
    return {"message": "Channel Service Running"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "brew-crm-channel-service"
    }