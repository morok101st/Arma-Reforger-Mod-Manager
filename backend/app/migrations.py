from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def migrate_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if "user_mods" not in inspector.get_table_names():
        return

    user_mod_columns = {column["name"] for column in inspector.get_columns("user_mods")}
    if "tracking_reason" in user_mod_columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE user_mods ADD COLUMN tracking_reason VARCHAR(24) NOT NULL DEFAULT 'manual'")
        )
