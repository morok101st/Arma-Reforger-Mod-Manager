from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import User
from app.passwords import hash_password


def bootstrap_admin(db: Session) -> None:
    settings = get_settings()
    existing_admin = db.scalar(select(User).where(User.role == "admin"))
    if existing_admin:
        return

    if not settings.armm_admin_username or not settings.armm_admin_password:
        if settings.is_production:
            raise RuntimeError("ARMM_ADMIN_USERNAME and ARMM_ADMIN_PASSWORD are required for first production startup")
        return

    db.add(
        User(
            username=settings.armm_admin_username,
            password_hash=hash_password(settings.armm_admin_password),
            role="admin",
            is_active=True,
        )
    )
    db.commit()
