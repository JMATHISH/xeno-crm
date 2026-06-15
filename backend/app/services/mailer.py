from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from typing import Dict, Any
from app.services.config import settings
import asyncio
from pathlib import Path

# Configure FastAPI-Mail
conf = ConnectionConfig(
    MAIL_USERNAME=getattr(settings, 'SMTP_USERNAME', ''),
    MAIL_PASSWORD=getattr(settings, 'SMTP_PASSWORD', ''),
    MAIL_FROM=getattr(settings, 'SMTP_FROM_EMAIL', 'no-reply@yourdomain.com'),
    MAIL_PORT=getattr(settings, 'SMTP_PORT', 587),
    MAIL_SERVER=getattr(settings, 'SMTP_HOST', 'smtp.gmail.com'),
    MAIL_STARTTLS=getattr(settings, 'SMTP_USE_TLS', True),
    MAIL_SSL_TLS=getattr(settings, 'SMTP_USE_SSL', False),
    USE_CREDENTIALS=True,
    TEMPLATE_FOLDER=Path(__file__).parent.parent / "templates",
)

fm = FastMail(conf)


async def send_campaign_email(to_email: str, subject: str, template_name: str, context: Dict[str, Any]):
    """Send a templated campaign email asynchronously."""
    message = MessageSchema(
        subject=subject,
        recipients=[to_email],
        subtype="html",
        template_body=context,
    )
    await fm.send_message(message, template_name=f"{template_name}.html")


async def send_test_email(to_email: str, template_name: str = "win_back"):
    ctx = {"name": "Test User", "offer_text": "₹100 off your next order", "cta_url": "https://example.com"}
    subject = f"[Test] {template_name.replace('_', ' ').title()} - Brew & Co"
    await send_campaign_email(to_email, subject, template_name, ctx)


def send_campaign_email_sync(to_email: str, subject: str, template_name: str, context: Dict[str, Any]):
    """Sync wrapper for convenience in sync code paths."""
    return asyncio.get_event_loop().run_until_complete(send_campaign_email(to_email, subject, template_name, context))