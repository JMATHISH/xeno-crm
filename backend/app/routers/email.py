from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.mailer import send_test_email
from app.database import get_db
from app.models import CommunicationLog
from fastapi import Request, Response
from datetime import datetime
from urllib.parse import urlencode
from app.services.config import settings

router = APIRouter(prefix="/api/email", tags=["email"])


class TestEmailRequest(BaseModel):
    to: EmailStr
    template: str = "win_back"


@router.post("/test")
def send_test(req: TestEmailRequest, db: Session = Depends(get_db)):
    try:
        # Build tracking URLs for the test message
        base = settings.CRM_RECEIPT_URL
        open_pixel = f"{base}/api/email/open?{urlencode({'idempotency_key': 'test-open'})}"
        click_url = f"{base}/api/email/click?{urlencode({'idempotency_key': 'test-click', 'target': 'https://example.com'})}"
        import asyncio
        from app.services.mailer import send_campaign_email
        ctx = {
            "name": "Test User",
            "offer_text": "₹100 off",
            "cta_url": "https://example.com",
            "open_pixel_url": open_pixel,
            "click_url": click_url,
        }
        subject = f"[Test] {req.template.replace('_', ' ').title()} - Brew & Co"
        asyncio.run(send_campaign_email(req.to, subject, req.template, ctx))
        return {"status": "sent", "to": req.to}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.get("/open")
def open_pixel(idempotency_key: str, db: Session = Depends(get_db)):
    # Mark opened for matching communication log, record timestamp
    log = db.query(CommunicationLog).filter(CommunicationLog.idempotency_key == idempotency_key).first()
    if log:
        # update log and step aggregates similar to receipts handler
        log.status = "opened"
        log.opened_at = datetime.utcnow()
        step = db.query(CommunicationLog).filter(CommunicationLog.step_id == log.step_id).first()
        step_obj = db.query(CommunicationLog).filter(CommunicationLog.step_id == log.step_id).first()
        # increment step opened_count through CampaignStep if present
        from app.models import CampaignStep, Campaign
        step_rec = db.query(CampaignStep).filter(CampaignStep.id == log.step_id).first()
        if step_rec:
            step_rec.opened_count = (step_rec.opened_count or 0) + 1
        db.commit()
    # Return a 1x1 transparent GIF
    img = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
    return Response(content=img, media_type="image/gif")


@router.get("/click")
def click_redirect(idempotency_key: str, target: str = None, db: Session = Depends(get_db)):
    # Mark clicked for matching communication log
    log = db.query(CommunicationLog).filter(CommunicationLog.idempotency_key == idempotency_key).first()
    if log:
        log.status = "clicked"
        log.clicked_at = datetime.utcnow()
        from app.models import CampaignStep
        step_rec = db.query(CampaignStep).filter(CampaignStep.id == log.step_id).first()
        if step_rec:
            step_rec.clicked_count = (step_rec.clicked_count or 0) + 1
        db.commit()
    # Redirect to target
    return Response(status_code=302, headers={"Location": target or settings.CRM_RECEIPT_URL})
