from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Float, DateTime, Text, JSON, ForeignKey
from sqlalchemy import Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Campaign(Base):
    """
    Top-level goal set by the marketer.
    The agent plans and executes a sequence of CampaignSteps to achieve it.
    """
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    goal_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    status: Mapped[str] = mapped_column(String(20), default="draft")
    
    # User requested channel field on Campaign
    channel: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Rolled-up results
    revenue_recovered: Mapped[float] = mapped_column(Float, default=0.0)
    total_customers_reached: Mapped[int] = mapped_column(Integer, default=0)

    # Full agent plan stored for the reasoning trace UI
    agent_plan: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    # Prediction fields (filled before launch)
    predicted_revenue: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    predicted_conversions: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    success_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    prediction_explanation: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Relationships
    steps: Mapped[List["CampaignStep"]] = relationship(
        "CampaignStep",
        back_populates="campaign",
        cascade="all, delete-orphan",
        order_by="CampaignStep.step_number",
    )
    communications: Mapped[List[object]] = relationship(
        "CommunicationLog", back_populates="campaign"
    )


class CampaignStep(Base):
    """
    One wave of the campaign targeting a specific audience segment.
    """
    __tablename__ = "campaign_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    campaign_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Segment
    segment_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    rfm_filter: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    customer_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Message
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    channel: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    offer_text: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Lifecycle
    status: Mapped[str] = mapped_column(String(20), default="pending")

    # Delivery metrics
    send_count: Mapped[int] = mapped_column(Integer, default=0)
    delivered_count: Mapped[int] = mapped_column(Integer, default=0)
    opened_count: Mapped[int] = mapped_column(Integer, default=0)
    clicked_count: Mapped[int] = mapped_column(Integer, default=0)
    converted_count: Mapped[int] = mapped_column(Integer, default=0)
    revenue_recovered: Mapped[float] = mapped_column(Float, default=0.0)

    # Reasoning cards
    pre_reasoning: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    post_reasoning: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    launched_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="steps")
    communications: Mapped[List[object]] = relationship(
        "CommunicationLog", back_populates="step"
    )