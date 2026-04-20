from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text, func
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
    user_mod: Mapped["UserMod | None"] = relationship(back_populates="mod", cascade="all, delete-orphan")


class ModVersion(Base):
    __tablename__ = "mod_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    mod_id: Mapped[str] = mapped_column(ForeignKey("mods.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(80), index=True)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    mod: Mapped[Mod] = relationship(back_populates="versions")


class UserMod(Base):
    __tablename__ = "user_mods"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    mod_id: Mapped[str] = mapped_column(ForeignKey("mods.id", ondelete="CASCADE"), unique=True, index=True)
    current_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    tracking_reason: Mapped[str] = mapped_column(String(24), default="manual", server_default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    mod: Mapped[Mod] = relationship(back_populates="user_mod")
