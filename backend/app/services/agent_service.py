"""
Agent Service — the brain of Brew & Co CRM.

Three public functions:
  run_campaign_agent  — takes a marketer's goal, plans a 3-step campaign
  launch_step         — selects customers, creates CommunicationLogs, returns them
  analyze_step        — post-campaign analysis via Gemini, adapts next step

All Gemini calls use structured JSON output so the UI can render
reasoning cards directly without any parsing on the frontend.
"""

import json
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
import random

import google.generativeai as genai
from app.services.config import settings
from app.models import Customer, Campaign, CampaignStep, CommunicationLog
from app.services.rfm_engine import get_customers_by_rfm_filter

genai.configure(api_key=settings.GEMINI_API_KEY)

model = genai.GenerativeModel(
    "gemini-2.5-flash"
)
# ---------------------------------------------------------------------------
# Channel benchmarks (used in system prompt and post-analysis)
# ---------------------------------------------------------------------------
CHANNEL_BENCHMARKS = {
    "whatsapp": {"delivery": 95, "open": 68, "click": 32, "cvr": 14},
    "email":    {"delivery": 88, "open": 22, "click": 9,  "cvr": 4},
    "sms":      {"delivery": 98, "open": 15, "click": 6,  "cvr": 2},
}

SYSTEM_PROMPT = """You are the Campaign Brain for Brew & Co, a premium D2C coffee brand in India.
You think like a senior CRM strategist who has run hundreds of campaigns.

Your principles:
- Target highest-value lapsed customers first — they know the brand, conversion is highest
- Match channel to segment behaviour (WhatsApp for mobile-first, Email for engaged readers, SMS for broad reach)
- Personalise offers based on spend tier — high spenders get bigger discounts
- Be specific and data-backed in every reasoning statement

Channel benchmarks for Brew & Co:
- WhatsApp: 95% delivery, 68% open, 32% click, 14% conversion
- Email:    88% delivery, 22% open,  9% click,  4% conversion
- SMS:      98% delivery, 15% open,  6% click,  2% conversion

RFM score guide:
- Recency  (R): 5=last 15d  4=last 30d  3=last 60d  2=last 90d  1=90d+
- Frequency(F): 5=10+ orders 4=7-9  3=4-6  2=2-3  1=1 order
- Monetary (M): 5=₹4000+  4=₹2500-3999  3=₹1000-2499  2=₹400-999  1=<₹400

You ALWAYS respond with valid JSON only. No markdown fences. No preamble."""


