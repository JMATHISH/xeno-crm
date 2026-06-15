from datetime import datetime
from typing import List, Optional
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, Float, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    channel_preference: Mapped[Optional[str]] = mapped_column(String(20), default="whatsapp")

    # RFM scores
    recency_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    frequency_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    monetary_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rfm_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rfm_tier: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Churn prediction
    churn_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    churn_label: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    churn_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Synonym for 'segment' mapping to 'rfm_tier'
    segment = synonym("rfm_tier")

    # Track how the segment was assigned (manual, rfm, copilot, upload)
    segment_source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    segment_assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Aggregated order stats
    total_orders: Mapped[int] = mapped_column(Integer, default=0)
    total_spend: Mapped[float] = mapped_column(Float, default=0.0)
    avg_order_value: Mapped[float] = mapped_column(Float, default=0.0)
    last_purchase_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    days_since_purchase: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    orders: Mapped[List["Order"]] = relationship(
        "Order", back_populates="customer", cascade="all, delete-orphan"
    )
    communications: Mapped[List["CommunicationLog"]] = relationship(
        "CommunicationLog", back_populates="customer"
    )

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.communication import CommunicationLog