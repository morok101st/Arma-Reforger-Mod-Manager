-- Frozen from release 0.2.4 (87a8ffb), not generated from current models.
CREATE TABLE mods (
	id VARCHAR(80) NOT NULL,
	name VARCHAR(255),
	summary TEXT,
	description TEXT,
	latest_version VARCHAR(80),
	game_version VARCHAR(80),
	size VARCHAR(80),
	dependencies JSON NOT NULL,
	source_url VARCHAR(512),
	last_checked DATETIME,
	created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (id)
)
-- statement
CREATE TABLE users (
	id INTEGER NOT NULL,
	username VARCHAR(80) NOT NULL,
	password_hash VARCHAR(255),
	oidc_issuer VARCHAR(255),
	oidc_subject VARCHAR(255),
	email VARCHAR(255),
	role VARCHAR(24) DEFAULT 'user' NOT NULL,
	session_version INTEGER DEFAULT '0' NOT NULL,
	theme_preference VARCHAR(16) DEFAULT 'dark' NOT NULL,
	is_active BOOLEAN DEFAULT 'true' NOT NULL,
	active_modset_id INTEGER,
	last_login_at DATETIME,
	created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(active_modset_id) REFERENCES modsets (id) ON DELETE SET NULL
)
-- statement
CREATE UNIQUE INDEX ix_users_username ON users (username)
-- statement
CREATE INDEX ix_users_oidc_issuer ON users (oidc_issuer)
-- statement
CREATE INDEX ix_users_role ON users (role)
-- statement
CREATE INDEX ix_users_oidc_subject ON users (oidc_subject)
-- statement
CREATE INDEX ix_users_active_modset_id ON users (active_modset_id)
-- statement
CREATE TABLE modsets (
	id INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	owner_user_id INTEGER,
	shared BOOLEAN DEFAULT 'false' NOT NULL,
	created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE SET NULL
)
-- statement
CREATE UNIQUE INDEX ix_modsets_name ON modsets (name)
-- statement
CREATE INDEX ix_modsets_owner_user_id ON modsets (owner_user_id)
-- statement
CREATE TABLE discord_webhooks (
	id INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	webhook_url VARCHAR(1024) NOT NULL,
	is_active BOOLEAN DEFAULT 'true' NOT NULL,
	created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (id)
)
-- statement
CREATE INDEX ix_discord_webhooks_name ON discord_webhooks (name)
-- statement
CREATE TABLE scheduler_runs (
	id INTEGER NOT NULL,
	started_at DATETIME NOT NULL,
	completed_at DATETIME,
	refreshed INTEGER,
	failed JSON NOT NULL,
	error TEXT,
	PRIMARY KEY (id)
)
-- statement
CREATE INDEX ix_scheduler_runs_completed_at ON scheduler_runs (completed_at)
-- statement
CREATE INDEX ix_scheduler_runs_started_at ON scheduler_runs (started_at)
-- statement
CREATE TABLE discord_webhook_modsets (
	webhook_id INTEGER NOT NULL,
	modset_id INTEGER NOT NULL,
	PRIMARY KEY (webhook_id, modset_id),
	FOREIGN KEY(webhook_id) REFERENCES discord_webhooks (id) ON DELETE CASCADE,
	FOREIGN KEY(modset_id) REFERENCES modsets (id) ON DELETE CASCADE
)
-- statement
CREATE TABLE mod_versions (
	id INTEGER NOT NULL,
	mod_id VARCHAR(80) NOT NULL,
	version VARCHAR(80) NOT NULL,
	changelog TEXT,
	published_at DATETIME,
	last_modified_at DATETIME,
	created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(mod_id) REFERENCES mods (id) ON DELETE CASCADE
)
-- statement
CREATE INDEX ix_mod_versions_version ON mod_versions (version)
-- statement
CREATE INDEX ix_mod_versions_mod_id ON mod_versions (mod_id)
-- statement
CREATE TABLE user_mods (
	id INTEGER NOT NULL,
	modset_id INTEGER NOT NULL,
	mod_id VARCHAR(80) NOT NULL,
	current_version VARCHAR(80),
	pinned BOOLEAN NOT NULL,
	is_core BOOLEAN DEFAULT 'false' NOT NULL,
	dependency_origin BOOLEAN DEFAULT 'false' NOT NULL,
	tracking_reason VARCHAR(24) DEFAULT 'manual' NOT NULL,
	load_order INTEGER DEFAULT '500' NOT NULL,
	created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_user_mods_modset_mod UNIQUE (modset_id, mod_id),
	FOREIGN KEY(modset_id) REFERENCES modsets (id) ON DELETE CASCADE,
	FOREIGN KEY(mod_id) REFERENCES mods (id) ON DELETE CASCADE
)
-- statement
CREATE INDEX ix_user_mods_modset_id ON user_mods (modset_id)
-- statement
CREATE INDEX ix_user_mods_mod_id ON user_mods (mod_id)
-- statement
CREATE TABLE discord_webhook_deliveries (
	id INTEGER NOT NULL,
	webhook_id INTEGER NOT NULL,
	modset_id INTEGER NOT NULL,
	mod_id VARCHAR(80) NOT NULL,
	latest_version VARCHAR(80) NOT NULL,
	sent_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_discord_webhook_delivery UNIQUE (webhook_id, modset_id, mod_id, latest_version),
	FOREIGN KEY(webhook_id) REFERENCES discord_webhooks (id) ON DELETE CASCADE,
	FOREIGN KEY(modset_id) REFERENCES modsets (id) ON DELETE CASCADE,
	FOREIGN KEY(mod_id) REFERENCES mods (id) ON DELETE CASCADE
)
-- statement
CREATE INDEX ix_discord_webhook_deliveries_webhook_id ON discord_webhook_deliveries (webhook_id)
-- statement
CREATE INDEX ix_discord_webhook_deliveries_latest_version ON discord_webhook_deliveries (latest_version)
-- statement
CREATE INDEX ix_discord_webhook_deliveries_mod_id ON discord_webhook_deliveries (mod_id)
-- statement
CREATE INDEX ix_discord_webhook_deliveries_modset_id ON discord_webhook_deliveries (modset_id)
-- statement
CREATE TABLE audit_logs (
	id INTEGER NOT NULL,
	actor_user_id INTEGER,
	actor_username VARCHAR(80),
	action VARCHAR(80) NOT NULL,
	entity_type VARCHAR(80) NOT NULL,
	entity_id VARCHAR(120),
	detail JSON NOT NULL,
	ip_address VARCHAR(80),
	user_agent VARCHAR(255),
	created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(actor_user_id) REFERENCES users (id) ON DELETE SET NULL
)
-- statement
CREATE INDEX ix_audit_logs_action ON audit_logs (action)
-- statement
CREATE INDEX ix_audit_logs_entity_type ON audit_logs (entity_type)
-- statement
CREATE INDEX ix_audit_logs_actor_user_id ON audit_logs (actor_user_id)
-- statement
CREATE INDEX ix_audit_logs_entity_id ON audit_logs (entity_id)
