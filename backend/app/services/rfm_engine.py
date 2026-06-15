from datetime import datetime
from sqlalchemy.orm import Session
from app.models.customer import Customer
from app.models.order import Order

# Reference date — used consistently across the entire application
TODAY = datetime(2026, 6, 10)


# ---------------------------------------------------------------------------
# Scoring functions (1 = worst, 5 = best)
# ---------------------------------------------------------------------------

def score_recency(days: int) -> int:
    """Fewer days since last purchase = higher score."""
    if days <= 15:  return 5
    if days <= 30:  return 4
    if days <= 60:  return 3
    if days <= 90:  return 2
    return 1


def score_frequency(order_count: int) -> int:
    """More orders = higher score."""
    if order_count >= 10: return 5
    if order_count >= 7:  return 4
    if order_count >= 4:  return 3
    if order_count >= 2:  return 2
    return 1


def score_monetary(total_spend: float) -> int:
    """Higher total spend = higher score."""
    if total_spend >= 4000: return 5
    if total_spend >= 2500: return 4
    if total_spend >= 1000: return 3
    if total_spend >= 400:  return 2
    return 1


# ---------------------------------------------------------------------------
# Tier classification
# ---------------------------------------------------------------------------

# Tier descriptions shown in the UI alongside RFM scores
TIER_DESCRIPTIONS = {
    "Champions":           "Recent, frequent, high spenders — your best customers.",
    "Loyal Customers":     "Buy regularly with good spending. Reward them.",
    "Potential Loyalists": "Recent buyers with growth potential.",
    "At Risk":             "Were frequent/high-value but haven't returned. Act now.",
    "Lapsed High Value":   "Big spenders who have gone quiet. Worth a strong offer.",
    "Need Attention":      "Below-average recency and frequency. Light re-engagement.",
    "Lost":                "Haven't bought in a long time. Low-cost win-back only.",
    "Others":              "Mixed signals — no clear segment.",
}


def get_tier(r: int, f: int, m: int) -> str:
    """Map R/F/M scores to a human-readable tier label."""
    if r >= 4 and f >= 4 and m >= 4:
        return "Champions"
    if r >= 3 and f >= 4:
        return "Loyal Customers"
    if r >= 4 and f <= 2 and m >= 3:
        return "Potential Loyalists"
    if r <= 2 and (f >= 4 or m >= 4):
        return "At Risk"
    if r <= 2 and f >= 3 and m >= 3:
        return "Lapsed High Value"
    if r >= 3 and f >= 3:
        return "Need Attention"
    if r <= 1:
        return "Lost"
    return "Others"


# ---------------------------------------------------------------------------
# Main compute function
# ---------------------------------------------------------------------------

def compute_all_rfm(db: Session) -> dict:
    """
    Recompute RFM scores for every customer and persist them.
    Returns a summary dict useful for logging and the agent's system prompt.
    """
    customers = db.query(Customer).all()
    tier_counts: dict[str, int] = {}

    for customer in customers:
        orders = (
            db.query(Order)
            .filter(Order.customer_id == customer.id)
            .all()
        )

        if not orders:
            customer.recency_score = 1
            customer.frequency_score = 1
            customer.monetary_score = 1
            customer.rfm_score = 1.0
            customer.rfm_tier = "Lost"
            customer.total_orders = 0
            customer.total_spend = 0.0
            customer.avg_order_value = 0.0
            customer.last_purchase_date = None
            customer.days_since_purchase = None
            tier_counts["Lost"] = tier_counts.get("Lost", 0) + 1
            continue

        last_order = max(orders, key=lambda o: o.created_at)
        days = (TODAY - last_order.created_at).days
        total_orders = len(orders)
        total_spend = sum(o.amount for o in orders)

        r = score_recency(days)
        f = score_frequency(total_orders)
        m = score_monetary(total_spend)
        tier = get_tier(r, f, m)

        customer.recency_score = r
        customer.frequency_score = f
        customer.monetary_score = m
        customer.rfm_score = round((r + f + m) / 3, 2)
        customer.rfm_tier = tier
        customer.total_orders = total_orders
        customer.total_spend = round(total_spend, 2)
        customer.avg_order_value = round(total_spend / total_orders, 2)
        customer.last_purchase_date = last_order.created_at
        customer.days_since_purchase = days

        # ------------------------------------------------------------------
        # Churn prediction (simple, explainable heuristic combining RFM features)
        # Score ranges 0-100 where higher = higher churn risk
        # Base factors: recency (days), frequency (order count), monetary (total spend)
        # We'll compute a normalized score from components and store an explanation.
        try:
            # Normalize components to 0-1 where 1 = worse (higher risk)
            recency_norm = min(days / 365.0, 1.0)
            frequency_norm = 1.0 - min(total_orders / 12.0, 1.0)  # more orders -> lower risk
            monetary_norm = 1.0 - min(total_spend / 5000.0, 1.0)  # higher spend -> lower risk

            # Weighted sum
            churn_raw = (0.5 * recency_norm) + (0.25 * frequency_norm) + (0.25 * monetary_norm)
            churn_score = round(churn_raw * 100, 2)

            # Label
            if churn_score >= 65:
                churn_label = 'High Risk'
            elif churn_score >= 35:
                churn_label = 'Medium Risk'
            else:
                churn_label = 'Low Risk'

            explanation = (
                f"Recency(days)={days} (norm={recency_norm:.2f}); "
                f"Frequency(orders)={total_orders} (norm={frequency_norm:.2f}); "
                f"Monetary(total)={total_spend:.2f} (norm={monetary_norm:.2f}); "
                f"weights=(0.5,0.25,0.25)"
            )

            customer.churn_score = churn_score
            customer.churn_label = churn_label
            customer.churn_explanation = explanation
        except Exception:
            customer.churn_score = None
            customer.churn_label = None
            customer.churn_explanation = None

        tier_counts[tier] = tier_counts.get(tier, 0) + 1

    db.commit()
    return tier_counts


def get_customers_by_rfm_filter(db: Session, rfm_filter: dict) -> list[Customer]:
    """
    Query customers matching an RFM filter dict.

    Filter keys (all optional):
        recency_min, recency_max     — R score range
        frequency_min, frequency_max — F score range
        monetary_min, monetary_max   — M score range
        tier                         — exact tier name
        days_lapsed_min              — min days since last purchase
        days_lapsed_max              — max days since last purchase
    """
    query = db.query(Customer)

    if "tier" in rfm_filter:
        query = query.filter(Customer.rfm_tier == rfm_filter["tier"])

    if "recency_min" in rfm_filter:
        query = query.filter(Customer.recency_score >= rfm_filter["recency_min"])
    if "recency_max" in rfm_filter:
        query = query.filter(Customer.recency_score <= rfm_filter["recency_max"])

    if "frequency_min" in rfm_filter:
        query = query.filter(Customer.frequency_score >= rfm_filter["frequency_min"])
    if "frequency_max" in rfm_filter:
        query = query.filter(Customer.frequency_score <= rfm_filter["frequency_max"])

    if "monetary_min" in rfm_filter:
        query = query.filter(Customer.monetary_score >= rfm_filter["monetary_min"])
    if "monetary_max" in rfm_filter:
        query = query.filter(Customer.monetary_score <= rfm_filter["monetary_max"])

    if "days_lapsed_min" in rfm_filter:
        query = query.filter(Customer.days_since_purchase >= rfm_filter["days_lapsed_min"])
    if "days_lapsed_max" in rfm_filter:
        query = query.filter(Customer.days_since_purchase <= rfm_filter["days_lapsed_max"])

    return query.all()