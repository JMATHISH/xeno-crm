import asyncio
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import httpx

from app.database import get_db, SessionLocal
from app.services.config import settings
from app.models import Campaign, CampaignStep
from app.services.agent_service import (
    run_campaign_agent,
    launch_step,
    analyze_step,
    run_autonomous_campaign,
)
from app.services.rfm_engine import get_customers_by_rfm_filter
from app.services.revenue_predictor import predict_campaign_outcome

router = APIRouter(prefix="/api/agent", tags=["agent"])


class RunAgentRequest(BaseModel):
    goal: str
    goal_amount: Optional[float] = 50000.0


class CopilotRequest(BaseModel):
    prompt: str
    goal_amount: Optional[float] = 50000.0


@router.post("/run")
def run_agent(req: RunAgentRequest, db: Session = Depends(get_db)):
    """
    Entry point: the marketer types a goal and the agent plans the full campaign.
    Returns the campaign with all 3 steps and pre-reasoning cards.
    """
    try:
        campaign = run_campaign_agent(req.goal, req.goal_amount or 50000, db)
        return _serialize_full_campaign(campaign, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post('/copilot')
def copilot(req: CopilotRequest, db: Session = Depends(get_db)):
    """
    AI Campaign Copilot: given a natural-language prompt, create an AI-planned campaign,
    compute revenue prediction, and return a structured plan including audience counts.
    The campaign is persisted in the DB (draft) so the marketer can review and launch.
    """
    try:
        # Fail fast if Gemini key missing so tests and users get a clear message
        if not settings.GEMINI_API_KEY:
            raise HTTPException(status_code=503, detail="Gemini API key not configured. Set GEMINI_API_KEY in the .env.")
        # Use existing agent planner (which calls Gemini) to persist the plan
        campaign = run_campaign_agent(req.prompt, req.goal_amount or 50000.0, db)

        # Run revenue predictor to populate predicted fields
        prediction = predict_campaign_outcome(db, campaign.id)

        # Compute audience counts per step using RFM helper
        steps = []
        for s in campaign.steps or []:
            try:
                customers = get_customers_by_rfm_filter(db, s.rfm_filter or {})
                reach = len(customers)
            except Exception:
                reach = len(s.customer_ids) if s.customer_ids else 0
            steps.append({
                'step_id': s.id,
                'step_number': s.step_number,
                'segment_label': s.segment_label,
                'channel': s.channel,
                'offer_text': s.offer_text,
                'message': s.message,
                'estimated_reach': reach,
                'pre_reasoning': s.pre_reasoning,
            })

        result = {
            'campaign': _serialize_full_campaign(campaign, db),
            'steps': steps,
            'prediction': prediction,
        }
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/launch/{step_id}")
async def launch_campaign_step(
    step_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Launch one campaign step:
    1. Selects matching customers
    2. Creates CommunicationLogs
    3. Dispatches messages to the channel service in the background
    Returns immediately so the UI can start polling.
    """
    try:
        result = launch_step(step_id, db)
        step = result["step"]
        logs = result["logs"]

        # Dispatch to channel service concurrently in the background
        # Enrich logs with recipient and template hints so the dispatcher
        # can send emails directly when needed.
        def _choose_template(step):
            s = (step or "").lower()
            if "loyal" in s or "champion" in s or "loyalty" in s:
                return "loyalty"
            if "off" in s or "discount" in s or "%" in s or "₹" in s:
                return "discount"
            return "win_back"

        enriched = []
        for l in logs:
            tpl = _choose_template(getattr(l, 'offer_text', '') or getattr(l.step, 'offer_text', '') if hasattr(l, 'step') else "")
            enriched.append({
                "idempotency_key": l.idempotency_key,
                "channel": l.channel,
                "message": l.message,
                "to_email": getattr(l.customer, 'email', None),
                "to_phone": getattr(l.customer, 'phone', None),
                "subject": getattr(l.step, 'offer_text', None) or getattr(l.campaign, 'name', 'Brew & Co'),
                "template": tpl,
                "offer_text": getattr(l.step, 'offer_text', None) or '',
            })

        background_tasks.add_task(
            _dispatch_to_channel_service,
            logs=enriched,
            callback_url=f"{settings.CRM_RECEIPT_URL}/api/receipts",
        )

        return {
            "status": "launched",
            "step_id": step.id,
            "customers_reached": len(logs),
            "message": f"Dispatching to {len(logs)} customers via {step.channel}",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/{step_id}")
def analyze_campaign_step(step_id: int, db: Session = Depends(get_db)):
    """
    Generate post-mortem reasoning for a completed step.
    Adapts the next step's message based on learnings.
    """
    try:
        step = analyze_step(step_id, db)
        return {
            "step_id": step.id,
            "status": step.status,
            "post_reasoning": step.post_reasoning,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/launch_campaign/{campaign_id}", status_code=202)
def autonomous_launch_campaign(
    campaign_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    One-click autonomous campaign execution.

    - Validates the campaign exists and is in draft/pending state.
    - Returns 202 Accepted immediately so the UI can start polling.
    - Runs the full launch → analyze loop for every step in a background task.
    - On completion sets campaign.status = 'completed'.
    - On any failure sets campaign.status = 'failed' with error details.

    The frontend should poll GET /api/agent/campaign/{campaign_id} to track
    progress in real time.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id} not found")
    if campaign.status not in ("draft", "pending"):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Campaign is already '{campaign.status}'. "
                "Only draft or pending campaigns can be launched."
            ),
        )

    # Mark running immediately so the UI transitions out of 'draft' at once
    campaign.status = "running"
    db.commit()

    background_tasks.add_task(_run_autonomous_background, campaign_id=campaign_id)

    return {
        "status": "accepted",
        "campaign_id": campaign_id,
        "message": (
            f"Autonomous execution started for campaign #{campaign_id}. "
            "Poll GET /api/agent/campaign/{campaign_id} for live progress."
        ),
    }


@router.get("/campaign/{campaign_id}")
def get_campaign_status(campaign_id: int, db: Session = Depends(get_db)):
    """
    Polled by the frontend every 2 seconds while a campaign is running.
    Returns the full campaign state including live step metrics.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _serialize_full_campaign(campaign, db)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run_autonomous_background(campaign_id: int) -> None:
    """
    Background task wrapper for autonomous campaign execution.

    Opens its own DB session because BackgroundTasks run after the HTTP
    request's session scope has already been closed by FastAPI's dependency
    injection teardown.
    """
    import logging
    db = SessionLocal()
    try:
        run_autonomous_campaign(campaign_id, db)
    except Exception as exc:
        # Attempt to mark campaign as failed so frontend can surface the error
        try:
            db.rollback()
            campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if campaign:
                campaign.status = "failed"
                db.commit()
        except Exception:
            logging.exception("Failed to mark campaign failed in DB")
        logging.exception("Autonomous campaign run failed")
        raise
    finally:
        db.close()


async def _dispatch_to_channel_service(logs: list[dict], callback_url: str):

    """
    Fire all messages to the channel service concurrently.
    Uses asyncio.gather so 40 customers go out in parallel, not serially.
    Failures are swallowed — the channel service is best-effort in dev.
    """
    async with httpx.AsyncClient(timeout=15.0) as http:
        await asyncio.gather(
            *[_send_one(http, log, callback_url) for log in logs],
            return_exceptions=True,
        )


async def _send_one(http: httpx.AsyncClient, log: dict, callback_url: str):
    try:
        # If the channel is email and we have a recipient, attempt to send directly
        if (log.get("channel") or "").lower() == "email" and log.get("to_email"):
            try:
                from app.services.mailer import send_campaign_email

                # Build context for template
                context = {
                    "name": log.get("to_name") or "Customer",
                    "offer_text": log.get("offer_text") or (log.get("message") or '')[:80],
                    "cta_url": settings.CRM_RECEIPT_URL,
                    "open_pixel_url": f"{settings.CRM_RECEIPT_URL}/api/email/open?idempotency_key={log.get('idempotency_key')}",
                    "click_url": f"{settings.CRM_RECEIPT_URL}/api/email/click?idempotency_key={log.get('idempotency_key')}&target={settings.CRM_RECEIPT_URL}",
                }
                # subject and template provided by caller
                subject = log.get("subject") or "A message from Brew & Co"
                template = log.get("template") or "win_back"
                await send_campaign_email(log.get("to_email"), subject, template, context)

                # Post a delivered receipt back to callback_url so receipts router updates counts
                await http.post(callback_url, json={"idempotency_key": log["idempotency_key"], "event": "delivered"})
            except Exception:
                # If email sending fails, notify callback as failed
                await http.post(callback_url, json={"idempotency_key": log["idempotency_key"], "event": "failed"})

        # If the channel is sms and we have a recipient, send via Twilio wrapper
        elif (log.get("channel") or "").lower() == "sms" and log.get("to_phone"):
            try:
                from app.services.sms_service import send_sms
                res = send_sms(log.get("to_phone"), log.get("message") or '')
                # Post delivered with twilio SID so receipts handler can map it
                await http.post(callback_url, json={"idempotency_key": log["idempotency_key"], "event": "delivered", "twilio_sid": res.get('sid')})
            except Exception:
                await http.post(callback_url, json={"idempotency_key": log["idempotency_key"], "event": "failed"})
        # If the channel is whatsapp and we have a recipient, send via Twilio WhatsApp
        elif (log.get("channel") or "").lower() == "whatsapp" and log.get("to_phone"):
            try:
                from app.services.whatsapp_service import send_whatsapp
                body = log.get("message") or ''
                res = send_whatsapp(log.get("to_phone"), body)
                await http.post(callback_url, json={"idempotency_key": log["idempotency_key"], "event": "delivered", "twilio_sid": res.get('sid')})
            except Exception:
                await http.post(callback_url, json={"idempotency_key": log["idempotency_key"], "event": "failed"})

        else:
            # Non-email or no recipient; forward to channel service as before
            await http.post(
                f"{settings.CHANNEL_SERVICE_URL}/send",
                json={
                    "idempotency_key": log["idempotency_key"],
                    "channel": log["channel"],
                    "message": log["message"],
                    "callback_url": callback_url,
                },
            )
    except Exception:
        pass  # Channel service offline — silently skip in dev


def _serialize_full_campaign(campaign: Campaign, db: Session) -> dict:
    steps = (
        db.query(CampaignStep)
        .filter(CampaignStep.campaign_id == campaign.id)
        .order_by(CampaignStep.step_number)
        .all()
    )
    return {
        "id": campaign.id,
        "name": campaign.name,
        "goal": campaign.goal,
        "goal_amount": campaign.goal_amount,
        "status": campaign.status,
        "revenue_recovered": round(campaign.revenue_recovered or 0, 2),
        "total_customers_reached": campaign.total_customers_reached or 0,
        "agent_plan": campaign.agent_plan,
        "created_at": campaign.created_at.isoformat(),
        "steps": [
            {
                "id": s.id,
                "step_number": s.step_number,
                "segment_label": s.segment_label,
                "rfm_filter": s.rfm_filter,
                "channel": s.channel,
                "offer_text": s.offer_text,
                "message": s.message,
                "status": s.status,
                "customer_count": len(s.customer_ids) if s.customer_ids else 0,
                "send_count": s.send_count or 0,
                "delivered_count": s.delivered_count or 0,
                "opened_count": s.opened_count or 0,
                "clicked_count": s.clicked_count or 0,
                "converted_count": s.converted_count or 0,
                "revenue_recovered": round(s.revenue_recovered or 0, 2),
                "pre_reasoning": s.pre_reasoning,
                "post_reasoning": s.post_reasoning,
                "launched_at": s.launched_at.isoformat() if s.launched_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in steps
        ],
    }