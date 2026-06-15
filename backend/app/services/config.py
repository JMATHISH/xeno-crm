from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./brew_crm.db"
    GEMINI_API_KEY: str = ""
    CHANNEL_SERVICE_URL: str = "http://localhost:8001"
    CRM_RECEIPT_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"
    REDIS_URL: str = "redis://localhost:6379/0"
    # Email / SMTP settings
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "no-reply@yourdomain.com"
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    MAIL_FROM_NAME: str = "Brew & Co"
    # Twilio / SMS settings
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    class Config:
        env_file = ".env"


settings = Settings()