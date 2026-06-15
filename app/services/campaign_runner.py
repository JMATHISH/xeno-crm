import time
import random
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Campaign, CampaignStep  # adjust import path if models live elsewhere
from app.services.agent_service import launch_step, analyze_step

logger = logging.getLogger(__name__)

def _safe_setattr(obj, name: str, value):
	"""Set attribute if present on object"""
	if hasattr(obj, name):
		setattr(obj, name, value)

def _safe_addattr(obj, name: str, value):
	"""Add into numeric attribute if present, initializing if needed"""
	if hasattr(obj, name):
		current = getattr(obj, name) or 0
		setattr(obj, name, current + value)

def _simulate_metrics_for_step(step: CampaignStep) -> dict:
	"""
	Produce a plausible (delivered, opened, clicked, converted, revenue) tuple.
	This is intentionally simple and safe if fields/attributes are missing on models.
	"""
	# Base audience: try to infer from step attributes, otherwise random small audience
	base = None
	for attr in ("recipient_count", "audience_size", "recipients", "target_count"):
		if hasattr(step, attr):
			val = getattr(step, attr) or 0
			if isinstance(val, int) and val > 0:
				base = val
				break
	if not base:
		base = random.randint(50, 200)

	delivered = random.randint(max(1, int(base*0.6)), base)
	opened = int(delivered * random.uniform(0.2, 0.6))
	clicked = int(opened * random.uniform(0.05, 0.25))
	converted = int(clicked * random.uniform(0.01, 0.2))

	# revenue per conversion simulated
	revenue_per = random.uniform(5.0, 75.0)
	revenue = round(converted * revenue_per, 2)

	return {
		"delivered": delivered,
		"opened": opened,
		"clicked": clicked,
		"converted": converted,
		"revenue": revenue,
	}

def _update_step_metrics(db: Session, step: CampaignStep, metrics: dict):
	# Update counts if fields exist
	_safe_addattr(step, "delivered_count", metrics["delivered"])
	_safe_addattr(step, "opened_count", metrics["opened"])
	_safe_addattr(step, "clicked_count", metrics["clicked"])
	_safe_addattr(step, "converted_count", metrics["converted"])
	# revenue field name can vary; try common names
	for rev_field in ("revenue_recovered", "revenue", "revenue_amount"):
		if hasattr(step, rev_field):
			_safe_addattr(step, rev_field, metrics["revenue"])
			break
	db.add(step)
	db.commit()
	db.refresh(step)

def _recalculate_campaign_revenue(db: Session, campaign: Campaign):
	# Sum known revenue fields across steps and persist to campaign.revenue_recovered if available
	total = 0.0
	for s in campaign.steps:
		for rev_field in ("revenue_recovered", "revenue", "revenue_amount"):
			if hasattr(s, rev_field):
				total += float(getattr(s, rev_field) or 0.0)
				break
	if hasattr(campaign, "revenue_recovered"):
		campaign.revenue_recovered = round(total, 2)
		db.add(campaign)
		db.commit()
		db.refresh(campaign)

def run_campaign_background(campaign_id: int):
	"""
	Background runner for a campaign. Creates its own DB session and runs all steps sequentially.
	"""
	db = SessionLocal()
	try:
		# Fetch campaign with steps
		campaign = db.query(Campaign).filter(Campaign.id == campaign_id).options().first()
		if not campaign:
			logger.warning("Campaign runner: campaign %s not found", campaign_id)
			return

		# Mark campaign running if possible
		if hasattr(campaign, "status"):
			campaign.status = "running"
			db.add(campaign)
			db.commit()
			db.refresh(campaign)

		# Ensure steps are loaded and ordered (try common ordering field)
		steps = list(getattr(campaign, "steps", []) or [])
		# Try sorting by position/order/index if present
		if steps and hasattr(steps[0], "position"):
			steps.sort(key=lambda s: getattr(s, "position") or 0)
		elif steps and hasattr(steps[0], "order"):
			steps.sort(key=lambda s: getattr(s, "order") or 0)

		for step in steps:
			# Skip steps already completed (if there's a status field)
			if hasattr(step, "status") and getattr(step, "status") == "completed":
				continue

			# mark step running
			if hasattr(step, "status"):
				step.status = "running"
				db.add(step)
				db.commit()
				db.refresh(step)

			# Launch step using existing service
			try:
				launch_step(step.id, db)
			except Exception:
				logger.exception("Error in launch_step for step %s", step.id)

			# Simulate metrics and update counts/revenue
			metrics = _simulate_metrics_for_step(step)
			_update_step_metrics(db, step, metrics)

			# After launch & metric update, run analysis
			try:
				analyze_step(step.id, db)
			except Exception:
				logger.exception("Error in analyze_step for step %s", step.id)

			# After analysis, mark step completed if model supports it
			if hasattr(step, "status"):
				step.status = "completed"
				db.add(step)
				db.commit()
				db.refresh(step)

			# Update campaign revenue aggregated
			campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
			_recalculate_campaign_revenue(db, campaign)

			# small pause so frontend can pick up intermediate state
			time.sleep(1.0)

		# All steps handled; mark campaign completed
		campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
		# ensure all steps are completed
		all_done = True
		for s in getattr(campaign, "steps", []) or []:
			if hasattr(s, "status") and getattr(s, "status") != "completed":
				all_done = False
				break
		if all_done and hasattr(campaign, "status"):
			campaign.status = "completed"
			# optional: set finished timestamp if field exists
			if hasattr(campaign, "finished_at"):
				from datetime import datetime
				campaign.finished_at = datetime.utcnow()
			db.add(campaign)
			db.commit()
			db.refresh(campaign)

		# Final revenue recalculation
		_recalculate_campaign_revenue(db, campaign)

	except Exception:
		logger.exception("Unexpected error in campaign runner for %s", campaign_id)
	finally:
		db.close()
