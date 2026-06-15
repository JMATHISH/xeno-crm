from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.models import CommunicationLog, CampaignStep, Campaign

router = APIRouter(prefix="/api/receipts", tags=["receipts"])

# Status can only move forward — this prevents duplicate or out-of-order callbacks
# from corrupting the delivery funnel numbers.
STATUS_ORDER = {
    "sent": 0,
    "delivered": 1,
    "opened": 2,
    "clicked": 3,
    "converted": 4,
    "failed": -1,
}


class ReceiptPayload(BaseModel):
    idempotency_key: str
    event: str                              # delivered|opened|clicked|converted|failed
    revenue_attributed: Optional[float] = 0.0
    twilio_sid: Optional[str] = None


@router.post("/")
def handle_receipt(payload: ReceiptPayload, db: Session = Depends(get_db)):
    """
    Called by the channel service for every delivery event.

    Idempotency: we track the current status and only update if the
    incoming event represents forward progress in the funnel.
    This means retried callbacks are completely safe.
    """
    log = (
        db.query(CommunicationLog)
        .filter(CommunicationLog.idempotency_key == payload.idempotency_key)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    current_rank = STATUS_ORDER.get(log.status, 0)
    new_rank = STATUS_ORDER.get(payload.event, 0)

    # Ignore duplicate or regressive callbacks
    if payload.event != "failed" and new_rank <= current_rank:
        return {"status": "ignored", "reason": "duplicate or out-of-order"}

    # Update the communication log
    log.status = payload.event
    log.updated_at = datetime.utcnow()
    if payload.twilio_sid:
        log.twilio_sid = payload.twilio_sid
    if payload.event == "delivered":
        log.delivered_at = datetime.utcnow()
    if payload.event == "opened":
        log.opened_at = datetime.utcnow()
    if payload.event == "clicked":
        log.clicked_at = datetime.utcnow()
    if payload.event == "converted":
        log.revenue_attributed = payload.revenue_attributed or 0.0

    # Update step metrics atomically
    step = db.query(CampaignStep).filter(CampaignStep.id == log.step_id).first()
    if step:
        if payload.event == "delivered":
            step.delivered_count = (step.delivered_count or 0) + 1
        elif payload.event == "opened":
            step.opened_count = (step.opened_count or 0) + 1
        elif payload.event == "clicked":
            step.clicked_count = (step.clicked_count or 0) + 1
        elif payload.event == "converted":
            step.converted_count = (step.converted_count or 0) + 1
            rev = payload.revenue_attributed or 0.0
            step.revenue_recovered = (step.revenue_recovered or 0) + rev

            # Roll revenue up to the campaign
            campaign = (
                db.query(Campaign)
                .filter(Campaign.id == log.campaign_id)
                .first()
            )
            if campaign:
                campaign.revenue_recovered = (campaign.revenue_recovered or 0) + rev
                campaign.updated_at = datetime.utcnow()

    db.commit()
    return {"status": "ok", "event": payload.event}