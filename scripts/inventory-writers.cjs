// Read-only candidate inventory. Presence is not proof of a defect or safe transaction.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../server/node_modules/typescript');
const root = path.resolve(__dirname, '..');
const actions = new Set(['create','createMany','update','updateMany','upsert','delete','deleteMany']);
const models = new Set(['product','productStock','stockTransaction','stockIssueItem']);
const candidates = [];
function owner(node){
 let fallback='(module)';
 for(let p=node.parent;p;p=p.parent){
  if((ts.isMethodDeclaration(p)||ts.isFunctionDeclaration(p))&&p.name)return p.name.getText();
  if((ts.isArrowFunction(p)||ts.isFunctionExpression(p))&&ts.isVariableDeclaration(p.parent))fallback=p.parent.name.getText();
 }
 return fallback;
}
function walk(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory()){walk(file);continue;}
  if(!file.endsWith('.ts')||/\.(spec|test)\.ts$/.test(file))continue;
  const text=fs.readFileSync(file,'utf8');const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  function visit(node){
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
    const action=node.expression.name.text;const target=node.expression.expression;
    if(actions.has(action)&&ts.isPropertyAccessExpression(target)&&models.has(target.name.text)){
     candidates.push({file:path.relative(root,file).replaceAll('\\','/'),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,function:owner(node),model:target.name.text,action});
    }
   }
   if(ts.isTaggedTemplateExpression(node)&&ts.isPropertyAccessExpression(node.tag)&&/Raw$/.test(node.tag.name.text)&&/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?(ProductStock|Product|StockTransaction)\b/i.test(node.template.getText(source))){
    candidates.push({file:path.relative(root,file).replaceAll('\\','/'),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,function:owner(node),model:'raw-sql',action:'review'});
   }
   ts.forEachChild(node,visit);
  }
  visit(source);
 }
}
walk(path.join(root,'server','src'));
const output=path.join(root,'scratch','goods-receipt-20261108','inventory-writers.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({generatedAtUTC:new Date().toISOString(),scope:'server/src excluding spec/test files',limitations:['Syntactic candidates, not a bug count or completion ratio.','Includes product metadata mutations with no balance change.','Delegate aliases, computed access, raw SQL assembled elsewhere, scripts and other clients need separate review.','No inference of transaction, locking, authorization, Money adoption or safety from presence alone.'],candidates},null,2));
console.log(`${candidates.length} candidate writes in ${new Set(candidates.map(c=>c.file)).size} files; ${path.relative(root,output)}`);
