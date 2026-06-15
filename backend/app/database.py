from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from typing import Generator
from app.services.config import settings

# SQLite needs check_same_thread=False
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Startup code that automatically creates all tables by registering all models."""
    from app.models.customer import Customer
    from app.models.order import Order
    from app.models.campaign import Campaign, CampaignStep
    from app.models.communication import CommunicationLog
    Base.metadata.create_all(bind=engine)


# Run startup table creation automatically on import
init_db()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()