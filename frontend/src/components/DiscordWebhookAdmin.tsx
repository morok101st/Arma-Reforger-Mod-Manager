import React from "react";
import { CheckSquare2, MinusSquare, Pencil, Plus, Send, Square, Trash2, TriangleAlert, Webhook } from "lucide-react";

import type { DiscordWebhook, Modset } from "../types";
import { Dialog } from "./common";

export function DiscordWebhookAdmin({
  webhooks,
  modsets,
  loading,
  createDiscordWebhook,
  updateDiscordWebhook,
  deleteDiscordWebhook,
  testDiscordWebhook,
}: {
  webhooks: DiscordWebhook[];
  modsets: Modset[];
  loading: boolean;
  createDiscordWebhook: (payload: { name: string; webhook_url: string; is_active: boolean; modset_ids?: number[] }) => Promise<unknown>;
  updateDiscordWebhook: (webhookId: number, payload: { name?: string; webhook_url?: string; is_active?: boolean; modset_ids?: number[] }) => Promise<unknown>;
  deleteDiscordWebhook: (webhookId: number) => Promise<void>;
  testDiscordWebhook: (webhookId: number) => Promise<void>;
}) {
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createWebhookUrl, setCreateWebhookUrl] = React.useState("");
  const [createIsActive, setCreateIsActive] = React.useState(true);
  const [createModsetIds, setCreateModsetIds] = React.useState<number[]>([]);

  const [editWebhookId, setEditWebhookId] = React.useState<number | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editWebhookUrl, setEditWebhookUrl] = React.useState("");
  const [editIsActive, setEditIsActive] = React.useState(true);
  const [editModsetIds, setEditModsetIds] = React.useState<number[]>([]);
  const [deleteWebhookId, setDeleteWebhookId] = React.useState<number | null>(null);
  const [testSuccessName, setTestSuccessName] = React.useState<string | null>(null);

  const editWebhook = webhooks.find((webhook) => webhook.id === editWebhookId) ?? null;
  const deleteWebhook = webhooks.find((webhook) => webhook.id === deleteWebhookId) ?? null;

  React.useEffect(() => {
    if (!editWebhook) {
      setEditName("");
      setEditWebhookUrl("");
      setEditIsActive(true);
      setEditModsetIds([]);
      return;
    }
    setEditName(editWebhook.name);
    setEditWebhookUrl("");
    setEditIsActive(editWebhook.is_active);
    setEditModsetIds(editWebhook.modset_ids);
  }, [editWebhook]);

  React.useEffect(() => {
    if (showCreateDialog) {
      setCreateModsetIds(modsets.map((modset) => modset.id));
    }
  }, [modsets, showCreateDialog]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = createName.trim();
    const webhookUrl = createWebhookUrl.trim();
    if (!name || !webhookUrl) return;
    await createDiscordWebhook({ name, webhook_url: webhookUrl, is_active: createIsActive, modset_ids: createModsetIds });
    setTestSuccessName(null);
    setShowCreateDialog(false);
    setCreateName("");
    setCreateWebhookUrl("");
    setCreateIsActive(true);
    setCreateModsetIds(modsets.map((modset) => modset.id));
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editWebhook) return;
    const name = editName.trim();
    if (!name) return;
    await updateDiscordWebhook(editWebhook.id, {
      name,
      webhook_url: editWebhookUrl.trim() ? editWebhookUrl.trim() : undefined,
      is_active: editIsActive,
      modset_ids: editModsetIds,
    });
    setTestSuccessName(null);
    setEditWebhookId(null);
  }

  function toggleModsetSelection(setter: React.Dispatch<React.SetStateAction<number[]>>, selectedIds: number[], modsetId: number) {
    setter(
      selectedIds.includes(modsetId)
        ? selectedIds.filter((id) => id !== modsetId)
        : [...selectedIds, modsetId],
    );
  }

  function renderModsetSelection(selectedIds: number[], setSelectedIds: React.Dispatch<React.SetStateAction<number[]>>) {
    const allSelected = modsets.length > 0 && selectedIds.length === modsets.length;
    const noneSelected = selectedIds.length === 0;
    return (
      <div className="webhook-modset-selection">
        <div className="webhook-modset-selection-header">
          <strong>Modset notifications</strong>
          <div className="webhook-modset-selection-actions">
            <button
              className="secondary-button compact"
              disabled={loading || modsets.length === 0}
              onClick={() => setSelectedIds(modsets.map((modset) => modset.id))}
              type="button"
            >
              <CheckSquare2 size={16} />
              All
            </button>
            <button
              className="secondary-button compact"
              disabled={loading || modsets.length === 0}
              onClick={() => setSelectedIds([])}
              type="button"
            >
              <MinusSquare size={16} />
              None
            </button>
          </div>
        </div>
        <p className="muted">
          Choose which modsets should trigger Discord alerts. {allSelected ? "All modsets are currently enabled." : noneSelected ? "No modsets are selected." : `${selectedIds.length} modsets selected.`}
        </p>
        <div className="webhook-modset-checkboxes">
          {modsets.map((modset) => {
            const checked = selectedIds.includes(modset.id);
            return (
              <label className="checkbox-row webhook-modset-row" key={modset.id}>
                <input
                  checked={checked}
                  onChange={() => toggleModsetSelection(setSelectedIds, selectedIds, modset.id)}
                  type="checkbox"
                />
                <span className="webhook-modset-label">
                  {checked ? <CheckSquare2 size={16} /> : <Square size={16} />}
                  <strong>{modset.name}</strong>
                  {modset.shared && <span className="webhook-modset-shared">Shared</span>}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="content-section">
        <div className="section-title-row">
          <h3>Discord webhooks</h3>
          <button
            className="primary-button compact"
            disabled={loading}
            onClick={() => {
              setShowCreateDialog(true);
              setTestSuccessName(null);
            }}
            type="button"
          >
            <Plus size={18} />
            Add webhook
          </button>
        </div>
        <p className="muted">
          Configure one or more Discord webhook targets for update alerts. Webhooks stay server-side and do not require code changes.
        </p>

        <div className="webhook-list">
          {webhooks.map((webhook) => (
            <article className="webhook-row" key={webhook.id}>
              <div className="webhook-row-main">
                <div className="webhook-row-header">
                  <strong>{webhook.name}</strong>
                  <span className={`webhook-status ${webhook.is_active ? "active" : "inactive"}`}>{webhook.is_active ? "Active" : "Disabled"}</span>
                </div>
                <small>{webhook.masked_webhook_url}</small>
              </div>
              <div className="row-actions webhook-row-actions">
                <button
                  className="secondary-button compact"
                  disabled={loading}
                  onClick={() => {
                    testDiscordWebhook(webhook.id)
                      .then(() => setTestSuccessName(webhook.name))
                      .catch(() => null);
                  }}
                  type="button"
                >
                  <Send size={16} />
                  Test
                </button>
                <button
                  className="secondary-button compact"
                  disabled={loading}
                  onClick={() => {
                    setTestSuccessName(null);
                    setEditWebhookId(webhook.id);
                  }}
                  type="button"
                >
                  <Pencil size={16} />
                  Edit
                </button>
                <button
                  className="secondary-button compact danger-button"
                  disabled={loading}
                  onClick={() => {
                    setTestSuccessName(null);
                    setDeleteWebhookId(webhook.id);
                  }}
                  type="button"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </article>
          ))}
          {webhooks.length === 0 && <p className="muted">No Discord webhooks configured yet.</p>}
        </div>

        {testSuccessName && (
          <div className="status-band save-band">
            <Webhook className="save-band-icon" size={20} />
            <strong>Test sent</strong>
            <span>Webhook test message delivered to {testSuccessName}.</span>
          </div>
        )}
      </section>

      {showCreateDialog && (
        <Dialog title="Add Discord webhook" onClose={() => setShowCreateDialog(false)}>
          <form className="dialog-form" onSubmit={handleCreate}>
            <label>
              Name
              <input autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Discord alerts" />
            </label>
            <label>
              Webhook URL
              <input
                value={createWebhookUrl}
                onChange={(event) => setCreateWebhookUrl(event.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
              />
            </label>
            <label className="checkbox-row">
              <input checked={createIsActive} onChange={(event) => setCreateIsActive(event.target.checked)} type="checkbox" />
              Active
            </label>
            {renderModsetSelection(createModsetIds, setCreateModsetIds)}
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={() => setShowCreateDialog(false)} type="button">
                Cancel
              </button>
              <button className="primary-button compact" disabled={loading || !createName.trim() || !createWebhookUrl.trim()}>
                Add
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {editWebhook && (
        <Dialog title={`Edit webhook ${editWebhook.name}`} onClose={() => setEditWebhookId(null)}>
          <form className="dialog-form" onSubmit={handleEdit}>
            <label>
              Name
              <input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} />
            </label>
            <label>
              Webhook URL
              <input
                value={editWebhookUrl}
                onChange={(event) => setEditWebhookUrl(event.target.value)}
                placeholder="leave empty to keep current"
              />
            </label>
            <label className="checkbox-row">
              <input checked={editIsActive} onChange={(event) => setEditIsActive(event.target.checked)} type="checkbox" />
              Active
            </label>
            {renderModsetSelection(editModsetIds, setEditModsetIds)}
            <p className="muted">
              Current URL: <strong>{editWebhook.masked_webhook_url}</strong>
            </p>
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={() => setEditWebhookId(null)} type="button">
                Cancel
              </button>
              <button className="primary-button compact" disabled={loading || !editName.trim()}>
                Save
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {deleteWebhook && (
        <Dialog title={`Delete webhook ${deleteWebhook.name}`} onClose={() => setDeleteWebhookId(null)}>
          <div className="dialog-form">
            <div className="danger-callout">
              <TriangleAlert className="status-icon warn" size={20} />
              <div>
                <strong>This webhook will stop receiving update alerts.</strong>
                <span>Discord notifications for ARMM will no longer be sent to this target.</span>
              </div>
            </div>
            <p className="muted">
              Delete <strong>{deleteWebhook.name}</strong> permanently?
            </p>
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={() => setDeleteWebhookId(null)} type="button">
                Cancel
              </button>
              <button
                className="secondary-button compact danger-button"
                disabled={loading}
                onClick={() => {
                  deleteDiscordWebhook(deleteWebhook.id)
                    .then(() => setDeleteWebhookId(null))
                    .catch(() => null);
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
