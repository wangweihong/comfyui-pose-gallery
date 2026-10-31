"""Persistence, image validation and failure recovery for custom references."""
import concurrent.futures
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
KIND=ROOT.name.removeprefix('comfyui-').removesuffix('-gallery')
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file)
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj
u=module('upload_test_store','uploads.py');c=module('upload_test_catalog','catalog.py')

def picture(fmt='PNG',size=(24,36),**kwargs):
    out=BytesIO();Image.new('RGB',size,'#965b45').save(out,format=fmt,**kwargs);return out.getvalue()

class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)/'custom'
        self.old,self.old_user=c.LIBRARY,c.USER_LIBRARY
        c.LIBRARY,c.USER_LIBRARY=Path(self.temp.name)/'builtins',self.root
    def tearDown(self):
        c.LIBRARY,c.USER_LIBRARY=self.old,self.old_user;c.records.cache_clear();self.temp.cleanup()
    def upload(self,data=None,**kwargs):
        return u.import_image(picture() if data is None else data,root=self.root,
            name=kwargs.pop('name','我的 <参考> & "名称"'),filename=kwargs.pop('filename','参考.png'),**kwargs)
    def path(self,row,kind):
        return self.root/u.PATHS[kind]/(row['id']+('.png' if kind=='full' else '.webp'))
    def test_three_formats_derivatives_bilingual_names_and_persistence(self):
        for fmt in ['PNG','JPEG','WEBP']:
            row=self.upload(picture(fmt,(1200,1600)),other_name='My reference')
            self.assertRegex(row['id'],r'^u-[a-f0-9]{32}$');self.assertEqual(row['source_id'],'')
            with Image.open(self.path(row,'full')) as im:self.assertEqual((im.format,im.size),('PNG',(1200,1600)))
            for kind,limit in [('preview',(800,1000)),('thumb',(400,500))]:
                with Image.open(self.path(row,kind)) as im:
                    self.assertEqual(im.format,'WEBP');self.assertLessEqual(im.width,limit[0]);self.assertLessEqual(im.height,limit[1]);self.assertAlmostEqual(im.width/im.height,.75,delta=.01)
        c.records.cache_clear();saved=getattr(c,KIND)(row['id'])
        self.assertEqual((saved['name_zh'],saved['name_en']),('我的 <参考> & "名称"','My reference'))
        meta=c.metadata();self.assertEqual((meta['builtin_count'],meta['user_count'],meta['builtin_missing']),(0,3,True))
        self.assertEqual(c.asset(c.FULL_KIND,row['id']+'.png'),self.path(row,'full'))
    def test_english_name_fallback_default_classification_and_no_invented_metadata(self):
        row=self.upload(name='My own reference',language='en')
        self.assertEqual(row['name_zh'],row['name_en'])
        if KIND=='pose':self.assertEqual((row['分类'],row['角度'],row['姿势编号']),('未分类','未分类',''))
        elif KIND=='portrait':self.assertEqual((row['section'],row['hair'],row['style']),('custom','unknown',''))
        else:self.assertEqual((row['分类'],row['关键词'],row['英文关键词']),('未分类',[],''))
    def test_transparency_and_exif_orientation(self):
        data=BytesIO();Image.new('RGBA',(10,20),(0,0,0,0)).save(data,format='PNG');row=self.upload(data.getvalue())
        with Image.open(self.path(row,'full')) as im:self.assertEqual(im.getpixel((0,0))[3],0)
        with Image.open(self.path(row,'thumb')) as im:self.assertTrue(all(v>=250 for v in im.getpixel((0,0))))
        exif=Image.Exif();exif[274]=6;row=self.upload(picture('JPEG',(30,50),exif=exif));self.assertEqual((row['w'],row['h']),(50,30))
    def test_invalid_content_size_and_metadata_do_not_commit(self):
        cases=[(b'bad',{},'invalid_image'),(b'x'*(u.MAX_BYTES+1),{},'file_too_large'),(picture('GIF'),{},'unsupported_format'),
            (picture(),{'name':''},'name_required'),(picture(),{'name':'x'*121},'invalid_metadata'),(picture(),{'category':'x'*121},'invalid_metadata'),
            (picture(),{'filename':'../escape.png'},'invalid_filename'),(picture(),{'filename':'C:\\escape.png'},'invalid_filename'),
            (picture(),{'hair':'bad'},'invalid_metadata'),(picture(),{'section':'bad'},'invalid_metadata'),(picture(),{'angle':'bad'},'invalid_metadata')]
        for data,kwargs,code in cases:
            with self.subTest(code=code),self.assertRaises(u.UploadError) as caught:self.upload(data,**kwargs)
            self.assertEqual(caught.exception.code,code)
        self.assertFalse(self.root.exists())
    def test_animation_and_pixel_limit(self):
        out=BytesIO();Image.new('RGB',(2,2),'red').save(out,format='PNG',save_all=True,append_images=[Image.new('RGB',(2,2),'blue')])
        with self.assertRaises(u.UploadError) as caught:self.upload(out.getvalue())
        self.assertEqual(caught.exception.code,'animated_image')
        def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
        data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',8000,4001,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''))+chunk(b'IEND',b'')
        with self.assertRaises(u.UploadError) as caught:self.upload(data)
        self.assertEqual(caught.exception.code,'too_many_pixels');self.assertFalse(self.root.exists())
    def test_concurrent_uploads_and_catalog_refresh(self):
        first=self.upload();self.assertEqual(c.metadata()['user_count'],1)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:rows=list(pool.map(lambda i:self.upload(name=f'参考{i}'),range(6)))
        saved=json.loads((self.root/'data/custom.json').read_text());self.assertEqual(len(saved),7);self.assertEqual(len({r['id'] for r in saved}),7)
        self.assertEqual(c.metadata()['user_count'],7)
        for row in rows:self.assertTrue(self.path(row,'full').is_file())
    def test_index_failure_rolls_back_only_new_files_and_can_retry(self):
        row=self.upload();before=(self.root/'data/custom.json').read_bytes();files={str(p.relative_to(self.root)) for p in self.root.rglob('*') if p.is_file()}
        original=u.os.replace
        def fail(src,dest):
            if str(dest).endswith('custom.json'):raise OSError('injected failure')
            return original(src,dest)
        with patch.object(u.os,'replace',side_effect=fail),self.assertRaises(u.UploadError):self.upload(name='Failure')
        self.assertEqual((self.root/'data/custom.json').read_bytes(),before)
        self.assertEqual({str(p.relative_to(self.root)) for p in self.root.rglob('*') if p.is_file()},files)
        self.upload(name='Retry');self.assertEqual(c.metadata()['user_count'],2)
    def test_corrupt_index_is_preserved(self):
        self.root.mkdir();(self.root/'data').mkdir();index=self.root/'data/custom.json';index.write_text('bad json')
        with self.assertRaises(u.UploadError):self.upload()
        self.assertEqual(index.read_text(),'bad json');self.assertFalse(list(self.root.rglob('u-*')))
    def test_external_symlinks_and_unregistered_assets_are_rejected(self):
        row=self.upload();path=self.path(row,'full');path.unlink();path.symlink_to('/etc/passwd')
        with self.assertRaises(ValueError):c.asset(c.FULL_KIND,row['id']+'.png')
        with self.assertRaises(ValueError):c.asset(c.FULL_KIND,'u-'+'a'*32+'.png')
        with tempfile.TemporaryDirectory() as external:
            self.root=Path(self.temp.name)/'other';self.root.mkdir();(self.root/'data').symlink_to(external,target_is_directory=True)
            with self.assertRaises(u.UploadError):self.upload()
            self.assertFalse(list(Path(external).iterdir()))
    def test_custom_file_paths_and_reserved_ids_cannot_be_forged(self):
        row=self.upload();index=self.root/'data/custom.json';field=c.ASSET_FIELDS[c.FULL_KIND]
        for changed in [dict(row,**{field:'../secret.png'}),dict(row,id='builtin-fake')]:
            index.write_text(json.dumps([changed]));c.records.cache_clear()
            with self.assertRaises(ValueError):c.records()

if __name__=='__main__':unittest.main()
