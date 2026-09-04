import { getOrCreateSheet, appendPages } from './sheets';
const id=await getOrCreateSheet('test','ND_TEST');
await appendPages(id,'test','ND_TEST',[{page:51,text:'test',bbox:[0,0,1,1],words:[],blocks:[],headings:[],tables:[],links:[],images:[],ocr_used:false}]);
console.log('SHEETS_WRITE_OK',id);
