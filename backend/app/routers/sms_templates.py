from fastapi import APIRouter, Depends, HTTPException, Request, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.template import SMSTemplate
from app.services.sms_service import send_sms
from app.models import CommunicationLog, CampaignStep
from datetime import datetime

router = APIRouter(prefix="/api/sms", tags=["sms"])


class SMSTemplateCreate(BaseModel):
    name: str
    body_text: Optional[str] = None
    variables: Optional[dict] = None


@router.get('/templates')
def list_sms_templates(db: Session = Depends(get_db)):
    items = db.query(SMSTemplate).order_by(SMSTemplate.created_at.desc()).all()
    return [i.as_dict() for i in items]


@router.post('/templates')
def create_sms_template(payload: SMSTemplateCreate, db: Session = Depends(get_db)):
    existing = db.query(SMSTemplate).filter(SMSTemplate.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail='Already exists')
    t = SMSTemplate(name=payload.name, body_text=payload.body_text, variables=payload.variables)
    db.add(t)
    db.commit(); db.refresh(t)
    return t.as_dict()


@router.post('/send_test')
def send_test_sms(to: str, template_name: str = Form(...), db: Session = Depends(get_db)):
    t = db.query(SMSTemplate).filter(SMSTemplate.name == template_name).first()
    if not t:
        raise HTTPException(status_code=404, detail='Template not found')
    # simple variable interpolation
    body = (t.body_text or '').replace('{{ name }}', 'Test User')
    res = send_sms(to, body)
    return {"status": "sent", "twilio": res}


@router.post('/webhook')
async def twilio_webhook(request: Request, db: Session = Depends(get_db)):
    # Twilio will POST form data with MessageSid and MessageStatus
    form = await request.form()
    sid = form.get('MessageSid')
    status = form.get('MessageStatus')
    # Find CommunicationLog with matching twilio_sid
    log = db.query(CommunicationLog).filter(CommunicationLog.twilio_sid == sid).first()
    if not log:
        return {"status": "unknown_sid", "sid": sid}

    # Map Twilio statuses to our events
    mapping = {
        'delivered': 'delivered',
        'failed': 'failed',
        'undelivered': 'failed',
        'sent': 'delivered',
    }
    event = mapping.get(status, None)
    if event:
        # Create a receipt payload-like update
        from app.routers.receipts import handle_receipt as receipts_handler
        # Use the receipts handler to ensure counters and timestamps update
        try:
            receipts_handler(payload=type('P', (), { 'idempotency_key': log.idempotency_key, 'event': event, 'revenue_attributed': 0.0, 'twilio_sid': sid }), db=db)
        except Exception:
            pass

    return {"status": "ok", "sid": sid, "message_status": status}


@router.get('/analytics')
def sms_analytics(db: Session = Depends(get_db)):
    # Simple aggregates per day
    rows = db.query(CampaignStep).all()
    # Return step-level metrics as simple analytics
    data = []
    for s in rows:
        data.append({
            'step_id': s.id,
            'name': s.segment_label,
            'sent': s.send_count or 0,
            'delivered': s.delivered_count or 0,
            'opened': s.opened_count or 0,
            'clicked': s.clicked_count or 0,
            'converted': s.converted_count or 0,
        })
    return data
