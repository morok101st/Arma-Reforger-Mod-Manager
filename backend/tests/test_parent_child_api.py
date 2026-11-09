"""Canonical Parent/Child API terminology retains earlier development aliases."""
from fastapi.testclient import TestClient

from app import main as app_main
from tests import test_base_modsets as helpers
from tests.support import ApiTestCase


class ParentChildApiTests(ApiTestCase):
    create_set = helpers.BaseModsetsTestCase.create_set
    seed = helpers.BaseModsetsTestCase.seed

    def test_parent_inputs_and_child_outputs_match_compatibility_fields(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            parent = self.create_set(client, 'Parent')
            self.seed(parent, 'PARENT01')
            response = client.post('/modsets', json={'name':'Child','parent_modset_id':parent,'order_mode':'parent'})
            self.assertEqual(response.status_code,201,response.text)
            child = response.json()
            self.assertEqual(child['parent_modset_id'],parent)
            self.assertEqual(child['base_modset_id'],parent)
            self.assertEqual(child['parent_modset_name'],'Parent')
            self.assertEqual(child['order_mode'],'parent')
            self.assertEqual(child['export_order_mode'],'base')
            listed = next(row for row in client.get('/modsets').json() if row['id']==parent)
            self.assertEqual(listed['child_modsets_count'],1)
            self.assertEqual(listed['derived_modsets_count'],1)
            mod = client.get(f'/mods/PARENT01?modset_id={child["id"]}').json()
            self.assertEqual(mod['parent_modset_id'],parent)
            self.assertEqual(mod['parent_modset_name'],'Parent')
            self.assertEqual(mod['order_mode'],'parent')
            response = client.patch(f'/modsets/{child["id"]}',json={'name':'Independent','parent_modset_id':None})
            self.assertEqual(response.status_code,200,response.text)
            self.assertIsNone(response.json()['parent_modset_id'])
            self.assertEqual(response.json()['order_mode'],'independent')

    def test_preview_accepts_new_and_legacy_names_without_mutating_order(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            parent = self.create_set(client, 'Parent')
            self.seed(parent, 'PARENT01')
            child = self.create_set(client, 'Child', parent)
            old = client.get(f'/modsets/{child}/order-preview?mode=base&base_modset_id={parent}')
            new = client.get(f'/modsets/{child}/order-preview?mode=parent&parent_modset_id={parent}')
            self.assertEqual(new.status_code,200,new.text)
            self.assertEqual(new.json(),old.json())
            response = client.patch(f'/modsets/{child}',json={'name':'Child','order_mode':'parent','confirm_order_change':True})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['order_mode'],'parent')
            self.assertEqual(client.get(f'/modsets/{child}/order-preview?mode=parent&parent_modset_id={parent}&base_modset_id={child}').status_code,422)

    def test_conflicting_aliases_are_rejected_and_matching_aliases_are_accepted(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            parent = self.create_set(client, 'Parent')
            other = self.create_set(client, 'Other')
            for payload in [
                {'parent_modset_id':parent,'base_modset_id':other},
                {'order_mode':'parent','export_order_mode':'independent'},
            ]:
                result = client.post('/modsets',json={'name':'Conflicting',**payload})
                self.assertEqual(result.status_code,422,result.text)
            response = client.post('/modsets',json={'name':'Compatible','parent_modset_id':parent,'base_modset_id':parent,'order_mode':'parent','export_order_mode':'base'})
            self.assertEqual(response.status_code,201,response.text)
            child = response.json()['id']
            response = client.patch(f'/modsets/{child}',json={'name':'Compatible','confirm_parent_conflicts':True,'confirm_base_conflicts':False})
            self.assertEqual(response.status_code,422,response.text)

    def test_canonical_conflict_confirmation_is_enforced(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            parent = self.create_set(client, 'Parent')
            self.seed(parent, 'PARENT01', version='2.0')
            child = self.create_set(client, 'Child')
            self.seed(child, 'PARENT01', version='1.0')
            payload={'name':'Child','parent_modset_id':parent}
            self.assertEqual(client.patch(f'/modsets/{child}',json=payload).status_code,409)
            payload['confirm_parent_conflicts']=True
            response=client.patch(f'/modsets/{child}',json=payload)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(client.get(f'/mods/PARENT01?modset_id={child}').json()['current_version'],'2.0')

    def test_openapi_documents_canonical_parent_inputs_and_compatibility_outputs(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            schema = client.get('/openapi.json').json()['components']['schemas']
            props = schema['ModSetCreate']['properties']
            self.assertIn('parent_modset_id', props)
            self.assertIn('parent', props['order_mode']['enum'])
            self.assertNotIn('base', props['order_mode']['enum'])
            response_props = schema['ModSetRead']['properties']
            self.assertIn('parent_modset_id', response_props)
            self.assertIn('child_modsets_count', response_props)
            self.assertTrue(response_props['base_modset_id']['deprecated'])
