from sqlalchemy import func, select
from sqlalchemy.orm import Session

from datetime import datetime, timedelta, timezone

from app.auth import SESSION_TTL_SECONDS, hash_password
from app.models import User
from app.schemas import UserCreate, UserRead, UserUpdate


def user_to_read(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


def auth_user_to_read(user: User, session_expires_at=None):
    from app.schemas import AuthUserRead

    expires_at = session_expires_at
    if expires_at is None:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=SESSION_TTL_SECONDS)
    return AuthUserRead(id=user.id, username=user.username, role=user.role, session_expires_at=expires_at)


def list_users(db: Session) -> list[UserRead]:
    users = db.scalars(select(User).order_by(func.lower(User.username))).all()
    return [user_to_read(user) for user in users]


def create_user(db: Session, payload: UserCreate) -> UserRead:
    username = payload.username.strip()
    existing = db.scalar(select(User).where(func.lower(User.username) == username.casefold()))
    if existing:
        raise ValueError("Username already exists")

    user = User(
        username=username,
        password_hash=hash_password(payload.password),
        role=payload.role.value,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_read(user)


def update_user(db: Session, user_id: int, payload: UserUpdate) -> UserRead | None:
    user = db.get(User, user_id)
    if not user:
        return None

    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.role is not None:
        user.role = payload.role.value
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user_to_read(user)
