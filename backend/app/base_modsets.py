"""Maintain local export positions without copying inherited version state."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ModSet, ModSetExportOrder, UserMod


def initialize_export_orders(db: Session, child_id: int, base_id: int) -> None:
    """Freeze initial positions; later parent order edits must not move child mods."""
    orders = {row.mod_id for row in db.scalars(select(ModSetExportOrder).where(ModSetExportOrder.modset_id == child_id))}
    local = {row.mod_id: row for row in db.scalars(select(UserMod).where(UserMod.modset_id == child_id))}
    for source in db.scalars(select(UserMod).where(UserMod.modset_id == base_id)):
        overlap = local.get(source.mod_id)
        if source.mod_id not in orders:
            db.add(ModSetExportOrder(modset_id=child_id, mod_id=source.mod_id,
                                    load_order=overlap.load_order if overlap else source.load_order))
        # A newly added parent mod takes precedence over a local entry of the same ID.
        # Preserve its local order, but never keep a dormant local version to resurface later.
        if overlap:
            db.delete(overlap)


def synchronize_derived_modsets(db: Session, base_id: int) -> None:
    db.flush()
    for child_id in db.scalars(select(ModSet.id).where(ModSet.base_modset_id == base_id)):
        initialize_export_orders(db, child_id, base_id)


def lock_inheritance_graph(db: Session) -> None:
    """Serialize link/unlink/delete so concurrent requests cannot form a cycle."""
    if db.get_bind().dialect.name == 'postgresql':
        from sqlalchemy import text
        db.execute(text('SELECT pg_advisory_xact_lock(674293503)'))
        db.expire_all()


def order_key(row):
    return (row.load_order, (row.mod.name or row.mod_id).lower(), row.mod_id)


def base_sequence(db: Session, base_id: int) -> list[str]:
    from app.mod_queries import list_local_user_mods
    return [row.mod_id for row in sorted(list_local_user_mods(db, base_id), key=order_key)]


def merged_order(db: Session, modset: ModSet, mappings, *, project: bool = False):
    """Resolve local insertions against the current parent order without writing on reads."""
    source_ids = base_sequence(db, modset.base_modset_id)
    source_set = set(source_ids)
    by_id = {row.mod_id: row for row in mappings}
    placements = {row.mod_id: row for row in db.scalars(select(ModSetExportOrder).where(ModSetExportOrder.modset_id == modset.id))}
    buckets = {mod_id: [] for mod_id in source_ids}
    tail = []
    current = sorted(mappings, key=order_key)
    for index, row in enumerate(current):
        if row.mod_id in source_set:
            continue
        placement = placements.get(row.mod_id)
        if project:
            candidates = [item.mod_id for item in current[index + 1:] if item.mod_id in source_set]
        else:
            candidates = placement.before_mod_ids if placement and placement.before_mod_ids is not None else []
        anchor = next((mod_id for mod_id in candidates if mod_id in source_set), None)
        (buckets[anchor] if anchor else tail).append(row)
    result = []
    for mod_id in source_ids:
        result.extend(buckets[mod_id])
        if mod_id in by_id:
            result.append(by_id[mod_id])
    result.extend(tail)
    return result


def effective_order(db: Session, modset_id: int, mappings):
    modset = db.get(ModSet, modset_id)
    if modset and modset.base_modset_id and modset.export_order_mode == 'base':
        return merged_order(db, modset, mappings)
    return sorted(mappings, key=order_key)


def save_placements(db: Session, modset: ModSet, ordered, source_ids: list[str]) -> None:
    """Store a local order plus the source suffix for deterministic deletion fallback."""
    source_set = set(source_ids)
    for index, row in enumerate(ordered):
        if row.mod_id in source_set:
            continue
        anchor = next((item.mod_id for item in ordered[index + 1:] if item.mod_id in source_set), None)
        candidates = source_ids[source_ids.index(anchor):] if anchor else []
        placement = db.get(ModSetExportOrder, (modset.id, row.mod_id))
        if placement is None:
            placement = ModSetExportOrder(modset_id=modset.id, mod_id=row.mod_id)
            db.add(placement)
        placement.before_mod_ids = candidates
        placement.load_order = index * 10 + 500
        row.load_order = index * 10 + 500


def change_order_mode(db: Session, modset: ModSet, mappings, mode: str) -> None:
    if mode == modset.export_order_mode:
        return
    if mode == 'base':
        current = sorted(mappings, key=order_key)
        save_placements(db, modset, current, base_sequence(db, modset.base_modset_id))
    else:
        current = effective_order(db, modset.id, mappings)
        for index, row in enumerate(current):
            value = 500 + index * 10
            if getattr(row, 'inherited_from_modset_id', None):
                placement = db.get(ModSetExportOrder, (modset.id, row.mod_id))
                if placement is None:
                    placement = ModSetExportOrder(modset_id=modset.id, mod_id=row.mod_id)
                    db.add(placement)
                placement.load_order = value
            else:
                row.load_order = value
    modset.export_order_mode = mode
