import tempfile
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from fastapi.testclient import TestClient
from main import create_app


class PointsApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "points.json"
        self.app = create_app(self.path)
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.value = {"name": "Ejemplo A", "x": 12.5, "y": -7, "description": "Unidades locales ficticias"}

    def test_crud_and_persistence_across_app_instances(self):
        self.assertEqual(self.client.get('/api/demo-points').json(), [])
        result = self.client.post('/api/demo-points', json=self.value)
        self.assertEqual(result.status_code, 201)
        record = result.json()
        self.assertTrue(record['id'])
        self.assertTrue(record['created_at'])
        url = '/api/demo-points/' + record['id']
        with TestClient(create_app(self.path)) as restarted:
            self.assertEqual(restarted.get(url).json(), record)
        updated = self.client.put(url, json={**self.value, 'x': 42, 'name': 'Ejemplo B'})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()['created_at'], record['created_at'])
        self.assertEqual(self.client.get('/api/demo-points').json()[0]['x'], 42)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertEqual(self.client.get(url).status_code, 404)
        with TestClient(create_app(self.path)) as restarted:
            self.assertEqual(restarted.get('/api/demo-points').json(), [])

    def test_category_is_persisted_and_validated(self):
        result = self.client.post('/api/demo-points', json={**self.value, 'category': 'muestra'})
        self.assertEqual(result.status_code, 201)
        with TestClient(create_app(self.path)) as restarted:
            self.assertEqual(restarted.get('/api/demo-points').json()[0]['category'], 'muestra')
        self.assertEqual(self.client.post('/api/demo-points', json={**self.value, 'category': 'invalid'}).status_code, 422)

    def test_duplicate_name_returns_400_without_extra_record(self):
        self.client.post('/api/demo-points', json=self.value)
        self.assertEqual(self.client.post('/api/demo-points', json={**self.value, 'name': ' ejemplo a '}).status_code, 400)
        self.assertEqual(len(self.client.get('/api/demo-points').json()), 1)

    def test_missing_records_return_404(self):
        self.assertEqual(self.client.get('/api/demo-points/missing').status_code, 404)
        self.assertEqual(self.client.put('/api/demo-points/missing', json=self.value).status_code, 404)
        self.assertEqual(self.client.delete('/api/demo-points/missing').status_code, 404)

    def test_invalid_fields_return_422(self):
        for value in [{}, {**self.value, 'name': ' '}, {**self.value, 'x': 'invalid'}, {**self.value, 'unknown': 1}]:
            with self.subTest(value=value):
                self.assertEqual(self.client.post('/api/demo-points', json=value).status_code, 422)
        self.assertFalse(self.path.exists())

    def test_corrupt_storage_returns_500_without_overwriting(self):
        self.path.write_text('broken-json', encoding='utf-8')
        self.assertEqual(self.client.get('/api/demo-points').status_code, 500)
        self.assertEqual(self.client.post('/api/demo-points', json=self.value).status_code, 500)
        self.assertEqual(self.path.read_text(encoding='utf-8'), 'broken-json')

    def test_failed_atomic_write_preserves_previous_data(self):
        self.client.post('/api/demo-points', json=self.value)
        before = self.path.read_bytes()
        with patch('main.os.replace', side_effect=OSError('test failure')):
            self.assertEqual(self.client.post('/api/demo-points', json={**self.value, 'name': 'Otro'}).status_code, 500)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(list(self.path.parent.glob('*.tmp')), [])

    def test_concurrent_creation_does_not_lose_records(self):
        def create(index):
            return self.client.post('/api/demo-points', json={**self.value, 'name': f'Ejemplo {index}'}).status_code
        with ThreadPoolExecutor(max_workers=4) as executor:
            self.assertEqual(list(executor.map(create, range(8))), [201] * 8)
        records = self.client.get('/api/demo-points').json()
        self.assertEqual(len(records), 8)
        self.assertEqual(len({record['id'] for record in records}), 8)


if __name__ == '__main__':
    unittest.main()
