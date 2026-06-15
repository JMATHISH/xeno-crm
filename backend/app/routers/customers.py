from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from app.database import get_db
from app.models import Customer, Order, CommunicationLog, Campaign
from app.services.rfm_engine import TIER_DESCRIPTIONS
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from fastapi import UploadFile, File, BackgroundTasks
import csv
from io import StringIO
from app.services.rfm_engine import compute_all_rfm

router = APIRouter(prefix="/api/customers", tags=["customers"])

# Allowed segments list (kept in sync with frontend SEGMENTS)
ALLOWED_SEGMENTS = [
    'Champions',
    'Loyal Customers',
    'Recent / New Customers',
    'High-value At Risk',
    'Need Attention',
    'About to Sleep',
    'Hibernating / Lapsed',
]


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Overall customer base stats — used to populate dashboard cards."""
    total = db.query(Customer).count()

    by_tier = (
        db.query(Customer.rfm_tier, func.count(Customer.id))
        .group_by(Customer.rfm_tier)
        .all()
    )
    by_channel = (
        db.query(Customer.channel_preference, func.count(Customer.id))
        .group_by(Customer.channel_preference)
        .all()
    )
    by_city = (
        db.query(Customer.city, func.count(Customer.id))
        .group_by(Customer.city)
        .order_by(func.count(Customer.id).desc())
        .limit(6)
        .all()
    )

    avg_spend = db.query(func.avg(Customer.total_spend)).scalar() or 0
    total_revenue = db.query(func.sum(Customer.total_spend)).scalar() or 0
    total_orders = db.query(func.sum(Customer.total_orders)).scalar() or 0

    return {
        "total": total,
        "by_tier": {t: c for t, c in by_tier if t},
        "by_channel": {ch: c for ch, c in by_channel if ch},
        "by_city": {city: c for city, c in by_city if city},
        "avg_spend": round(avg_spend, 2),
        "total_revenue": round(total_revenue, 2),
        "total_orders": int(total_orders),
        "tier_descriptions": TIER_DESCRIPTIONS,
    }


@router.get("/")
def list_customers(
    tier: Optional[str] = None,
    city: Optional[str] = None,
    channel: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 25,
    db: Session = Depends(get_db),
):
    """Paginated customer list with filters."""
    query = db.query(Customer)

    if tier:
        query = query.filter(Customer.rfm_tier == tier)
    if city:
        query = query.filter(Customer.city == city)
    if channel:
        query = query.filter(Customer.channel_preference == channel)
    if search:
        query = query.filter(
            or_(
                Customer.name.ilike(f"%{search}%"),
                Customer.email.ilike(f"%{search}%"),
            )
        )

    total = query.count()
    customers = (
        query.order_by(Customer.rfm_score.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "customers": [_serialize_customer(c) for c in customers],
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/{customer_id}")
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    """Single customer with full order history."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    orders = (
        db.query(Order)
        .filter(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
        .limit(30)
        .all()
    )

    return {
        **_serialize_customer(customer),
        "orders": [
            {
                "id": o.id,
                "product_name": o.product_name,
                "product_category": o.product_category,
                "amount": o.amount,
                "created_at": o.created_at.isoformat(),
            }
            for o in orders
        ],
    }


def _serialize_customer(c: Customer) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "email": c.email,
        "phone": c.phone,
        "city": c.city,
        "channel_preference": c.channel_preference,
        "rfm_tier": c.rfm_tier,
        "rfm_score": c.rfm_score,
        "recency_score": c.recency_score,
        "frequency_score": c.frequency_score,
        "monetary_score": c.monetary_score,
        "total_orders": c.total_orders,
        "total_spend": c.total_spend,
        "avg_order_value": c.avg_order_value,
        "days_since_purchase": c.days_since_purchase,
        "last_purchase_date": (
            c.last_purchase_date.isoformat() if c.last_purchase_date else None
        ),
        "created_at": c.created_at.isoformat(),
        "churn_score": c.churn_score,
        "churn_label": c.churn_label,
        "churn_explanation": c.churn_explanation,
        "segment_source": getattr(c, 'segment_source', None),
        "segment_assigned_at": c.segment_assigned_at.isoformat() if getattr(c, 'segment_assigned_at', None) else None,
    }


