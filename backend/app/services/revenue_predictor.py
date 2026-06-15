from sqlalchemy.orm import Session
from typing import Dict
from app.models import Campaign, CampaignStep, CommunicationLog, Customer

# Simple heuristic predictor using historical campaign averages and customer spend
# This is intentionally transparent and easy to reason about. For production, replace with ML model.

def predict_campaign_outcome(db: Session, campaign_id: int) -> Dict:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise ValueError('Campaign not found')

    # Gather steps and expected audience
    steps = campaign.steps or []

    # Historical conversion rate per channel (from previous communications)
    channel_stats = {}
    comms = db.query(CommunicationLog).all()
    for c in comms:
        ch = c.channel or 'unknown'
        stat = channel_stats.setdefault(ch, {'sent': 0, 'converted': 0})
        stat['sent'] += 1
        if c.status == 'converted':
            stat['converted'] += 1

    # Default fallback rates
    DEFAULT_RATES = {
        'whatsapp': 0.06,
        'email': 0.02,
        'sms': 0.03,
        'unknown': 0.015,
    }

    for ch, s in channel_stats.items():
        if s['sent'] > 0:
            channel_stats[ch]['rate'] = s['converted'] / s['sent']
        else:
            channel_stats[ch]['rate'] = DEFAULT_RATES.get(ch, 0.02)

    # Use historical average order value across customers as baseline
    customers = db.query(Customer).all()
    avg_order_value = 0.0
    if customers:
        vals = [c.avg_order_value or 0.0 for c in customers if c.avg_order_value is not None]
        if vals:
            avg_order_value = sum(vals) / len(vals)
    if avg_order_value <= 0:
        avg_order_value = 500.0  # fallback

    total_predicted_revenue = 0.0
    total_predicted_conversions = 0
    step_predictions = []

    for step in steps:
        channel = (step.channel or 'unknown').lower()
        reach = step.customer_count or (len(step.customer_ids) if step.customer_ids else 0)
        if reach == 0:
            # Estimate reach from campaign total customers reached / steps
            reach = max(int((campaign.total_customers_reached or 0) / max(1, len(steps))), 0)

        rate = channel_stats.get(channel, {}).get('rate', DEFAULT_RATES.get(channel, 0.02))

        predicted_conversions = int(round(reach * rate))
        predicted_revenue = predicted_conversions * (step.revenue_recovered / (step.converted_count or 1) if step.converted_count else predicted_conversions * avg_order_value)

        # if step has no historical conversions, fallback to avg_order_value
        if step.converted_count == 0:
            predicted_revenue = predicted_conversions * avg_order_value

        total_predicted_conversions += predicted_conversions
        total_predicted_revenue += predicted_revenue

        step_predictions.append({
            'step_id': step.id,
            'reach': reach,
            'predicted_conversions': predicted_conversions,
            'predicted_revenue': round(predicted_revenue, 2),
            'channel_rate': rate,
        })

    # Heuristic success probability: compare predicted_revenue to goal amount
    goal = campaign.goal_amount or 0.0
    success_prob = 0.5
    if goal and total_predicted_revenue > 0:
        ratio = total_predicted_revenue / goal
        # map ratio to probability via logistic-ish scaling
        import math
        success_prob = 1 / (1 + math.exp(-3 * (ratio - 0.5)))
    success_prob_pct = round(success_prob * 100, 2)

    prediction = {
        'predicted_revenue': round(total_predicted_revenue, 2),
        'predicted_conversions': int(total_predicted_conversions),
        'success_probability': success_prob_pct,
        'step_predictions': step_predictions,
        'explanation': {
            'avg_order_value_used': round(avg_order_value, 2),
            'channel_rates_sampled': {k: v['rate'] for k, v in channel_stats.items()},
        }
    }

    # Persist into campaign
    campaign.predicted_revenue = prediction['predicted_revenue']
    campaign.predicted_conversions = prediction['predicted_conversions']
    campaign.success_probability = prediction['success_probability']
    campaign.prediction_explanation = prediction['explanation']
    db.add(campaign)
    db.commit()

    return prediction
