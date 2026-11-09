"""Relative local insertion positions follow a changing authoritative base order."""
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import main as app_main
from app.models import UserMod
from tests.support import ApiTestCase
from tests import test_base_modsets as base_tests


class BaseExportOrderTests(ApiTestCase):
    create_set = base_tests.BaseModsetsTestCase.create_set
    seed = base_tests.BaseModsetsTestCase.seed
    mods = base_tests.BaseModsetsTestCase.mods

    def setup_sets(self, client):
        self.login_admin(client)
        base = self.create_set(client, 'Core')
        for mod_id, order in [('CORE_A', 100), ('CORE_B', 200), ('CORE_C', 300)]:
            self.seed(base, mod_id, '1.0', order)
        # Omitted mode means the new default, following the base.
        response = client.post('/modsets', json={'name': 'Mission', 'base_modset_id': base})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()['export_order_mode'], 'base')
        child = response.json()['id']
        self.seed(child, 'LOCAL_X', '2.0', 25)
        self.seed(child, 'LOCAL_Y', '2.0', 50)
        return base, child

    def move(self, client, child, ids):
        return client.patch(f'/modsets/{child}/load-order', json={'entries': [
            {'mod_id': mod_id, 'load_order': 500 + index * 10} for index, mod_id in enumerate(ids)]})

    def exported(self, client, child):
        response = client.get(f'/modsets/{child}/export')
        self.assertEqual(response.status_code, 200, response.text)
        return [entry['modId'] for entry in response.json()]

    def test_anchors_follow_base_reorder_addition_and_deleted_successors(self):
        with TestClient(app_main.app) as client:
            base, child = self.setup_sets(client)
            self.assertEqual(self.exported(client, child), ['CORE_A','CORE_B','CORE_C','LOCAL_X','LOCAL_Y'])
            result = self.move(client, child, ['CORE_A','LOCAL_X','LOCAL_Y','CORE_B','CORE_C'])
            self.assertEqual(result.status_code, 204, result.text)
            # Move B (with its local insertions) ahead of A.
            result = client.patch(f'/mods/CORE_B?modset_id={base}', json={'load_order': 10})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(self.exported(client, child), ['LOCAL_X','LOCAL_Y','CORE_B','CORE_A','CORE_C'])
            self.seed(base, 'CORE_NEW', '1.0', 5)
            self.assertEqual(self.exported(client, child), ['CORE_NEW','LOCAL_X','LOCAL_Y','CORE_B','CORE_A','CORE_C'])
            self.assertEqual(client.delete(f'/mods/CORE_B?modset_id={base}').status_code, 204)
            # Original successor C wins, even though A currently precedes it.
            self.assertEqual(self.exported(client, child), ['CORE_NEW','CORE_A','LOCAL_X','LOCAL_Y','CORE_C'])
            self.assertEqual(client.delete(f'/mods/CORE_C?modset_id={base}').status_code, 204)
            self.assertEqual(self.exported(client, child), ['CORE_NEW','CORE_A','LOCAL_X','LOCAL_Y'])

    def test_base_order_cannot_be_overridden_and_partial_stale_edits_are_rejected(self):
        with TestClient(app_main.app) as client:
            base, child = self.setup_sets(client)
            before = self.exported(client, child)
            for ids in [['CORE_B','CORE_A','CORE_C','LOCAL_X','LOCAL_Y'], ['LOCAL_X']]:
                self.assertEqual(self.move(client, child, ids).status_code, 409)
            self.assertEqual(client.patch(f'/mods/CORE_A?modset_id={child}', json={'load_order': 12}).status_code, 409)
            self.assertEqual(client.patch(f'/mods/LOCAL_X?modset_id={child}', json={'load_order': 12}).status_code, 409)
            self.assertEqual(self.exported(client, child), before)
            self.seed(base, 'CORE_NEW', '1.0', 150)
            self.assertEqual(self.move(client, child, before).status_code, 409)

    def test_preview_confirm_switch_and_detach_preserve_effective_order(self):
        with TestClient(app_main.app) as client:
            base, child = self.setup_sets(client)
            self.assertEqual(self.move(client, child, ['LOCAL_X','CORE_A','LOCAL_Y','CORE_B','CORE_C']).status_code, 204)
            before = self.exported(client, child)
            body = {'name': 'Mission', 'export_order_mode':'independent'}
            self.assertEqual(client.patch(f'/modsets/{child}', json=body).status_code, 409)
            preview = client.get(f'/modsets/{child}/order-preview?mode=independent').json()
            self.assertEqual([row['modId'] for row in preview], before)
            body['confirm_order_change'] = True
            self.assertEqual(client.patch(f'/modsets/{child}', json=body).status_code, 200)
            self.assertEqual(self.exported(client, child), before)
            client.patch(f'/mods/CORE_C?modset_id={base}', json={'load_order': 5})
            self.assertEqual(self.exported(client, child), before)
            preview = client.get(f'/modsets/{child}/order-preview?mode=base').json()
            projected = [row['modId'] for row in preview]
            self.assertEqual(projected, ['CORE_C','LOCAL_X','CORE_A','LOCAL_Y','CORE_B'])
            body['export_order_mode'] = 'base'
            self.assertEqual(client.patch(f'/modsets/{child}', json=body).status_code, 200)
            self.assertEqual(self.exported(client, child), projected)
            copied = client.post(f'/modsets/{child}/duplicate').json()['id']
            self.assertEqual(self.exported(client, copied), projected)
            self.assertEqual(client.patch(f'/modsets/{child}', json={'name':'Detached','base_modset_id':None}).status_code, 200)
            self.assertEqual(self.exported(client, child), projected)

    def test_uninstalled_mods_do_not_break_insertion_or_export(self):
        with TestClient(app_main.app) as client:
            base, child = self.setup_sets(client)
            self.assertEqual(self.move(client, child, ['CORE_A','LOCAL_X','CORE_B','CORE_C','LOCAL_Y']).status_code, 204)
            client.patch(f'/mods/CORE_B?modset_id={base}', json={'current_version':None})
            self.assertEqual(self.exported(client, child), ['CORE_A','LOCAL_X','CORE_C','LOCAL_Y'])
            displayed = self.mods(client, child)
            self.assertEqual([row['id'] for row in sorted(displayed.values(), key=lambda row:row['load_order']) if row['current_version']], self.exported(client, child))

    def test_deleted_and_readded_local_mod_starts_at_end(self):
        with TestClient(app_main.app) as client:
            base, child = self.setup_sets(client)
            self.assertEqual(self.move(client, child, ['LOCAL_X','CORE_A','CORE_B','CORE_C','LOCAL_Y']).status_code, 204)
            self.assertEqual(client.delete(f'/mods/LOCAL_X?modset_id={child}').status_code, 204)
            self.seed(child, 'LOCAL_X', '2.0', 500)
            self.assertEqual(self.exported(client, child)[:3], ['CORE_A','CORE_B','CORE_C'])
            self.assertEqual(set(self.exported(client, child)[3:]), {'LOCAL_X','LOCAL_Y'})
