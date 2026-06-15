from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.template import Template
from jinja2 import Template as JinjaTemplate

router = APIRouter(prefix="/api/templates", tags=["templates"])


class TemplateCreate(BaseModel):
    name: str
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    variables: Optional[dict] = None


@router.get('/')
def list_templates(db: Session = Depends(get_db)):
    templates = db.query(Template).order_by(Template.created_at.desc()).all()
    return [t.as_dict() for t in templates]


@router.post('/')
def create_template(payload: TemplateCreate, db: Session = Depends(get_db)):
    existing = db.query(Template).filter(Template.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail='Template with this name already exists')
    t = Template(
        name=payload.name,
        subject=payload.subject,
        body_html=payload.body_html,
        body_text=payload.body_text,
        variables=payload.variables,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t.as_dict()


@router.get('/{template_id}')
def get_template(template_id: int, db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail='Template not found')
    return t.as_dict()


@router.put('/{template_id}')
def update_template(template_id: int, payload: TemplateCreate, db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail='Template not found')
    t.name = payload.name
    t.subject = payload.subject
    t.body_html = payload.body_html
    t.body_text = payload.body_text
    t.variables = payload.variables
    t.updated_at = t.updated_at
    db.add(t)
    db.commit()
    db.refresh(t)
    return t.as_dict()


@router.delete('/{template_id}')
def delete_template(template_id: int, db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail='Template not found')
    db.delete(t)
    db.commit()
    return {"status": "deleted"}


@router.post('/{template_id}/preview')
def preview_template(template_id: int, payload: dict, db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail='Template not found')
    # Render HTML preview using Jinja2 with provided payload variables
    ctx = payload or {}
    # inject default variables if missing
    ctx.setdefault('name', 'Customer')
    ctx.setdefault('discount', '10%')
    ctx.setdefault('city', 'Your City')
    rendered = None
    if t.body_html:
        tmpl = JinjaTemplate(t.body_html)
        rendered = tmpl.render(**ctx)
    return {"html": rendered, "variables_used": ctx}
