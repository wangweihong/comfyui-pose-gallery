"""Run with ComfyUI's Python to check real tensors and preserved output semantics."""
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
KIND=ROOT.name.removeprefix('comfyui-').removesuffix('-gallery')
NAME=KIND.capitalize()+'Gallery'

class RandomNodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if importlib.util.find_spec('torch') is None:raise unittest.SkipTest('Use the ComfyUI Python interpreter for tensor tests')
        from aiohttp import web
        spec=importlib.util.spec_from_file_location(KIND+'_random_tests',ROOT/'__init__.py',submodule_search_locations=[str(ROOT)])
        module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module
        server=types.ModuleType('server');server.PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef()))
        previous=sys.modules.get('server');sys.modules['server']=server
        try:spec.loader.exec_module(module)
        finally:
            if previous is None:sys.modules.pop('server',None)
            else:sys.modules['server']=previous
        cls.module=module;cls.catalog=module._random_catalog;cls.node=getattr(module,'Random'+NAME);cls.old=getattr(module,NAME)
        cls.sample=json.loads((cls.catalog.LIBRARY/cls.catalog.INDEX_FILE).read_text())[0]
    def setUp(self):
        from PIL import Image
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.previous=(self.catalog.LIBRARY,self.catalog.USER_LIBRARY)
        self.catalog.LIBRARY,self.catalog.USER_LIBRARY=self.root/'builtin',self.root/'user'
        self.builtin=dict(self.sample,id='BUILTIN-TEST',w=8,h=12,origin='builtin')
        for kind,field in self.catalog.ASSET_FIELDS.items():
            if kind in self.catalog.OPTIONAL_ASSETS and field not in self.builtin:continue
            suffix='.png' if kind==self.catalog.FULL_KIND else '.jpg' if KIND=='pose' and kind=='thumbs' else '.webp'
            self.builtin[field]=self.catalog.PREFIXES[kind]+'/'+self.builtin['id']+suffix
        index=self.catalog.LIBRARY/self.catalog.INDEX_FILE;index.parent.mkdir(parents=True);index.write_text(json.dumps([self.builtin]))
        self.full_field=self.catalog.ASSET_FIELDS[self.catalog.FULL_KIND]
        full=self.catalog.LIBRARY/self.builtin[self.full_field];full.parent.mkdir(parents=True);Image.new('RGB',(8,12),'red').save(full)
        out=BytesIO();Image.new('RGB',(10,14),'blue').save(out,format='PNG')
        self.custom=self.module.import_image(out.getvalue(),name='我的参考',other_name='My reference',filename='reference.png',root=self.catalog.USER_LIBRARY)
    def tearDown(self):
        self.catalog.LIBRARY,self.catalog.USER_LIBRARY=self.previous;self.catalog.records.cache_clear();self.temp.cleanup()
    def test_sources_missing_originals_and_custom_only_library(self):
        self.assertEqual({r['id'] for r in self.node._candidates()},{self.builtin['id'],self.custom['id']})
        self.assertEqual(self.node._candidates('builtin')[0]['id'],self.builtin['id']);self.assertEqual(self.node._candidates('user')[0]['id'],self.custom['id'])
        (self.catalog.LIBRARY/self.builtin[self.full_field]).unlink();self.assertEqual([r['id'] for r in self.node._candidates()],[self.custom['id']])
        (self.catalog.LIBRARY/self.catalog.INDEX_FILE).unlink();self.assertIs(self.node.VALIDATE_INPUTS(),True)
    def test_empty_invalid_and_escaping_paths_are_rejected(self):
        self.assertIn('无效',self.node.VALIDATE_INPUTS('bad'))
        full=self.catalog.USER_LIBRARY/self.custom[self.full_field];full.unlink();self.assertIn('没有可用',self.node.VALIDATE_INPUTS('user'));self.assertIn('No available',self.node.VALIDATE_INPUTS('user','en'))
        with self.assertRaises(ValueError):self.node().load_random('user')
        outside=self.root/'outside.png';outside.write_bytes(b'outside');full.symlink_to(outside)
        with self.assertRaises(ValueError):self.node._candidates('user')
    def test_each_execution_resamples_with_one_consistent_image_and_preserved_ports(self):
        choices=[self.custom,self.builtin,self.custom]
        with patch.object(self.module.random,'choice',side_effect=choices) as choose:results=[self.node().load_random(language='en') for _ in range(3)]
        self.assertEqual(choose.call_count,3)
        for item,chosen in zip(results,choices):
            result=item['result'];expected=getattr(self.old(),self.old.FUNCTION)(chosen['id'], language='en')
            self.assertEqual(len(result),len(self.old.RETURN_NAMES));self.assertEqual(result[1:],expected[1:]);self.assertTrue(result[0].equal(expected[0]))
            self.assertEqual(result[0].shape,(1,chosen['h'],chosen['w'],3));self.assertEqual(result[3],chosen['id']);self.assertEqual(item['ui'][KIND+'_id'],[chosen['id']])
            if chosen is self.custom:self.assertEqual(item['ui']['name'],['My reference'])
            if KIND=='costume' and chosen is self.custom:self.assertEqual(result[5],'')
    def test_fingerprints_are_fresh_and_json_safe_while_original_node_stays_fixed(self):
        values=[self.node.IS_CHANGED() for _ in range(4)];self.assertEqual(len(set(values)),4);json.dumps(values,allow_nan=False)
        self.assertEqual(set(self.old.INPUT_TYPES()['required']),{KIND+'_id'});self.assertNotIn('origin',self.old.INPUT_TYPES().get('optional',{}))
        self.assertEqual(self.old.IS_CHANGED(self.builtin['id']),self.old.IS_CHANGED(self.builtin['id']))
        a=getattr(self.old(),self.old.FUNCTION)(self.builtin['id']);b=getattr(self.old(),self.old.FUNCTION)(self.builtin['id']);self.assertIsInstance(a,tuple);self.assertEqual(a[1:],b[1:]);self.assertTrue(a[0].equal(b[0]));self.assertEqual(self.node.RETURN_NAMES,self.old.RETURN_NAMES)
    def test_optional_pose_filters_keep_original_default_pool(self):
        self.assertEqual(len(self.node._candidates()),2)
        filtered=self.node._candidates(pose_system=self.builtin['体系'],angle=self.builtin['角度'])
        self.assertEqual([r['id'] for r in filtered],[self.builtin['id']])
        self.assertEqual([r['id'] for r in self.node._candidates(pose_system='自定义')],[self.custom['id']])
    def test_english_filters_and_preview_names_preserve_original_output_data(self):
        selected = self.node._candidates('builtin', 'en', 'Full body · Sensual', 'Front')
        self.assertEqual([row['id'] for row in selected], [self.builtin['id']])
        result = self.node().load_random('builtin', 'en')
        self.assertEqual(result['ui']['name'], [self.catalog.english_labels()[self.builtin['姿势名称']]])
        self.assertEqual(result['ui']['name_zh'], [self.builtin['姿势名称']])
        self.assertEqual(result['result'][1:], self.old().load_pose(self.builtin['id'], language='en')[1:])

    def test_fixed_and_random_description_outputs_follow_language(self):
        expected_en = 'Full body · Sensual / Standing / S-curve stance · Hip pushed to one side / Front'
        fixed_zh = self.old().load_pose(self.builtin['id'])
        fixed_en = self.old().load_pose(self.builtin['id'], language='en')
        self.assertEqual(fixed_en[4], expected_en)
        self.assertEqual(fixed_zh[4], '全身单人・性感系 / 站姿 / S形站姿・胯部侧顶 / 正面')
        self.assertTrue(fixed_en[0].equal(fixed_zh[0]))
        self.assertEqual(fixed_en[1:4], fixed_zh[1:4])
        self.assertNotEqual(self.old.IS_CHANGED(self.builtin['id'], 'en'), self.old.IS_CHANGED(self.builtin['id'], 'zh'))
        self.assertIs(self.old.VALIDATE_INPUTS(self.builtin['id'], 'en'), True)
        self.assertEqual(self.node().load_random('builtin', 'en')['result'][4], expected_en)
        self.assertEqual(self.node().load_random('builtin', 'zh')['result'][4], fixed_zh[4])

    def test_custom_description_uses_the_selected_name_language(self):
        for loader in (lambda lang: self.old().load_pose(self.custom['id'], lang),
                       lambda lang: self.node().load_random('user', lang)['result']):
            self.assertEqual(loader('en')[4], 'Custom / Unspecified / My reference / Unspecified')
            self.assertEqual(loader('zh')[4], '自定义 / 未分类 / 我的参考 / 未分类')

    def test_action_output_contains_only_the_pose_name_with_comma_separators(self):
        row = dict(self.builtin, 姿势名称='跪立大幅后仰・双手握脚跟')
        (self.catalog.LIBRARY/self.catalog.INDEX_FILE).write_text(json.dumps([row]))
        for result in (self.old().load_pose(row['id'], 'en'), self.node().load_random('builtin', 'en')['result']):
            self.assertEqual(len(result), 6)
            self.assertEqual(result[5], 'Deep kneeling backbend,Holding both heels')
            self.assertEqual(result[3], row['id'])
            self.assertIn('Full body · Sensual / Standing / ', result[4])
            self.assertTrue(result[4].endswith(' / Front'))
        self.assertEqual(self.old().load_pose(row['id'], 'zh')[5], '跪立大幅后仰,双手握脚跟')
        self.assertEqual(self.old.RETURN_NAMES, ('image','width','height','pose_id','description','action'))
        self.assertEqual(self.node.RETURN_NAMES, self.old.RETURN_NAMES)
        self.assertEqual(self.old().load_pose(self.custom['id'], 'en')[5], 'My reference')

    def test_candidate_scan_loads_and_validates_the_catalog_only_once(self):
        with patch.object(self.module,'records',wraps=self.module.records) as reader:
            self.node._candidates();self.assertEqual(reader.call_count,1)

if __name__=='__main__':unittest.main()
