"""Sequence API preserves exports and numeric compatibility without UI sort values."""
from fastapi.testclient import TestClient

from app import main as app_main
from app.models import Mod
from tests import test_base_modsets as base_tests
from tests.support import ApiTestCase


class ExportSequenceTests(ApiTestCase):
    create_set = base_tests.BaseModsetsTestCase.create_set
    seed = base_tests.BaseModsetsTestCase.seed
    mods = base_tests.BaseModsetsTestCase.mods

    def exported(self, client, set_id):
        response = client.get(f'/modsets/{set_id}/export')
        self.assertEqual(response.status_code, 200, response.text)
        return [row['modId'] for row in response.json()]

    def save(self, client, set_id, ids):
        return client.put(f'/modsets/{set_id}/export-order', json={'mod_ids':ids})

    def test_server_positions_preserve_legacy_ties_and_sequence_reorders_exactly(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            target = self.create_set(client, 'Legacy order')
            self.seed(target, 'MOD002', '1.0', 500)
            self.seed(target, 'MOD010', '1.0', 500)
            self.seed(target, 'INACTIVE', None, 0)
            with self.SessionLocal() as db:
                db.get(Mod, 'MOD002').name = 'Mod 2'
                db.get(Mod, 'MOD010').name = 'Mod 10'
                db.commit()
            self.assertEqual(self.exported(client, target), ['MOD010','MOD002'])
            reads = self.mods(client, target)
            self.assertEqual(reads['MOD010']['export_position'], 1)
            self.assertEqual(reads['MOD002']['export_position'], 2)
            self.assertIsNone(reads['INACTIVE']['export_position'])
            response = self.save(client, target, ['MOD002','MOD010'])
            self.assertEqual(response.status_code, 204, response.text)
            self.assertEqual(self.exported(client, target), ['MOD002','MOD010'])
            # Numeric callers still function with the same response fields.
            response = client.patch(f'/mods/MOD010?modset_id={target}', json={'load_order':0})
            self.assertEqual(response.status_code, 200, response.text)
            response = client.patch(f'/modsets/{target}/load-order', json={'entries':[{'mod_id':'MOD010','load_order':999}]})
            self.assertEqual(response.status_code, 204, response.text)

    def test_incomplete_duplicate_unknown_and_uninstalled_ids_do_not_change_export(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            target = self.create_set(client, 'Mission')
            self.seed(target, 'FIRST01')
            self.seed(target, 'SECOND01')
            self.seed(target, 'INACTIVE', None)
            before = self.exported(client, target)
            for ids, expected in [(['FIRST01'],409), (['FIRST01','FIRST01'],400), (['FIRST01','UNKNOWN'],409), (['FIRST01','SECOND01','INACTIVE'],409), ([],422)]:
                result = self.save(client, target, ids)
                self.assertEqual(result.status_code, expected, result.text)
                self.assertEqual(self.exported(client, target), before)

    def test_independent_derivative_can_move_base_entries_without_changing_the_base(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            self.seed(base, 'CORE_A', order=100)
            self.seed(base, 'CORE_B', order=200)
            child = self.create_set(client, 'Independent', base)
            self.seed(child, 'LOCAL01')
            response = self.save(client, child, ['CORE_B','LOCAL01','CORE_A'])
            self.assertEqual(response.status_code, 204, response.text)
            self.assertEqual(self.exported(client, child), ['CORE_B','LOCAL01','CORE_A'])
            self.assertEqual(self.exported(client, base), ['CORE_A','CORE_B'])

    def test_following_derivative_places_local_mods_and_rejects_base_reordering(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            self.seed(base, 'CORE_A', order=100)
            self.seed(base, 'CORE_B', order=200)
            child = self.create_set(client, 'Following', base, mode='base')
            self.seed(child, 'LOCAL01')
            self.assertEqual(self.save(client, child, ['CORE_A','LOCAL01','CORE_B']).status_code, 204)
            self.assertEqual(self.save(client, child, ['CORE_B','LOCAL01','CORE_A']).status_code, 409)
            self.assertEqual(self.exported(client, child), ['CORE_A','LOCAL01','CORE_B'])
            self.assertEqual(client.patch(f'/mods/CORE_B?modset_id={base}', json={'load_order':0}).status_code, 200)
            self.assertEqual(self.exported(client, child), ['LOCAL01','CORE_B','CORE_A'])

    def test_sequence_api_requires_write_access(self):
        with TestClient(app_main.app) as admin, TestClient(app_main.app) as user:
            self.login_admin(admin)
            alice = self._create_user('alice', 'alice-password-123')
            self.assertEqual(user.post('/auth/login',json={'username':'alice','password':'alice-password-123'}).status_code,200)
            target = self.create_set(admin, 'Shared read only')
            self.seed(target, 'FIRST01')
            group = admin.post('/admin/groups',json={'name':'Readers','user_ids':[alice.id]}).json()['id']
            admin.put(f'/modsets/{target}/group-permissions',json={'entries':[{'group_id':group,'permission':'read'}]})
            self.assertEqual(self.save(user, target, ['FIRST01']).status_code,403)
