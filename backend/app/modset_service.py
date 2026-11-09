from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.base_modsets import (initialize_export_orders, lock_inheritance_graph, effective_order, merged_order,
    change_order_mode, base_sequence, save_placements)
from app.models import ModSet, ModSetGroupPermission, User, UserMod, ModSetExportOrder
from app.mod_queries import list_tracked_user_mods, list_local_user_mods
from app.modset_permissions import accessible_modset_filter, modset_capabilities, require_modset_permission, set_modset_group_permissions
from app.schemas_modsets import ModSetCreate, ModSetExportEntry, ModSetLoadOrderUpdate, ModSetRead, ModSetUpdate, ModSetExportOrderUpdate, ModSetLoadOrderEntry


class ModSetError(ValueError):
    pass


class ModSetNotFoundError(ModSetError):
    pass


class ModSetConflictError(ModSetError):
    pass


class ModSetPermissionError(ModSetError):
    pass


class ModSetLastDeleteError(ModSetError):
    pass


def list_modsets(db: Session, user: User) -> list[ModSetRead]:
    return _list_modsets(db, user)


def list_modsets_for_admin(db: Session) -> list[ModSetRead]:
    # This directory is for webhook administration, not a grant of modset access.
    return _list_modsets(db)


def _list_modsets(db: Session, user: User | None = None) -> list[ModSetRead]:
    count = select(func.count(func.distinct(UserMod.mod_id))).where(or_(
        UserMod.modset_id == ModSet.id, UserMod.modset_id == ModSet.base_modset_id,
    )).correlate(ModSet).scalar_subquery()
    group_access = select(ModSetGroupPermission.modset_id).where(ModSetGroupPermission.modset_id == ModSet.id).exists()
    columns = [ModSet, User.username.label("owner_username"), count.label("tracked_mods_count"), group_access.label("has_group_access")]
    if user is not None:
        columns.append(accessible_modset_filter(user, write=True).label("can_edit"))
    query = select(*columns).outerjoin(User, User.id == ModSet.owner_user_id)
    if user is not None:
        query = query.where(accessible_modset_filter(user))
    rows = db.execute(query.order_by(func.lower(ModSet.name), ModSet.id)).all()
    return [ModSetRead(
        id=row.ModSet.id, name=row.ModSet.name,
        tracked_mods_count=row.tracked_mods_count if base_readable(db, row.ModSet, user) else db.scalar(select(func.count(UserMod.id)).where(UserMod.modset_id == row.ModSet.id)), owner_username=row.owner_username,
        **base_details(db, row.ModSet, user),
        is_owner=bool(user and row.ModSet.owner_user_id == user.id),
        can_edit=bool(user and row.can_edit),
        can_delete=bool(user and (user.role == "admin" or row.ModSet.owner_user_id == user.id)),
        can_manage_access=bool(user and (user.role == "admin" or row.ModSet.owner_user_id == user.id)),
        has_group_access=row.has_group_access,
        created_at=row.ModSet.created_at, updated_at=row.ModSet.updated_at,
    ) for row in rows]


def ensure_user_active_modset(db: Session, user: User) -> ModSet | None:
    if user.active_modset_id:
        current = _get_accessible_modset(db, user, user.active_modset_id)
        if current:
            return current
    fallback = db.scalar(select(ModSet).where(accessible_modset_filter(user))
                         .order_by(func.lower(ModSet.name), ModSet.id).limit(1))
    fallback_id = fallback.id if fallback else None
    if user.active_modset_id != fallback_id:
        user.active_modset_id = fallback_id
        db.commit()
        db.refresh(user)
    return fallback


def resolve_modset_id(db: Session, user: User, requested_modset_id: int | None, *, write: bool = False) -> int:
    if requested_modset_id is None:
        active = ensure_user_active_modset(db, user)
        if active is None:
            raise ModSetNotFoundError("No accessible modset")
        requested_modset_id = active.id
    return require_modset_permission(db, user, requested_modset_id, "write" if write else "read").id


def create_modset(db: Session, user: User, payload: ModSetCreate) -> ModSetRead:
    lock_inheritance_graph(db)
    name = payload.name.strip()
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == name.casefold()))
    if existing:
        raise ModSetConflictError("Modset name already exists")
    if payload.base_modset_id is not None:
        validate_base(db, user, None, payload.base_modset_id)
    modset = ModSet(name=name, owner_user_id=user.id, base_modset_id=payload.base_modset_id,
                    export_order_mode=payload.export_order_mode if payload.base_modset_id else "independent")
    db.add(modset)
    db.flush()
    if modset.base_modset_id:
        initialize_export_orders(db, modset.id, modset.base_modset_id)
    db.commit()
    db.refresh(modset)
    return _modset_to_read(db, modset, user)


