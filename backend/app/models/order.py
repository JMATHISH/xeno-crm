from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_name: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Category mapping to product_category
    product_category: Mapped[str] = mapped_column(String(50), nullable=False)
    category = synonym("product_category")
    
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    
    # order_date mapping to created_at
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    order_date = synonym("created_at")

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="orders")