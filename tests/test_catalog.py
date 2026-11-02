import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('catalog', Path(__file__).resolve().parents[1] / 'catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)

class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_library = catalog.LIBRARY
        catalog.LIBRARY = Path(self.temp.name)
        (catalog.LIBRARY / 'data').mkdir()
        (catalog.LIBRARY / 'img').mkdir()
        (catalog.LIBRARY / 'thumbs').mkdir()
        row = {'id': 'test_front', '原图': 'img/test_front.png', '缩略图': 'thumbs/test_front.jpg'}
        (catalog.LIBRARY / 'data/pose-zh.json').write_text(json.dumps([row]))
        (catalog.LIBRARY / row['原图']).write_bytes(b'fixture')
        catalog.records.cache_clear(); catalog.index.cache_clear()

    def tearDown(self):
        catalog.LIBRARY = self.old_library
        catalog.records.cache_clear(); catalog.index.cache_clear()
        self.temp.cleanup()

    def test_builtins_get_english_names_without_changing_canonical_fields(self):
        path = catalog.LIBRARY / 'data/pose-zh.json'
        row = json.loads(path.read_text())[0]
        row.update({'姿势名称':'S形站姿・胯部侧顶','体系':'全身单人・性感系','角度':'正面'})
        path.write_text(json.dumps([row]))
        result = catalog.records()[0]
        self.assertEqual(result['name_en'], 'S-curve stance · Hip pushed to one side')
        self.assertEqual(result['姿势名称'], row['姿势名称'])
        self.assertEqual(catalog.canonical_label('Full body · Sensual'), row['体系'])
        self.assertEqual(catalog.canonical_label('Front'), row['角度'])

    def test_every_builtin_description_is_available_in_english(self):
        rows = json.loads((catalog.ROOT / 'library/data/pose-zh.json').read_text())
        for row in rows:
            with self.subTest(pose=row['id']):
                self.assertNotRegex(catalog.pose_description(row, 'en'), r'[\u3400-\u9fff]')
                expected_zh = ' / '.join(row[key] for key in ('体系','分类','姿势名称','角度'))
                self.assertEqual(catalog.pose_description(row), expected_zh)

    def test_action_separators_are_normalized_without_extra_metadata(self):
        row = {'姿势名称':'跪立大幅后仰・双手握脚跟','体系':'全身单人・性感系','分类':'跪立','角度':'侧面'}
        self.assertEqual(catalog.pose_action(row, 'en'), 'Deep kneeling backbend,Holding both heels')
        self.assertEqual(catalog.pose_action(row, 'zh'), '跪立大幅后仰,双手握脚跟')
        self.assertEqual(catalog.pose_action({'姿势名称':'自定义','name_en':'  Reach up  ·  Bend knee ・ Turn head  '}, 'en'), 'Reach up,Bend knee,Turn head')
        self.assertEqual(catalog.pose_action({'姿势名称':'飞吻'}, 'en'), 'Blowing a kiss')

    def test_selected_id_maps_to_allowlisted_file(self):
        self.assertEqual(catalog.asset('img', 'test_front.png').read_bytes(), b'fixture')

    def test_rejects_traversal_unknown_ids_and_mismatched_extension(self):
        for kind, name in [('img', '../test_front.png'), ('img', 'test_front.jpg'), ('data', 'test_front.png'), ('img', 'unknown.png'), ('img', '..\\test_front.png')]:
            with self.subTest(kind=kind, name=name), self.assertRaises(ValueError):
                catalog.asset(kind, name)

    def test_missing_image_is_actionable(self):
        with self.assertRaises(FileNotFoundError):
            catalog.asset('thumbs', 'test_front.jpg')

    def test_missing_original_reports_how_to_update_the_gallery(self):
        (catalog.LIBRARY / 'img/test_front.png').unlink()
        with self.assertRaisesRegex(FileNotFoundError, r'img/test_front.png.*git pull'):
            catalog.asset('img', 'test_front.png')

    def test_symlink_outside_library_is_rejected(self):
        file = catalog.LIBRARY / 'img/test_front.png'
        file.unlink(); file.symlink_to('/etc/passwd')
        with self.assertRaises(ValueError):
            catalog.asset('img', 'test_front.png')

if __name__ == '__main__': unittest.main()