def duplicate_modset(db: Session, user: User, modset_id: int) -> ModSetRead:
    source = _get_accessible_modset(db, user, modset_id)
    if not source:
        raise ModSetNotFoundError("Modset not found")

    duplicate = ModSet(
        name=_build_copy_name(db, source.name),
        owner_user_id=user.id,
        shared=False,
    )
    db.add(duplicate)
    db.flush()

    require_modset_permission(db, user, source.id)
    source_rows = effective_order(db, source.id, list_tracked_user_mods(db, source.id))
    for index, row in enumerate(source_rows):
        db.add(
            UserMod(
                modset_id=duplicate.id,
                mod_id=row.mod_id,
                current_version=row.current_version,
                pinned=row.pinned,
                is_core=row.is_core,
                dependency_origin=row.dependency_origin,
                tracking_reason=row.tracking_reason,
                load_order=500 + index * 10 if source.export_order_mode == "base" else row.load_order,
            )
        )

    db.commit()
    db.refresh(duplicate)
    return _modset_to_read(db, duplicate, user)


def update_modset(db: Session, user: User, modset_id: int, payload: ModSetUpdate) -> ModSetRead:
    lock_inheritance_graph(db)
    modset = require_modset_permission(db, user, modset_id, "write")
    if payload.group_permissions is not None:
        require_modset_permission(db, user, modset_id, "manage")

    name = payload.name.strip()
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == name.casefold(), ModSet.id != modset_id))
    if existing:
        raise ModSetConflictError("Modset name already exists")

    if payload.group_permissions is not None:
        set_modset_group_permissions(db, modset_id, payload.group_permissions)
    if "base_modset_id" in payload.model_fields_set and payload.base_modset_id != modset.base_modset_id:
        require_modset_permission(db, user, modset_id, "manage")
        change_base(db, user, modset, payload.base_modset_id, payload.confirm_base_conflicts)
    if payload.export_order_mode is not None and payload.export_order_mode != modset.export_order_mode:
        require_modset_permission(db, user, modset_id, "manage")
        if not modset.base_modset_id and payload.export_order_mode == "base":
            raise HTTPException(status_code=409, detail="Choose a parent modset before following its order.")
        if not payload.confirm_order_change:
            raise HTTPException(status_code=409, detail="Preview and confirm the export order change first.")
        change_order_mode(db, modset, list_tracked_user_mods(db, modset_id), payload.export_order_mode)
    modset.name = name
    db.commit()
    db.refresh(modset)
    return _modset_to_read(db, modset, user)


def update_modset_load_order(db: Session, user: User, modset_id: int, payload: ModSetLoadOrderUpdate) -> None:
    lock_inheritance_graph(db)
    require_modset_permission(db, user, modset_id, "write")

    entries_by_mod_id = {entry.mod_id: entry.load_order for entry in payload.entries}
    if len(entries_by_mod_id) != len(payload.entries):
        raise ValueError("Duplicate mod IDs are not allowed")

    mappings = list_tracked_user_mods(db, modset_id)
    mappings_by_mod_id = {mapping.mod_id: mapping for mapping in mappings}
    missing_ids = sorted(set(entries_by_mod_id) - set(mappings_by_mod_id))
    if missing_ids:
        raise ValueError(f"Mods are not tracked in this modset: {', '.join(missing_ids)}")

    modset = db.get(ModSet, modset_id)
    if modset.base_modset_id and modset.export_order_mode == "base":
        # Full displayed export sequence is required: reject stale or partial edits.
        exported = [row for row in mappings if (row.current_version or "").strip()]
        if set(entries_by_mod_id) != {row.mod_id for row in exported}:
            raise HTTPException(status_code=409, detail="Export content changed or the order is incomplete. Reload and move your local mods again.")
        ordered = sorted(exported, key=lambda row: (entries_by_mod_id[row.mod_id], (row.mod.name or row.mod_id).lower(), row.mod_id))
        source_ids = base_sequence(db, modset.base_modset_id)
        inherited = [row.mod_id for row in ordered if getattr(row, "inherited_from_modset_id", None)]
        if inherited != [mod_id for mod_id in source_ids if mod_id in inherited]:
            raise HTTPException(status_code=409, detail="Parent mod order is binding. Move local mods between parent mods instead.")
        save_placements(db, modset, ordered, source_ids)
        db.commit()
        return

    for mod_id, load_order in entries_by_mod_id.items():
        mapping = mappings_by_mod_id[mod_id]
        if getattr(mapping, "inherited_from_modset_id", None):
            set_inherited_order(db, modset_id, mod_id, load_order)
        else:
            mapping.load_order = load_order

    db.commit()


