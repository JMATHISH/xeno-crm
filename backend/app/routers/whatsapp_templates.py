from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.template import WhatsAppTemplate
from app.services.whatsapp_service import send_whatsapp

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


class WACreate(BaseModel):
    name: str
    body_text: Optional[str] = None
    variables: Optional[dict] = None


@router.get('/templates')
def list_templates(db: Session = Depends(get_db)):
    items = db.query(WhatsAppTemplate).order_by(WhatsAppTemplate.created_at.desc()).all()
    return [i.as_dict() for i in items]


@router.post('/templates')
def create_template(payload: WACreate, db: Session = Depends(get_db)):
    existing = db.query(WhatsAppTemplate).filter(WhatsAppTemplate.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail='Already exists')
    t = WhatsAppTemplate(name=payload.name, body_text=payload.body_text, variables=payload.variables)
    db.add(t)
    db.commit(); db.refresh(t)
    return t.as_dict()


@router.post('/send_test')
def send_test(to: str = Form(...), template_name: str = Form(...), db: Session = Depends(get_db)):
    t = db.query(WhatsAppTemplate).filter(WhatsAppTemplate.name == template_name).first()
    if not t:
        raise HTTPException(status_code=404, detail='Template not found')
    body = (t.body_text or '').replace('{{ name }}', 'Test User')
    res = send_whatsapp(to, body)
    return {"status": "sent", "twilio": res}