# ---------------------- CRUD: Create / Update / Delete ---------------------


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    phone: Optional[str] = None
    city: Optional[str] = None
    channel_preference: Optional[str] = None
    segment: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    channel_preference: Optional[str] = None
    segment: Optional[str] = None


@router.post("/", status_code=201)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    """Create a new customer. Validates unique email."""
    existing = db.query(Customer).filter(Customer.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this email already exists")

    if payload.segment and payload.segment not in ALLOWED_SEGMENTS:
        raise HTTPException(status_code=400, detail=f"Unknown segment '{payload.segment}'")

    customer = Customer(
        name=payload.name.strip(),
        email=payload.email,
        phone=payload.phone,
        city=payload.city,
        channel_preference=payload.channel_preference or "whatsapp",
        rfm_tier=payload.segment or None,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    # If the segment was provided manually, record the source and timestamp
    if payload.segment:
        customer.segment_source = 'manual'
        customer.segment_assigned_at = func.now()
        db.add(customer)
        db.commit()
        db.refresh(customer)
    return _serialize_customer(customer)


@router.put("/{customer_id}")
def update_customer(customer_id: int, payload: CustomerUpdate, db: Session = Depends(get_db)):
    """Update customer fields. Email uniqueness enforced."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if payload.email and payload.email != customer.email:
        other = db.query(Customer).filter(Customer.email == payload.email).first()
        if other:
            raise HTTPException(status_code=400, detail="Another customer with this email already exists")

    # Apply updates
    for field in ("name", "email", "phone", "city", "channel_preference"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(customer, field, val)
    # Accept `segment` as alias for rfm_tier
    if getattr(payload, 'segment', None) is not None:
        if payload.segment and payload.segment not in ALLOWED_SEGMENTS:
            raise HTTPException(status_code=400, detail=f"Unknown segment '{payload.segment}'")
        customer.rfm_tier = payload.segment
        customer.segment_source = 'manual'
        customer.segment_assigned_at = func.now()

    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _serialize_customer(customer)


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    """Delete a customer and cascade related orders/communications via DB relationships."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    from app.models import CommunicationLog
    db.query(CommunicationLog).filter(
    CommunicationLog.customer_id == customer_id).delete()

    db.delete(customer)
    db.commit()
    return {"status": "deleted", "id": customer_id}


@router.get("/{customer_id}/360")
def customer_360(customer_id: int, db: Session = Depends(get_db)):
    """Return a consolidated Customer 360 view for dashboards.

    Includes profile, recent orders, total spend, avg order value, campaign history,
    communication history, RFM scores and a simple churn risk heuristic, plus a combined timeline.
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Orders
    orders = (
        db.query(Order)
        .filter(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
        .limit(100)
        .all()
    )

    orders_serialized = [
        {
            'id': o.id,
            'product_name': o.product_name,
            'product_category': o.product_category,
            'amount': o.amount,
            'created_at': o.created_at.isoformat(),
        }
        for o in orders
    ]

    total_spend = customer.total_spend or 0.0
    avg_order_value = customer.avg_order_value or 0.0

    # Communications & campaign history
    comms = (
        db.query(CommunicationLog)
        .filter(CommunicationLog.customer_id == customer_id)
        .order_by(CommunicationLog.created_at.desc())
        .limit(200)
        .all()
    )

    comms_serialized = [
        {
            'id': c.id,
            'campaign_id': c.campaign_id,
            'step_id': c.step_id,
            'channel': c.channel,
            'message': c.message,
            'status': c.status,
            'revenue_attributed': c.revenue_attributed,
            'created_at': c.created_at.isoformat(),
        }
        for c in comms
    ]

    # Campaigns touched — distinct campaign ids from communications
    campaign_ids = list({c.campaign_id for c in comms})
    campaigns = []
    if campaign_ids:
        campaigns_q = db.query(Campaign).filter(Campaign.id.in_(campaign_ids)).all()
        campaigns = [
            {
                'id': cp.id,
                'name': cp.name,
                'status': cp.status,
                'revenue_recovered': cp.revenue_recovered,
            }
            for cp in campaigns_q
        ]

    # RFM & churn heuristic
    rfm = {
        'recency_score': customer.recency_score,
        'frequency_score': customer.frequency_score,
        'monetary_score': customer.monetary_score,
        'rfm_score': customer.rfm_score,
        'rfm_tier': customer.rfm_tier,
    }

    # Simple churn risk heuristic
    churn_risk = 'low'
    try:
        days = customer.days_since_purchase or 9999
        if days > 90 or (customer.recency_score and customer.recency_score <= 2 and (customer.frequency_score or 0) <= 2):
            churn_risk = 'high'
        elif days > 30 or (customer.recency_score and customer.recency_score <= 3):
            churn_risk = 'medium'
    except Exception:
        churn_risk = 'unknown'

    # Build combined timeline (orders + communications + key profile events)
    timeline = []
    for o in orders:
        timeline.append({'type': 'order', 'date': o.created_at.isoformat(), 'label': f'Order #{o.id}', 'details': {'amount': o.amount, 'product': o.product_name}})
    for c in comms:
        timeline.append({'type': 'comm', 'date': c.created_at.isoformat(), 'label': f'{c.channel} - {c.status}', 'details': {'campaign_id': c.campaign_id, 'step_id': c.step_id}})

    # Add profile creation event
    if customer.created_at:
        timeline.append({'type': 'profile', 'date': customer.created_at.isoformat(), 'label': 'Profile Created', 'details': {}})

    # Add manual segment assignment event if present
    if getattr(customer, 'segment_source', None) == 'manual' and getattr(customer, 'segment_assigned_at', None):
        timeline.append({'type': 'segment', 'date': customer.segment_assigned_at.isoformat(), 'label': f"Segment assigned: {customer.rfm_tier}", 'details': {'source': 'manual'}})

    # Chronological order
    timeline_sorted = sorted(timeline, key=lambda t: t['date'], reverse=True)

    return {
        'profile': _serialize_customer(customer),
        'orders': orders_serialized,
        'total_spend': total_spend,
        'avg_order_value': avg_order_value,
        'communications': comms_serialized,
        'campaigns': campaigns,
        'rfm': rfm,
        'churn_risk': churn_risk,
        'timeline': timeline_sorted,
    }


@router.post('/upload')
def upload_customers_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV of customers with header: name,email,phone,city
    Deduplicates on email (skips existing). Returns a report of created and skipped rows.
    After creating customers, triggers an RFM recompute in the background and returns the tier summary.
    """
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail='Only CSV files are accepted')

    content = file.file.read().decode('utf-8')
    reader = csv.DictReader(StringIO(content))

    created = []
    skipped = []
    errors = []

    row_num = 1
    for row in reader:
        row_num += 1
        name = (row.get('name') or '').strip()
        email = (row.get('email') or '').strip()
        phone = (row.get('phone') or '').strip() or None
        city = (row.get('city') or '').strip() or None

        if not name or not email:
            errors.append({'row': row_num, 'reason': 'Missing name or email', 'row': row})
            continue

        # Validate email uniqueness
        existing = db.query(Customer).filter(Customer.email == email).first()
        if existing:
            skipped.append({'row': row_num, 'email': email, 'reason': 'Duplicate'})
            continue

        try:
            cust = Customer(
                name=name,
                email=email,
                phone=phone,
                city=city,
                channel_preference='whatsapp',
            )
            db.add(cust)
            db.commit()
            db.refresh(cust)
            created.append({'row': row_num, 'id': cust.id, 'email': cust.email})
        except Exception as e:
            db.rollback()
            errors.append({'row': row_num, 'reason': str(e), 'row': row})

    # Recompute RFM in background to avoid blocking the upload response

    # Run RFM recompute in background using a fresh DB session (don't reuse request-scoped session)
    from app.database import SessionLocal

    def recompute():
        session = SessionLocal()
        try:
            compute_all_rfm(session)
        except Exception:
            pass
        finally:
            session.close()

    background_tasks.add_task(recompute)

    return {
        'created_count': len(created),
        'skipped_count': len(skipped),
        'errors_count': len(errors),
        'created': created,
        'skipped': skipped,
        'errors': errors,
    }