def delete_modset(db: Session, user: User, modset_id: int) -> None:
    lock_inheritance_graph(db)
    modset = require_modset_permission(db, user, modset_id, "delete")

    if db.scalar(select(ModSet.id).where(ModSet.base_modset_id == modset_id).limit(1)):
        raise HTTPException(status_code=409, detail="This parent modset is still used by child modsets. Detach them first.")
    count = db.scalar(select(func.count()).select_from(ModSet)) or 0
    if count <= 1:
        raise ModSetLastDeleteError("At least one modset is required")

    users = db.scalars(select(User).where(User.active_modset_id == modset_id)).all()
    db.execute(delete(ModSetExportOrder).where(ModSetExportOrder.modset_id == modset_id))
    db.delete(modset)
    db.commit()

    for affected_user in users:
        ensure_user_active_modset(db, affected_user)


def activate_modset(db: Session, user: User, modset_id: int) -> ModSet:
    modset = _get_accessible_modset(db, user, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")
    require_modset_permission(db, user, modset.id)
    user.active_modset_id = modset.id
    db.commit()
    db.refresh(user)
    return modset


def export_modset(db: Session, user: User, modset_id: int) -> list[ModSetExportEntry]:
    modset = _get_accessible_modset(db, user, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")

    require_modset_permission(db, user, modset_id)
    rows = [row for row in effective_order(db, modset_id, list_tracked_user_mods(db, modset_id)) if (row.current_version or "").strip()]
    return [ModSetExportEntry(modId=row.mod_id, name=row.mod.name or row.mod_id, version=row.current_version) for row in rows]


def ensure_accessible_modset(db: Session, user: User, modset_id: int) -> ModSet:
    modset = require_modset_permission(db, user, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")
    return modset


def _get_accessible_modset(db: Session, user: User, modset_id: int) -> ModSet | None:
    return db.scalar(select(ModSet).where(ModSet.id == modset_id, accessible_modset_filter(user)))


def _build_copy_name(db: Session, base_name: str) -> str:
    candidate = f"{base_name} (copy)"
    if not db.scalar(select(ModSet.id).where(func.lower(ModSet.name) == candidate.casefold())):
        return candidate

    index = 2
    while True:
        candidate = f"{base_name} (copy {index})"
        if not db.scalar(select(ModSet.id).where(func.lower(ModSet.name) == candidate.casefold())):
            return candidate
        index += 1


def _modset_to_read(db: Session, modset: ModSet, user: User) -> ModSetRead:
    source_ids = [modset.id] + ([modset.base_modset_id] if modset.base_modset_id else [])
    tracked_mods_count = db.scalar(select(func.count(func.distinct(UserMod.mod_id))).where(UserMod.modset_id.in_(source_ids))) or 0
    return ModSetRead(
        id=modset.id,
        name=modset.name,
        **base_details(db, modset),
        tracked_mods_count=int(tracked_mods_count),
        owner_username=modset.owner.username if modset.owner else None,
        is_owner=bool(modset.owner_user_id == user.id),
        **modset_capabilities(db, user, modset),
        has_group_access=db.scalar(select(ModSetGroupPermission.modset_id).where(ModSetGroupPermission.modset_id == modset.id).limit(1)) is not None,
        created_at=modset.created_at,
        updated_at=modset.updated_at,
    )


def base_readable(db: Session, modset: ModSet, user: User | None) -> bool:
    return not modset.base_modset_id or user is None or db.scalar(select(ModSet.id).where(
        ModSet.id == modset.base_modset_id, accessible_modset_filter(user),
    )) is not None


def base_details(db: Session, modset: ModSet, user: User | None = None) -> dict:
    base = db.get(ModSet, modset.base_modset_id) if modset.base_modset_id else None
    return dict(export_order_mode=modset.export_order_mode, base_modset_id=modset.base_modset_id, base_modset_name=base.name if base and base_readable(db, modset, user) else None,
                derived_modsets_count=db.scalar(select(func.count()).select_from(ModSet).where(ModSet.base_modset_id == modset.id)) or 0)


def validate_base(db: Session, user: User, modset: ModSet | None, base_id: int) -> ModSet:
    base = require_modset_permission(db, user, base_id)
    if base.base_modset_id or (modset and (base_id == modset.id or db.scalar(
        select(ModSet.id).where(ModSet.base_modset_id == modset.id).limit(1)
    ))):
        raise HTTPException(status_code=409, detail="Only one parent and one inheritance level are supported. A parent cannot itself inherit.")
    return base


def set_inherited_order(db: Session, modset_id: int, mod_id: str, value: int) -> None:
    order = db.get(ModSetExportOrder, (modset_id, mod_id))
    if order is None:
        db.add(ModSetExportOrder(modset_id=modset_id, mod_id=mod_id, load_order=value))
    else:
        order.load_order = value


def change_base(db: Session, user: User, modset: ModSet, base_id: int | None, confirmed: bool) -> None:
    if modset.base_modset_id is not None and base_id is not None:
        raise HTTPException(status_code=409, detail="Detach the current parent before choosing another parent.")
    if base_id is None:
        # Preserve the effective versions and order as independent local entries.
        effective = effective_order(db, modset.id, list_tracked_user_mods(db, modset.id))
        for index, row in enumerate(effective):
            if not getattr(row, "inherited_from_modset_id", None):
                if modset.export_order_mode == "base":
                    row.load_order = 500 + index * 10
                continue
            target = next((local for local in list_local_user_mods(db, modset.id) if local.mod_id == row.mod_id), None)
            if target is None:
                target = UserMod(modset_id=modset.id, mod_id=row.mod_id)
                db.add(target)
            for field in ("current_version", "pinned", "is_core", "dependency_origin", "tracking_reason", "load_order"):
                setattr(target, field, 500 + index * 10 if field == "load_order" and modset.export_order_mode == "base" else getattr(row, field))
        modset.export_order_mode = "independent"
        db.execute(delete(ModSetExportOrder).where(ModSetExportOrder.modset_id == modset.id))
    else:
        base = validate_base(db, user, modset, base_id)
        base_ids = {row.mod_id for row in list_local_user_mods(db, base.id)}
        conflicts = [row for row in list_local_user_mods(db, modset.id) if row.mod_id in base_ids]
        if conflicts and not confirmed:
            raise HTTPException(status_code=409, detail="These local mods will use the parent versions: " + ", ".join(row.mod.name or row.mod_id for row in conflicts) + ". Confirm the replacement to continue.")
        for row in conflicts:
            set_inherited_order(db, modset.id, row.mod_id, row.load_order)
            db.delete(row)
    modset.base_modset_id = base_id
    db.flush()
    if base_id:
        initialize_export_orders(db, modset.id, base_id)


def preview_export_order(db: Session, user: User, modset_id: int, mode: str, base_id: int | None = None) -> list[ModSetExportEntry]:
    from types import SimpleNamespace
    modset = require_modset_permission(db, user, modset_id, "manage")
    target_base = base_id or modset.base_modset_id
    mappings = list_tracked_user_mods(db, modset_id)
    if mode == "base":
        if not target_base:
            raise HTTPException(status_code=409, detail="Choose a parent modset first.")
        validate_base(db, user, modset, target_base)
        if target_base != modset.base_modset_id:
            local_orders = {row.mod_id: row.load_order for row in mappings}
            source = list_local_user_mods(db, target_base)
            source_ids = {row.mod_id for row in source}
            mappings = [row for row in mappings if row.mod_id not in source_ids] + [SimpleNamespace(
                mod_id=row.mod_id, mod=row.mod, current_version=row.current_version,
                load_order=local_orders.get(row.mod_id, row.load_order),
            ) for row in source]
        view = SimpleNamespace(id=modset_id, base_modset_id=target_base)
        rows = merged_order(db, view, mappings, project=modset.export_order_mode != "base" or target_base != modset.base_modset_id)
    else:
        rows = effective_order(db, modset_id, mappings)
    return [ModSetExportEntry(modId=row.mod_id, name=row.mod.name or row.mod_id, version=row.current_version) for row in rows if (row.current_version or "").strip()]


def update_export_order(db: Session, user: User, modset_id: int, payload: ModSetExportOrderUpdate) -> None:
    """Save a complete explicit export sequence; numeric endpoints remain compatible."""
    lock_inheritance_graph(db)
    require_modset_permission(db, user, modset_id, "write")
    if len(set(payload.mod_ids)) != len(payload.mod_ids):
        raise HTTPException(status_code=400, detail="Duplicate mod IDs are not allowed")
    current_ids = {row.mod_id for row in list_tracked_user_mods(db, modset_id) if (row.current_version or "").strip()}
    if set(payload.mod_ids) != current_ids:
        raise HTTPException(status_code=409, detail="Export content changed or the order is incomplete. Reload and move mods again.")
    update_modset_load_order(db, user, modset_id, ModSetLoadOrderUpdate(entries=[
        ModSetLoadOrderEntry(mod_id=mod_id, load_order=index) for index, mod_id in enumerate(payload.mod_ids)
    ]))
