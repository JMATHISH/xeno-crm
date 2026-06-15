from twilio.rest import Client
from app.services.config import settings
from typing import Optional

client = None

def _get_client():
    global client
    if client is None:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return client

def send_sms(to_number: str, body: str, from_number: Optional[str] = None) -> dict:
    c = _get_client()
    from_n = from_number or settings.TWILIO_FROM_NUMBER
    msg = c.messages.create(body=body, from_=from_n, to=to_number)
    # Return Twilio's message SID and status
    return {"sid": msg.sid, "status": msg.status}
