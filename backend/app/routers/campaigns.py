from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Campaign, CampaignStep
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from app.services.revenue_predictor import predict_campaign_outcome

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


# ---------------------- Campaign CRUD -------------------------------


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1)
    goal: str = Field(..., min_length=1)
    goal_amount: Optional[float] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    goal_amount: Optional[float] = None
    status: Optional[str] = None


@router.post("/", status_code=201)
def create_campaign(payload: CampaignCreate, db: Session = Depends(get_db)):
    c = Campaign(
        name=payload.name.strip(),
        goal=payload.goal.strip(),
        goal_amount=payload.goal_amount,
        status="draft",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _serialize_campaign(c)


@router.put("/{campaign_id}")
def update_campaign(campaign_id: int, payload: CampaignUpdate, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    for field in ("name", "goal", "goal_amount", "status"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(c, field, val)
    c.updated_at = c.updated_at
    db.add(c)
    db.commit()
    db.refresh(c)
    return _serialize_campaign(c)


@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Soft-delete a campaign by marking archived=True. Keeps data for auditing."""
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    c.archived = True
    db.add(c)
    db.commit()
    return {"status": "archived", "id": campaign_id}


@router.post("/{campaign_id}/archive")
def archive_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    c.archived = True
    db.add(c)
    db.commit()
    return {"status": "archived", "id": campaign_id}


@router.post("/{campaign_id}/clone", status_code=201)
def clone_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Clone campaign and ALL its steps (preserve step content). New campaign is draft."""
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Create copy of campaign
    new = Campaign(
        name=f"Copy of {c.name}",
        goal=c.goal,
        goal_amount=c.goal_amount,
        status="draft",
        agent_plan=c.agent_plan,
    )
    db.add(new)
    db.flush()

    # Clone steps
    steps = db.query(CampaignStep).filter(CampaignStep.campaign_id == c.id).order_by(CampaignStep.step_number).all()
    for s in steps:
        new_s = CampaignStep(
            campaign_id=new.id,
            step_number=s.step_number,
            segment_label=s.segment_label,
            rfm_filter=s.rfm_filter,
            customer_ids=s.customer_ids,
            message=s.message,
            channel=s.channel,
            offer_text=s.offer_text,
            status='pending',
            pre_reasoning=s.pre_reasoning,
        )
        db.add(new_s)

    db.commit()
    db.refresh(new)
    return _serialize_campaign(new)



@router.get("/{campaign_id}/export_pdf")
def export_campaign_pdf(campaign_id: int, db: Session = Depends(get_db)):
    """Generate a PDF summary of the campaign including steps and AI reasoning."""
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")

    steps = db.query(CampaignStep).filter(CampaignStep.campaign_id == c.id).order_by(CampaignStep.step_number).all()

    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 40
    y = height - margin

    # Header
    p.setFont("Helvetica-Bold", 18)
    p.drawString(margin, y, f"Campaign Report — {c.name}")
    y -= 24
    p.setFont("Helvetica", 10)
    p.drawString(margin, y, f"ID: {c.id}    Created: {c.created_at.isoformat()}    Status: {c.status}")
    y -= 18

    # Summary
    p.setFont("Helvetica-Bold", 12)
    p.drawString(margin, y, "Campaign Summary")
    y -= 14
    p.setFont("Helvetica", 10)
    text = p.beginText(margin, y)
    text.setLeading(14)
    summary = c.agent_plan.get('strategy_summary') if c.agent_plan else ''
    if not summary:
        summary = c.goal
    for line in summary.split('\n'):
        text.textLine(line)
    p.drawText(text)
    y = text.getY() - 12

    # Top metrics
    p.setFont("Helvetica-Bold", 12)
    p.drawString(margin, y, "Top Metrics")
    y -= 14
    p.setFont("Helvetica", 10)
    p.drawString(margin, y, f"Revenue Recovered: ₹{c.revenue_recovered:.2f}")
    y -= 12
    p.drawString(margin, y, f"Total Customers Reached: {c.total_customers_reached}")
    y -= 18

    # Steps
    p.setFont("Helvetica-Bold", 12)
    p.drawString(margin, y, "Campaign Steps")
    y -= 16
    p.setFont("Helvetica", 10)

    for s in steps:
        if y < 120:
            p.showPage()
            y = height - margin
            p.setFont("Helvetica", 10)

        p.setFont("Helvetica-Bold", 11)
        p.drawString(margin, y, f"Step {s.step_number}: {s.segment_label} — {s.channel}")
        y -= 14
        p.setFont("Helvetica", 10)
        # Offer and message (shorten)
        offer = (s.offer_text or '')[:200]
        p.drawString(margin + 10, y, f"Offer: {offer}")
        y -= 12
        msg = (s.message or '')[:300]
        text = p.beginText(margin + 10, y)
        text.setLeading(12)
        for line in msg.split('\n'):
            text.textLine(line)
        p.drawText(text)
        y = text.getY() - 8

        # Metrics
        p.drawString(margin + 10, y, f"Sent: {s.send_count or 0}  Delivered: {s.delivered_count or 0}  Opened: {s.opened_count or 0}  Clicked: {s.clicked_count or 0}  Converted: {s.converted_count or 0}  Revenue: ₹{(s.revenue_recovered or 0):.2f}")
        y -= 18

        # AI reasoning
        if s.post_reasoning:
            text = p.beginText(margin + 10, y)
            text.setLeading(12)
            text.textLine('AI Learnings:')
            for lrn in (s.post_reasoning.get('learnings') or []):
                text.textLine(f"- {lrn}")
            p.drawText(text)
            y = text.getY() - 12

    p.showPage()
    p.save()
    buffer.seek(0)

    return StreamingResponse(buffer, media_type='application/pdf', headers={
        'Content-Disposition': f'attachment; filename=campaign_{c.id}_report.pdf'
    })


@router.get("/")
def list_campaigns(db: Session = Depends(get_db)):
    campaigns = (
    db.query(Campaign)
    .filter(Campaign.archived == False)
    .order_by(Campaign.created_at.desc())
    .all()
)
    return [_serialize_campaign(c) for c in campaigns]


@router.get("/{campaign_id}")
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _serialize_campaign_detail(campaign, db)


def _serialize_campaign(c: Campaign) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "goal": c.goal,
        "goal_amount": c.goal_amount,
        "status": c.status,
        "revenue_recovered": round(c.revenue_recovered or 0, 2),
        "total_customers_reached": c.total_customers_reached or 0,
        "step_count": len(c.steps),
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
    }


def _serialize_campaign_detail(c: Campaign, db: Session) -> dict:
    steps = (
        db.query(CampaignStep)
        .filter(CampaignStep.campaign_id == c.id)
        .order_by(CampaignStep.step_number)
        .all()
    )
    return {
        **_serialize_campaign(c),
        "agent_plan": c.agent_plan,
        "steps": [_serialize_step(s) for s in steps],
        "predicted_revenue": c.predicted_revenue,
        "predicted_conversions": c.predicted_conversions,
        "success_probability": c.success_probability,
        "prediction_explanation": c.prediction_explanation,
    }



@router.get("/{campaign_id}/predict")
def predict_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        prediction = predict_campaign_outcome(db, campaign_id)
        return prediction
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _serialize_step(s: CampaignStep) -> dict:
    return {
        "id": s.id,
        "step_number": s.step_number,
        "segment_label": s.segment_label,
        "rfm_filter": s.rfm_filter,
        "channel": s.channel,
        "offer_text": s.offer_text,
        "message": s.message,
        "status": s.status,
        "customer_count": len(s.customer_ids) if s.customer_ids else 0,
        "metrics": {
            "send_count": s.send_count or 0,
            "delivered_count": s.delivered_count or 0,
            "opened_count": s.opened_count or 0,
            "clicked_count": s.clicked_count or 0,
            "converted_count": s.converted_count or 0,
            "revenue_recovered": round(s.revenue_recovered or 0, 2),
        },
        "pre_reasoning": s.pre_reasoning,
        "post_reasoning": s.post_reasoning,
        "launched_at": s.launched_at.isoformat() if s.launched_at else None,
        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
    }