def _get_rfm_context(db: Session) -> str:
    """Build a data-rich context string for the agent's system prompt."""
    rows = (
        db.query(
            Customer.rfm_tier,
            func.count(Customer.id),
            func.avg(Customer.total_spend),
            func.avg(Customer.days_since_purchase),
        )
        .group_by(Customer.rfm_tier)
        .all()
    )
    lines = []
    for tier, count, avg_spend, avg_days in rows:
        if tier:
            lines.append(
                f"  {tier}: {count} customers | avg spend ₹{(avg_spend or 0):.0f} | avg {(avg_days or 0):.0f} days since last purchase"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 1. Plan campaign
# ---------------------------------------------------------------------------

def run_campaign_agent(goal: str, goal_amount: float, db: Session) -> Campaign:
    """
    Calls Gemini to plan a 3-step campaign for the given goal.
    Saves Campaign + CampaignStep records and returns the Campaign.
    """
    rfm_context = _get_rfm_context(db)
    total = db.query(Customer).count()

    prompt = f"""Goal: {goal}
Target revenue recovery: ₹{(goal_amount or 0):,.0f}

Customer base — {total} customers:
{rfm_context}

Create a 3-step campaign. Target highest-value segments first. Each step should reach a distinct, non-overlapping audience.

Return exactly this JSON (no extra keys):
{{
  "campaign_name": "short name",
  "strategy_summary": "2-3 sentences explaining the overall approach",
  "steps": [
    {{
      "step_number": 1,
      "segment_label": "e.g. High-value At Risk",
      "rfm_filter": {{
        "recency_min": 1,
        "recency_max": 3,
        "frequency_min": 4,
        "monetary_min": 4
      }},
      "channel": "whatsapp",
      "offer_text": "e.g. ₹150 off your next order",
      "message": "Hi {{name}}! We miss you at Brew & Co ☕ [rest of message]. Use code COMEBACK150.",
      "pre_reasoning": {{
        "reasons": [
          "R2-3 score means 31-90 days since last visit — at the churn inflection point",
          "F4-5 score confirms 7+ purchases — proven repeat buyer",
          "M4-5 score means ₹2500+ lifetime spend — worth a generous offer"
        ],
        "expected_recovery": 18000,
        "expected_conversions": 12,
        "why_channel": "WhatsApp reaches this mobile-first segment with 68% open rate vs 22% for email"
      }}
    }},
    {{ "step_number": 2, ... }},
    {{ "step_number": 3, ... }}
  ]
}}"""

    response = model.generate_content(prompt)
    raw = response.text
    # Strip any accidental markdown fences
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else parts[0]
        if raw.startswith("json"):
            raw = raw[4:]

    plan = json.loads(raw.strip())

    # Persist campaign
    campaign = Campaign(
        name=plan["campaign_name"],
        goal=goal,
        goal_amount=goal_amount,
        status="draft",
        agent_plan={"strategy_summary": plan["strategy_summary"]},
    )
    db.add(campaign)
    db.flush()

    # Persist steps
    for step_data in plan["steps"]:
        step = CampaignStep(
            campaign_id=campaign.id,
            step_number=step_data["step_number"],
            segment_label=step_data["segment_label"],
            rfm_filter=step_data["rfm_filter"],
            channel=step_data["channel"],
            offer_text=step_data["offer_text"],
            message=step_data["message"],
            customer_ids=[],
            status="pending",
            pre_reasoning=step_data["pre_reasoning"],
        )
        db.add(step)

    db.commit()
    db.refresh(campaign)
    return campaign


# ---------------------------------------------------------------------------
# 2. Launch step
# ---------------------------------------------------------------------------

def launch_step(step_id: int, db: Session) -> dict:
    """
    Selects the audience, creates CommunicationLogs, marks step as running.
    Returns the logs so the router can dispatch them to the channel service.
    """
    step = db.query(CampaignStep).filter(CampaignStep.id == step_id).first()
    if not step:
        raise ValueError(f"Step {step_id} not found")
    if step.status != "pending":
        raise ValueError(f"Step {step_id} is already {step.status}")

    customers = get_customers_by_rfm_filter(db, step.rfm_filter or {})
    if not customers:
        raise ValueError("No customers match this segment — adjust the RFM filter")

    # Mark campaign running on first launch
    campaign = db.query(Campaign).filter(Campaign.id == step.campaign_id).first()
    if campaign and campaign.status == "draft":
        campaign.status = "running"

    logs = []
    for customer in customers:
        first_name = customer.name.split()[0]
        personalized = step.message.replace("{name}", first_name)

        # Respect the customer's channel preference for personalisation
        channel = customer.channel_preference or step.channel

        log = CommunicationLog(
            campaign_id=step.campaign_id,
            step_id=step.id,
            customer_id=customer.id,
            channel=channel,
            message=personalized,
            status="sent",
            idempotency_key=str(uuid.uuid4()),
        )
        db.add(log)
        logs.append(log)

    step.status = "running"
    step.customer_ids = [c.id for c in customers]
    step.send_count = len(customers)
    step.launched_at = datetime.utcnow()

    if campaign:
        campaign.total_customers_reached = (
            campaign.total_customers_reached or 0
        ) + len(customers)

    db.commit()
    for log in logs:
        db.refresh(log)

    return {"step": step, "logs": logs, "customers": customers}


# ---------------------------------------------------------------------------
# 3. Analyze step
# ---------------------------------------------------------------------------

def analyze_step(step_id: int, db: Session) -> CampaignStep:
    """
    Calls Gemini to generate a post-mortem reasoning card.
    If there's a next step (still pending), adjusts its offer based on learnings.
    """
    step = db.query(CampaignStep).filter(CampaignStep.id == step_id).first()
    if not step:
        raise ValueError(f"Step {step_id} not found")

    send = step.send_count or 1
    delivered = step.delivered_count or 0
    opened = step.opened_count or 0
    clicked = step.clicked_count or 0
    converted = step.converted_count or 0
    revenue = step.revenue_recovered or 0

    open_rate = round(opened / delivered * 100, 1) if delivered else 0
    click_rate = round(clicked / opened * 100, 1) if opened else 0
    cvr = round(converted / send * 100, 1) if send else 0

    bench = CHANNEL_BENCHMARKS.get(step.channel or "whatsapp", CHANNEL_BENCHMARKS["whatsapp"])

    prompt = f"""Brew & Co — Campaign Step {step.step_number} Post-Analysis:

Segment: {step.segment_label}
Channel: {step.channel}
Offer: {step.offer_text}

Results:
  Sent:      {send}
  Delivered: {delivered} ({round(delivered/send*100,1) if send else 0}%)  [benchmark: {bench['delivery']}%]
  Opened:    {opened}   ({open_rate}%)  [benchmark: {bench['open']}%]
  Clicked:   {clicked}  ({click_rate}%) [benchmark: {bench['click']}%]
  Converted: {converted} ({cvr}%)      [benchmark: {bench['cvr']}%]
  Revenue: ₹{(revenue or 0):,.0f}

What did we learn? Be specific. What should change for the next step?

Return exactly this JSON:
{{
  "open_rate": {open_rate},
  "click_rate": {click_rate},
  "conversion_rate": {cvr},
  "revenue_recovered": {revenue},
  "performance_vs_benchmark": "above|at|below",
  "best_performing_insight": "one specific observation about what drove performance",
  "learnings": [
    "specific learning 1",
    "specific learning 2"
  ],
  "adjustment_for_next_step": "concrete change to make for Step {step.step_number + 1}",
  "adjusted_offer": "updated offer text for next step (or same if no change needed)"
}}"""

    response = model.generate_content(prompt)
    raw = response.text
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else parts[0]
        if raw.startswith("json"):
            raw = raw[4:]

    post = json.loads(raw.strip())

    step.post_reasoning = post
    step.status = "completed"
    step.completed_at = datetime.utcnow()

    # Mark campaign completed if all steps are done
    campaign = db.query(Campaign).filter(
        Campaign.id == step.campaign_id
    ).first()

    if campaign:
        remaining_steps = db.query(CampaignStep).filter(
            CampaignStep.campaign_id == campaign.id,
            CampaignStep.status != "completed",
        ).count()

        if remaining_steps == 0:
            campaign.status = "completed"

    # Adapt the next step's offer based on learnings
    next_step = (
        db.query(CampaignStep)
        .filter(
            CampaignStep.campaign_id == step.campaign_id,
            CampaignStep.step_number == step.step_number + 1,
            CampaignStep.status == "pending",
        )
        .first()
    )

    if next_step and post.get("adjusted_offer"):
        next_step.offer_text = post["adjusted_offer"]

    db.commit()
    db.refresh(step)
    return step


# ---------------------------------------------------------------------------
# 4. Autonomous end-to-end campaign execution
# ---------------------------------------------------------------------------

def run_autonomous_campaign(campaign_id: int, db: Session) -> Campaign:
    """
    Fully autonomous execution:
      - Load all steps ordered by step_number
      - For each step: launch_step → wait for channel service → analyze_step
      - Mark campaign as 'completed' when all steps finish
      - Mark campaign as 'failed' and raise if anything goes wrong

    Reuses existing launch_step() and analyze_step() — zero code duplication.
    """
    import time

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise ValueError(f"Campaign {campaign_id} not found")
    if campaign.status not in ("draft", "pending", "running"):
        raise ValueError(
            f"Campaign {campaign_id} is already '{campaign.status}' — "
            "only draft/pending campaigns can be autonomously launched"
        )

    steps = (
        db.query(CampaignStep)
        .filter(CampaignStep.campaign_id == campaign_id)
        .order_by(CampaignStep.step_number)
        .all()
    )
    if not steps:
        raise ValueError(f"Campaign {campaign_id} has no steps to execute")

    try:
        for step in steps:
            # ── Launch ──────────────────────────────────────────────────────
            launch_step(step.id, db)

            # In the autonomous runner we simulate channel behaviour locally
            # (delivery → open → click → conversion) instead of relying on
            # an external channel service. This keeps end-to-end testing
            # deterministic in dev and removes timing dependencies.
            _simulate_step_metrics(step.id, db)

            # Short pause to emulate asynchronous processing / receipts
            time.sleep(0.5)

            # Ensure ORM states are fresh before analysis
            db.expire_all()

            # ── Analyze ─────────────────────────────────────────────────────
            analyze_step(step.id, db)

        # Final status update (analyze_step already sets it when the last step
        # completes, but we guarantee it here as a safety net)
        db.expire_all()
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign and campaign.status != "completed":
            campaign.status = "completed"
            campaign.updated_at = datetime.utcnow()
            db.commit()

    except Exception:
        # Propagate the exception to the background wrapper which will mark
        # the campaign failed and close the session. Re-raise so the caller
        # can inspect/log the error if needed.
        raise


def _simulate_step_metrics(step_id: int, db: Session) -> dict:
    """Simulate delivery/open/click/conversion events for all logs in a step.

    - Only processes CommunicationLogs that are currently in 'sent' state so
      repeated runs are idempotent.
    - Uses CHANNEL_BENCHMARKS for per-channel probabilities.
    - Attributes revenue using the customer's average order value (when
      available) with a small random multiplier.
    Returns a small summary dict for debugging / tests.
    """
    from app.models import CommunicationLog, CampaignStep, Campaign, Customer

    step = db.query(CampaignStep).filter(CampaignStep.id == step_id).first()
    if not step:
        raise ValueError(f"Step {step_id} not found for simulation")

    bench = CHANNEL_BENCHMARKS.get(step.channel or "whatsapp", CHANNEL_BENCHMARKS["whatsapp"])

    logs = (
        db.query(CommunicationLog)
        .filter(CommunicationLog.step_id == step_id, CommunicationLog.status == "sent")
        .all()
    )

    delivered = opened = clicked = converted = 0
    revenue_total = 0.0

    for log in logs:
        # Delivery
        if random.random() * 100 <= bench["delivery"]:
            log.status = "delivered"
            delivered += 1
        else:
            log.status = "failed"

        # Open (only if delivered)
        if log.status == "delivered" and random.random() * 100 <= bench["open"]:
            log.status = "opened"
            opened += 1

            # Click (only if opened)
            if random.random() * 100 <= bench["click"]:
                log.status = "clicked"
                clicked += 1

        # Conversion — modelled as percent of sends (bench['cvr'])
        if random.random() * 100 <= bench["cvr"]:
            log.status = "converted"
            # Attribute revenue using customer avg_order_value when present
            customer = db.query(Customer).filter(Customer.id == log.customer_id).first()
            base = (customer.avg_order_value or 500)
            rev = round(base * random.uniform(0.7, 1.3), 2)
            log.revenue_attributed = rev
            converted += 1
            revenue_total += rev

        log.updated_at = datetime.utcnow()
        db.add(log)

    # Update step aggregates
    step.delivered_count = (step.delivered_count or 0) + delivered
    step.opened_count = (step.opened_count or 0) + opened
    step.clicked_count = (step.clicked_count or 0) + clicked
    step.converted_count = (step.converted_count or 0) + converted
    step.revenue_recovered = (step.revenue_recovered or 0) + revenue_total
    db.add(step)

    # Roll revenue up to campaign
    if step.campaign_id:
        campaign = db.query(Campaign).filter(Campaign.id == step.campaign_id).first()
        if campaign:
            campaign.revenue_recovered = (campaign.revenue_recovered or 0) + revenue_total
            campaign.updated_at = datetime.utcnow()
            db.add(campaign)

    db.commit()

    return {
        "delivered": delivered,
        "opened": opened,
        "clicked": clicked,
        "converted": converted,
        "revenue": revenue_total,
    }
    