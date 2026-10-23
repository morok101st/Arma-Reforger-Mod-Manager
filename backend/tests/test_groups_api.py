from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import Group, GroupMembership, Mod, ModSet, ModSetGroupPermission, User, UserMod
from tests.support import ApiTestCase


class GroupsApiTestCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.reader = self._create_user("service", "service-account-password")
        self.outsider = self._create_user("outsider", "outsider-account-password")
        with self.SessionLocal() as db:
            owner = db.scalar(select(User).where(User.username == "admin"))
            modset = ModSet(name="Private operations", owner_user_id=owner.id, shared=False)
            group = Group(name="Integration", description="Read server configuration")
            db.add_all([modset, group, Mod(id="ABC", name="Example", latest_version="1.0")])
            db.flush()
            db.add_all([GroupMembership(group_id=group.id, user_id=self.reader.id),
                        ModSetGroupPermission(modset_id=modset.id, group_id=group.id, permission="read"),
                        UserMod(modset_id=modset.id, mod_id="ABC", current_version="1.0", load_order=12)])
            db.commit()
            self.modset_id, self.group_id = modset.id, group.id

    def login_reader(self, client):
        self.assertEqual(client.post("/auth/login", json={"username": "service", "password": "service-account-password"}).status_code, 200)

    def test_reader_can_read_and_export_but_cannot_mutate(self):
        with TestClient(app) as client:
            self.login_reader(client)
            modsets = client.get("/modsets").json()
            private = next(row for row in modsets if row["id"] == self.modset_id)
            self.assertFalse(private["shared"])
            self.assertFalse(private["can_edit"])
            self.assertFalse(private["can_delete"])
            self.assertFalse(private["can_manage_access"])
            self.assertEqual(client.get(f"/mods?modset_id={self.modset_id}").status_code, 200)
            self.assertEqual(client.get(f"/mods/ABC?modset_id={self.modset_id}").status_code, 200)
            self.assertEqual(client.get(f"/modsets/{self.modset_id}/export").json(), [{"modId": "ABC", "name": "Example", "version": "1.0"}])
            requests = [
                ("patch", f"/mods/ABC?modset_id={self.modset_id}", {"current_version": "2.0"}),
                ("delete", f"/mods/ABC?modset_id={self.modset_id}", None),
                ("post", f"/mods?modset_id={self.modset_id}", {"id": "XYZ"}),
                ("post", f"/mods/ABC/refresh?modset_id={self.modset_id}", None),
                ("post", f"/refresh?modset_id={self.modset_id}", None),
                ("patch", f"/modsets/{self.modset_id}", {"name": "Changed"}),
                ("delete", f"/modsets/{self.modset_id}", None),
                ("patch", f"/modsets/{self.modset_id}/load-order", {"entries": [{"mod_id": "ABC", "load_order": 1}]}),
                ("put", f"/modsets/{self.modset_id}/group-permissions", {"entries": []}),
            ]
            for method, path, body in requests:
                with self.subTest(method=method, path=path):
                    response = client.request(method, path, **({"json": body} if body is not None else {}))
                    self.assertEqual(response.status_code, 403, response.text)

    def test_write_grant_wins_but_cannot_manage_or_delete(self):
        with self.SessionLocal() as db:
            group = Group(name="Editors")
            db.add(group)
            db.flush()
            db.add_all([GroupMembership(group_id=group.id, user_id=self.reader.id),
                        ModSetGroupPermission(modset_id=self.modset_id, group_id=group.id, permission="write")])
            db.commit()
        with TestClient(app) as client:
            self.login_reader(client)
            self.assertEqual(client.patch(f"/modsets/{self.modset_id}", json={"name": "Renamed"}).status_code, 200)
            self.assertEqual(client.patch(f"/modsets/{self.modset_id}/load-order", json={"entries": [{"mod_id": "ABC", "load_order": 7}]}).status_code, 204)
            self.assertEqual(client.delete(f"/modsets/{self.modset_id}").status_code, 403)
            self.assertEqual(client.patch(f"/modsets/{self.modset_id}", json={"name": "Renamed", "shared": True}).status_code, 422)
            copy = client.post(f"/modsets/{self.modset_id}/duplicate")
            self.assertEqual(copy.status_code, 201)
            self.assertFalse(copy.json()["shared"])
            self.assertEqual(client.get(f'/modsets/{copy.json()["id"]}/group-permissions').json(), [])

    def test_membership_revocation_applies_to_existing_session_and_active_modset(self):
        with TestClient(app) as client:
            self.login_reader(client)
            self.assertEqual(client.post(f"/modsets/{self.modset_id}/activate").status_code, 200)
            with self.SessionLocal() as db:
                db.delete(db.get(GroupMembership, (self.group_id, self.reader.id)))
                db.commit()
            self.assertEqual(client.get(f"/modsets/{self.modset_id}/export").status_code, 404)
            self.assertNotEqual(client.get("/auth/me").json()["active_modset_id"], self.modset_id)
            self.assertNotIn(self.modset_id, [row["id"] for row in client.get("/modsets").json()])

    def test_group_crud_and_sharing_are_admin_and_owner_controlled(self):
        with TestClient(app) as client:
            self.login_admin(client)
            created = client.post("/admin/groups", json={"name": "Server Tools", "user_ids": [self.reader.id]})
            self.assertEqual(created.status_code, 201, created.text)
            group_id = created.json()["id"]
            self.assertEqual(client.post("/admin/groups", json={"name": "server tools"}).status_code, 409)
            self.assertEqual(client.put(f"/admin/groups/{group_id}", json={"name": "Server Tools", "user_ids": [999999]}).status_code, 400)
            self.assertEqual(client.put(f"/modsets/{self.modset_id}/group-permissions", json={"entries": [{"group_id": group_id, "permission": "read"}]}).status_code, 200)
            self.assertEqual(client.put(f"/modsets/{self.modset_id}/group-permissions", json={"entries": [{"group_id": group_id, "permission": "admin"}]}).status_code, 422)
            self.assertEqual(client.delete(f"/admin/groups/{group_id}").status_code, 204)
            self.assertEqual(client.get(f"/modsets/{self.modset_id}/group-permissions").json(), [])
            self.login_reader(client)
            self.assertEqual(client.get("/admin/groups").status_code, 403)
            self.assertEqual(client.post("/admin/groups", json={"name": "No"}).status_code, 403)

    def test_outsider_cannot_access_private_modset(self):
        with TestClient(app) as client:
            client.post("/auth/login", json={"username": "outsider", "password": "outsider-account-password"})
            self.assertEqual(client.get(f"/mods?modset_id={self.modset_id}").status_code, 404)
            self.assertEqual(client.get(f"/modsets/{self.modset_id}/export").status_code, 404)

    def test_no_access_does_not_create_or_publish_fallback_modset(self):
        with TestClient(app) as client:
            self.login_reader(client)
            with self.SessionLocal() as db:
                for modset in db.scalars(select(ModSet)):
                    modset.shared = True
                db.delete(db.get(GroupMembership, (self.group_id, self.reader.id)))
                db.commit()
                before = [(row.id, row.shared) for row in db.scalars(select(ModSet))]
            self.assertIsNone(client.get("/auth/me").json()["active_modset_id"])
            self.assertEqual(client.get("/mods").status_code, 404)
            with self.SessionLocal() as db:
                self.assertEqual([(row.id, row.shared) for row in db.scalars(select(ModSet))], before)

    def test_manual_refresh_is_scoped_to_authorized_modset(self):
        with self.SessionLocal() as db:
            db.get(ModSetGroupPermission, (self.modset_id, self.group_id)).permission = "write"
            db.commit()
        with TestClient(app) as client, patch("app.services.refresh_mod", new_callable=AsyncMock) as refresh:
            self.login_reader(client)
            self.assertEqual(client.post(f"/refresh?modset_id={self.modset_id}").status_code, 200)
            self.assertEqual(refresh.await_count, 1)
            self.assertEqual(refresh.call_args.args[2], self.modset_id)

    def test_user_group_assignment_is_validated_and_preserves_other_members(self):
        with TestClient(app) as client:
            self.login_admin(client)
            response = client.put(f"/admin/users/{self.outsider.id}/groups", json={"group_ids": [self.group_id]})
            self.assertEqual(response.status_code, 204)
            self.assertEqual(client.put(f"/admin/users/{self.outsider.id}/groups", json={"group_ids": [999999]}).status_code, 400)
            members = next(group for group in client.get('/admin/groups').json() if group['id'] == self.group_id)['user_ids']
            self.assertEqual(set(members), {self.reader.id, self.outsider.id})
            self.assertEqual(client.put(f"/admin/users/{self.reader.id}/groups", json={"group_ids": []}).status_code, 204)
            members = next(group for group in client.get('/admin/groups').json() if group['id'] == self.group_id)['user_ids']
            self.assertEqual(members, [self.outsider.id])
            self.login_reader(client)
            self.assertEqual(client.put(f"/admin/users/{self.reader.id}/groups", json={"group_ids": [self.group_id]}).status_code, 403)

    def test_disabling_account_revokes_group_access_and_deleting_user_removes_membership(self):
        with TestClient(app) as client:
            self.login_reader(client)
            with self.SessionLocal() as db:
                db.get(User, self.reader.id).is_active = False
                db.commit()
            self.assertEqual(client.get(f"/modsets/{self.modset_id}/export").status_code, 401)
            self.login_admin(client)
            self.assertEqual(client.delete(f"/users/{self.reader.id}").status_code, 204)
            members = next(group for group in client.get('/admin/groups').json() if group['id'] == self.group_id)['user_ids']
            self.assertEqual(members, [])

    def test_legacy_shared_flag_never_grants_access_or_upgrades_group_rights(self):
        with self.SessionLocal() as db:
            db.get(ModSet, self.modset_id).shared = True
            db.add(ModSet(name="Keep last modset", owner_user_id=self.outsider.id))
            db.commit()
        with TestClient(app) as client:
            self.login_reader(client)
            row = next(row for row in client.get('/modsets').json() if row['id'] == self.modset_id)
            self.assertFalse(row['shared'])
            self.assertFalse(row['can_edit'])
            self.assertFalse(row['can_delete'])
            self.assertFalse(row['can_manage_access'])
            self.assertEqual(client.patch(f"/modsets/{self.modset_id}", json={"name": "Shared renamed"}).status_code, 403)
            self.assertEqual(client.delete(f"/modsets/{self.modset_id}").status_code, 403)
            with self.SessionLocal() as db:
                db.delete(db.get(GroupMembership, (self.group_id, self.reader.id)))
                db.commit()
            self.assertEqual(client.get(f"/modsets/{self.modset_id}/export").status_code, 404)
            self.assertEqual(client.get('/modsets').json(), [])
            self.assertIsNone(client.get('/auth/me').json()['active_modset_id'])
            self.login_admin(client)
            self.assertEqual(client.post('/modsets', json={'name': 'Global sharing rejected', 'shared': True}).status_code, 422)
            self.assertEqual(client.patch(f'/modsets/{self.modset_id}', json={'name': 'Global sharing rejected', 'shared': True}).status_code, 422)

    def test_admin_has_emergency_access_to_other_users_modsets(self):
        with self.SessionLocal() as db:
            modset = ModSet(name='User emergency modset', owner_user_id=self.outsider.id)
            db.add(modset)
            db.flush()
            db.add(UserMod(modset_id=modset.id, mod_id='ABC', current_version='1.0'))
            db.commit()
            modset_id = modset.id
        with TestClient(app) as client:
            self.login_admin(client)
            row = next(row for row in client.get('/modsets').json() if row['id'] == modset_id)
            self.assertFalse(row['is_owner'])
            self.assertTrue(row['can_edit'])
            self.assertTrue(row['can_delete'])
            self.assertTrue(row['can_manage_access'])
            self.assertEqual(client.post(f'/modsets/{modset_id}/activate').status_code, 200)
            self.assertEqual(client.get(f'/mods?modset_id={modset_id}').status_code, 200)
            self.assertEqual(client.get(f'/modsets/{modset_id}/export').json()[0]['modId'], 'ABC')
            self.assertEqual(client.get(f'/modsets/{modset_id}/group-permissions').json(), [])
            response = client.patch(f'/modsets/{modset_id}', json={
                'name': 'Recovered modset', 'group_permissions': [{'group_id': self.group_id, 'permission': 'read'}],
            })
            self.assertEqual(response.status_code, 200, response.text)
            self.assertTrue(response.json()['has_group_access'])
            with self.SessionLocal() as db:
                self.assertEqual(db.get(ModSet, modset_id).owner_user_id, self.outsider.id)
            self.assertEqual(client.patch(f'/modsets/{modset_id}/load-order', json={'entries': [{'mod_id': 'ABC', 'load_order': 5}]}).status_code, 204)
            self.assertEqual(client.delete(f'/modsets/{modset_id}').status_code, 200)

    def test_combined_edit_is_atomic_and_cannot_bypass_group_management_rights(self):
        with TestClient(app) as client:
            self.login_admin(client)
            original = client.get(f'/modsets/{self.modset_id}/group-permissions').json()
            for entries, expected in [
                ([{'group_id': 999999, 'permission': 'write'}], 400),
                ([{'group_id': self.group_id, 'permission': 'read'}] * 2, 400),
            ]:
                response = client.patch(f'/modsets/{self.modset_id}', json={'name': 'Must not be saved', 'group_permissions': entries})
                self.assertEqual(response.status_code, expected, response.text)
                self.assertEqual(client.get(f'/modsets/{self.modset_id}/group-permissions').json(), original)
                with self.SessionLocal() as db:
                    self.assertEqual(db.get(ModSet, self.modset_id).name, 'Private operations')
            with self.SessionLocal() as db:
                db.get(ModSetGroupPermission, (self.modset_id, self.group_id)).permission = 'write'
                db.commit()
            self.login_reader(client)
            self.assertEqual(client.patch(f'/modsets/{self.modset_id}', json={'name': 'Forbidden', 'group_permissions': []}).status_code, 403)
            self.assertEqual(client.patch(f'/modsets/{self.modset_id}', json={'name': 'Writer rename'}).status_code, 200)
