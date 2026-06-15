from app.services.config import settings
from typing import Optional

try:
    from twilio.rest import Client
except Exception:
    Client = None

_client = None

def _get_client():
    global _client
    if _client is None:
        if Client is None:
            raise RuntimeError("Twilio client not installed")
        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client

def send_whatsapp(to_number: str, body: str, from_number: Optional[str] = None) -> dict:
    c = _get_client()
    from_n = from_number or settings.TWILIO_FROM_NUMBER
    # Twilio WhatsApp numbers must be in 'whatsapp:+123456...' format
    to = to_number if to_number.startswith('whatsapp:') else f'whatsapp:{to_number}'
    from_ = from_n if from_n.startswith('whatsapp:') else f'whatsapp:{from_n}'
    msg = c.messages.create(body=body, from_=from_, to=to)
    return {"sid": msg.sid, "status": msg.status}
