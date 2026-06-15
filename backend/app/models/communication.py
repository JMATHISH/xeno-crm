import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from app.database import Base


class CommunicationLog(Base):
    """
    One message sent to one customer in one campaign step.
    """
    __tablename__ = "communication_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    campaign_id: Mapped[int] = mapped_column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    step_id: Mapped[int] = mapped_column(Integer, ForeignKey("campaign_steps.id"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False, index=True)

    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="sent", nullable=False)

    idempotency_key: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        default=lambda: str(uuid.uuid4()),
    )

    revenue_attributed: Mapped[float] = mapped_column(Float, default=0.0)

    # created_at and its synonym timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    timestamp = synonym("created_at")
    
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    clicked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    twilio_sid: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="communications")
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="communications")
    step: Mapped["CampaignStep"] = relationship("CampaignStep", back_populates="communications")


# Alias/export Communication for direct reference
Communication = CommunicationLog