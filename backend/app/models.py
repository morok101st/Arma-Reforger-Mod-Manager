from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Mod(Base):
    __tablename__ = "mods"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    latest_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    game_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    size: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dependencies: Mapped[list[dict[str, str | None]]] = mapped_column(JSON, default=list)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    last_checked: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    versions: Mapped[list["ModVersion"]] = relationship(
        back_populates="mod",
        cascade="all, delete-orphan",
        order_by="desc(ModVersion.created_at)",
    )
    user_mods: Mapped[list["UserMod"]] = relationship(back_populates="mod", cascade="all, delete-orphan")


class ModVersion(Base):
    __tablename__ = "mod_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    mod_id: Mapped[str] = mapped_column(ForeignKey("mods.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(80), index=True)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    mod: Mapped[Mod] = relationship(back_populates="versions")


class UserMod(Base):
    __tablename__ = "user_mods"
    __table_args__ = (UniqueConstraint("modset_id", "mod_id", name="uq_user_mods_modset_mod"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    modset_id: Mapped[int] = mapped_column(ForeignKey("modsets.id", ondelete="CASCADE"), index=True)
    mod_id: Mapped[str] = mapped_column(ForeignKey("mods.id", ondelete="CASCADE"), index=True)
    current_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_core: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    tracking_reason: Mapped[str] = mapped_column(String(24), default="manual", server_default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    mod: Mapped[Mod] = relationship(back_populates="user_mods")
    modset: Mapped["ModSet"] = relationship(back_populates="user_mods")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(24), default="user", server_default="user", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    active_modset_id: Mapped[int | None] = mapped_column(ForeignKey("modsets.id", ondelete="SET NULL"), nullable=True, index=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    active_modset: Mapped["ModSet | None"] = relationship(back_populates="active_users")


class ModSet(Base):
    __tablename__ = "modsets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user_mods: Mapped[list[UserMod]] = relationship(back_populates="modset", cascade="all, delete-orphan")
    active_users: Mapped[list[User]] = relationship(back_populates="active_modset")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_username: Mapped[str | None] = mapped_column(String(80), nullable=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    detail: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(80), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SchedulerRun(Base):
    __tablename__ = "scheduler_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    refreshed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failed: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
