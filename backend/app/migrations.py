from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def migrate_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    dialect = engine.dialect.name

    if "modsets" in inspector.get_table_names():
        _ensure_default_modset(engine)

    if "user_mods" not in inspector.get_table_names():
        _migrate_mod_versions(engine, inspector)
        _migrate_users(engine, inspector)
        return

    user_mod_columns = {column["name"] for column in inspector.get_columns("user_mods")}
    if "tracking_reason" not in user_mod_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE user_mods ADD COLUMN tracking_reason VARCHAR(24) NOT NULL DEFAULT 'manual'")
            )

    if "modset_id" not in user_mod_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE user_mods ADD COLUMN modset_id INTEGER"))

    _ensure_default_modset(engine)
    with engine.begin() as connection:
        default_modset_id = connection.execute(text("SELECT id FROM modsets ORDER BY id LIMIT 1")).scalar()
        if default_modset_id is not None:
            connection.execute(
                text("UPDATE user_mods SET modset_id = :modset_id WHERE modset_id IS NULL"),
                {"modset_id": int(default_modset_id)},
            )

    if dialect == "postgresql":
        _migrate_user_mods_postgres(engine)

    inspector = inspect(engine)
    _migrate_mod_versions(engine, inspector)
    _migrate_users(engine, inspector)


def _migrate_user_mods_postgres(engine: Engine) -> None:
    inspector = inspect(engine)

    fk_names = {fk["name"] for fk in inspector.get_foreign_keys("user_mods") if fk.get("name")}
    with engine.begin() as connection:
        if "user_mods_modset_id_fkey" not in fk_names:
            connection.execute(
                text(
                    "ALTER TABLE user_mods "
                    "ADD CONSTRAINT user_mods_modset_id_fkey "
                    "FOREIGN KEY (modset_id) REFERENCES modsets(id) ON DELETE CASCADE"
                )
            )
        connection.execute(text("ALTER TABLE user_mods ALTER COLUMN modset_id SET NOT NULL"))

    unique_constraints = inspector.get_unique_constraints("user_mods")
    old_unique_names = [
        constraint["name"]
        for constraint in unique_constraints
        if constraint.get("name") and constraint.get("column_names") == ["mod_id"]
    ]
    with engine.begin() as connection:
        for constraint_name in old_unique_names:
            connection.execute(text(f'ALTER TABLE user_mods DROP CONSTRAINT IF EXISTS "{constraint_name}"'))
        connection.execute(
            text(
                "DO $$ BEGIN "
                "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_mods_modset_mod') THEN "
                "ALTER TABLE user_mods ADD CONSTRAINT uq_user_mods_modset_mod UNIQUE (modset_id, mod_id); "
                "END IF; "
                "END $$;"
            )
        )


def _migrate_mod_versions(engine: Engine, inspector) -> None:
    if "mod_versions" not in inspector.get_table_names():
        return

    mod_version_columns = {column["name"] for column in inspector.get_columns("mod_versions")}
    if "last_modified_at" not in mod_version_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE mod_versions ADD COLUMN last_modified_at TIMESTAMP WITH TIME ZONE"))


def _migrate_users(engine: Engine, inspector) -> None:
    if "users" not in inspector.get_table_names():
        return
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "active_modset_id" not in user_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN active_modset_id INTEGER"))

    with engine.begin() as connection:
        default_modset_id = connection.execute(text("SELECT id FROM modsets ORDER BY id LIMIT 1")).scalar()
        if default_modset_id is not None:
            connection.execute(
                text("UPDATE users SET active_modset_id = :modset_id WHERE active_modset_id IS NULL"),
                {"modset_id": int(default_modset_id)},
            )

    if engine.dialect.name == "postgresql":
        inspector = inspect(engine)
        fk_names = {fk["name"] for fk in inspector.get_foreign_keys("users") if fk.get("name")}
        if "users_active_modset_id_fkey" not in fk_names:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "ALTER TABLE users "
                        "ADD CONSTRAINT users_active_modset_id_fkey "
                        "FOREIGN KEY (active_modset_id) REFERENCES modsets(id) ON DELETE SET NULL"
                    )
                )


def _ensure_default_modset(engine: Engine) -> None:
    with engine.begin() as connection:
        count = connection.execute(text("SELECT COUNT(*) FROM modsets")).scalar() or 0
        if int(count) > 0:
            return
        connection.execute(text("INSERT INTO modsets (name) VALUES ('Default')"))
