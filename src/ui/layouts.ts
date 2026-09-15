export const LAYOUT_HTML=String.raw`
<section id="s-collections">
  <h2>Collections</h2>
  <p class="note">Arrange catalogs into collections and tiles for Nuvio or Fusion. Drafts save on this device as you edit. Save to your installation to use them on another device.</p>
  <div class="b"><button id="layout-add" type="button">Add collection</button><button id="layout-row" type="button">Add Fusion row</button><button id="layout-save" type="button">Save to installation</button><button id="layout-load" type="button">Load saved layout</button></div>
  <div class="f"><label class="t" for="layout-import">Import a collection file</label><input type="file" id="layout-import" accept=".json,application/json"></div>
  <div id="layout-editor"></div>
  <div class="two"><div class="f"><label class="t" for="layout-target">Export for</label><select id="layout-target"><option value="nuvio">Nuvio</option><option value="fusion">Fusion</option></select></div><label class="check"><input id="layout-share" type="checkbox" checked>Shareable file: omit addon installation URLs</label></div>
  <p class="hint">Shareable files keep catalog recipes and artwork. Native client settings are preserved. Personal exports contain the installation links your player needs.</p>
  <div class="b"><button id="layout-export" type="button">Export layout</button><button id="layout-backup" type="button">Download full draft</button></div>
  <p id="layout-status" class="note" role="status"></p>
</section>`;

export const LAYOUT_SCRIPT=String.raw`
  var layoutScope=cfg.installationKey||'legacy',layoutDraft=lsGet('rill-layout-'+layoutScope)||{version:1,entries:[]};
  function layoutMessage(text){$('layout-status').textContent=text;}
  function saveLocalLayout(){lsSet('rill-layout-'+layoutScope,layoutDraft);}
  function layoutField(root,label,obj,key,choices){
    var input=choices?el('select',{'aria-label':label}):el('input',{type:'text','aria-label':label});
    if(choices)choices.forEach(function(v){input.appendChild(el('option',{value:v[0],text:v[1]}));});
    input.value=obj[key]===undefined?'':String(obj[key]);
    input.addEventListener(choices?'change':'input',function(){obj[key]=input.value;saveLocalLayout();});
    root.appendChild(el('label',{class:'f'},[el('span',{class:'t',text:label}),input]));
  }
  function layoutCheck(root,label,obj,key,defaultValue){
    var input=el('input',{type:'checkbox'});input.checked=obj[key]===undefined?!!defaultValue:!!obj[key];
    input.addEventListener('change',function(){obj[key]=input.checked;saveLocalLayout();});root.appendChild(el('label',{class:'check'},[input,el('span',{text:label})]));
  }
  function layoutTile(){return{id:crypto.randomUUID(),title:'New tile',shape:'poster',hidden:false,image:'',options:{},sources:[]};}
  function renderLayout(){
    var root=$('layout-editor');clear(root);
    layoutDraft.entries.forEach(function(entry,index){
      var box=el('div',{class:'group'});entry.options=entry.options||{};
      layoutField(box,'Collection or row title',entry,'title');layoutCheck(box,'Hide heading',entry,'hidden');
      box.appendChild(el('div',{class:'b'},[el('button',{type:'button',text:'Move up',onclick:function(){move(layoutDraft.entries,index,-1);saveLocalLayout();renderLayout();}}),el('button',{type:'button',text:'Move down',onclick:function(){move(layoutDraft.entries,index,1);saveLocalLayout();renderLayout();}}),el('button',{type:'button',text:'Remove '+(entry.mode==='row'?'row':'collection'),onclick:function(){layoutDraft.entries.splice(index,1);saveLocalLayout();renderLayout();}})]));
      var options=el('details');options.appendChild(el('summary',{text:'Layout settings'}));
      if(entry.mode==='row'){
        layoutField(options,'Maximum titles',entry.options,'limit');layoutField(options,'Cache seconds',entry.options,'cacheTTL');layoutCheck(options,'Numbered row',entry.options,'numbered');
        entry.options.presentation=entry.options.presentation||{};var p=entry.options.presentation;p.badges=p.badges||{};
        layoutField(options,'Card size',p,'cardStyle',[['small','Small'],['medium','Medium'],['large','Large']]);layoutField(options,'Background image',p,'backgroundImageURL');layoutCheck(options,'Provider badges',p.badges,'providers');layoutCheck(options,'Rating badges',p.badges,'ratings',true);
      }else{
        layoutField(options,'Backdrop image',entry.options,'backdropImageUrl');layoutField(options,'Nuvio view',entry.options,'viewMode',[['TABBED_GRID','Tabbed grid'],['ROWS','Rows'],['FOLLOW_LAYOUT','Follow client layout']]);
        layoutCheck(options,'Pin to top',entry.options,'pinToTop');layoutCheck(options,'Focus glow',entry.options,'focusGlowEnabled',true);layoutCheck(options,'Show all tab',entry.options,'showAllTab',true);
      }
      box.appendChild(options);
      entry.tiles.forEach(function(tile,at){
        var card=el('div',{class:'svc'});tile.options=tile.options||{};
        layoutField(card,'Tile title',tile,'title');layoutField(card,'Tile shape',tile,'shape',[['poster','Poster'],['wide','Landscape'],['square','Square']]);layoutCheck(card,'Hide tile title',tile,'hidden');layoutField(card,'Cover image',tile,'image');
        if(entry.mode!=='row'){
          var art=el('details');art.appendChild(el('summary',{text:'Nuvio artwork'}));
          [['Cover emoji','coverEmoji'],['Focus animation URL','focusGifUrl'],['Hero backdrop URL','heroBackdropUrl'],['Hero video URL','heroVideoUrl'],['Title logo URL','titleLogoUrl']].forEach(function(f){layoutField(art,f[0],tile.options,f[1]);});layoutCheck(art,'Animate focus',tile.options,'focusGifEnabled',true);card.appendChild(art);
        }
        tile.sources.forEach(function(source,n){
          var row=el('div',{class:'group'});row.appendChild(el('span',{text:source.name||source.id||'Native source'}));
          if(source.native)row.appendChild(el('p',{class:'hint',text:'Preserved '+source.native.target+' source. It is included when exporting to that client.'}));
          else{layoutField(row,'Genre or filter value',source,'genre');if(source.manifest)row.appendChild(el('p',{class:'hint',text:'Uses its original addon installation.'}));}
          row.appendChild(el('div',{class:'b'},[el('button',{type:'button',text:'Source up',onclick:function(){move(tile.sources,n,-1);saveLocalLayout();renderLayout();}}),el('button',{type:'button',text:'Remove source',onclick:function(){tile.sources.splice(n,1);saveLocalLayout();renderLayout();}})]));card.appendChild(row);
        });
        if(entry.mode!=='row'||!tile.sources.length){
          var select=el('select',{'aria-label':'Add catalog to tile'});select.appendChild(el('option',{value:'',text:'Choose a catalog'}));
          catDefs.filter(function(d){return !(d.extra||[]).some(function(e){return e.name==='search'&&e.isRequired;});}).forEach(function(d){select.appendChild(el('option',{value:d.type+'|'+d.id,text:d.name+' ('+d.type+')'}));});
          select.addEventListener('change',function(){var d=catDefs.find(function(c){return c.type+'|'+c.id===select.value;});if(!d)return;tile.sources.push({id:d.id,type:d.type,name:d.name});if(!cfg.catalogs.some(function(c){return c.id===d.id&&c.type===d.type;}))cfg.catalogs.push({id:d.id,type:d.type,enabled:true});else cfg.catalogs.find(function(c){return c.id===d.id&&c.type===d.type;}).enabled=true;changed();saveLocalLayout();renderLayout();});card.appendChild(select);
        }
        if(entry.mode!=='row')card.appendChild(el('div',{class:'b'},[el('button',{type:'button',text:'Tile up',onclick:function(){move(entry.tiles,at,-1);saveLocalLayout();renderLayout();}}),el('button',{type:'button',text:'Remove tile',onclick:function(){entry.tiles.splice(at,1);saveLocalLayout();renderLayout();}})]));
        box.appendChild(card);
      });
      if(entry.mode!=='row')box.appendChild(el('button',{type:'button',text:'Add tile',onclick:function(){entry.tiles.push(layoutTile());saveLocalLayout();renderLayout();}}));
      root.appendChild(box);
    });
  }
  ['add','row'].forEach(function(action){$('layout-'+action).addEventListener('click',function(){layoutDraft.entries.push({id:crypto.randomUUID(),title:action==='row'?'New row':'New collection',mode:action==='row'?'row':'collection',hidden:false,tiles:[layoutTile()],options:{}});saveLocalLayout();renderLayout();});});
  $('layout-save').addEventListener('click',async function(){var r=await api('/api/collections/save',{config:cfg,layout:layoutDraft});layoutMessage(r.error||'Layout saved to this installation.');});
  $('layout-load').addEventListener('click',async function(){var r=await api('/api/collections/load',{config:cfg});if(r.error){layoutMessage(r.error);return;}layoutDraft=r.layout;saveLocalLayout();renderLayout();layoutMessage('Saved layout loaded.');});
  function downloadLayout(value,name){var url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=el('a',{href:url,download:name});document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  $('layout-export').addEventListener('click',async function(){var target=$('layout-target').value,r=await api('/api/collections/export',{config:cfg,layout:layoutDraft,target:target,share:$('layout-share').checked});if(r.error){layoutMessage(r.error);return;}downloadLayout(r.output,'rill-'+target+'.json');layoutMessage((r.notes||[]).join(' ')||'Layout exported.');});
  $('layout-backup').addEventListener('click',function(){downloadLayout(layoutDraft,'rill-collection-draft.json');});
  $('layout-import').addEventListener('change',async function(){var file=this.files[0];if(!file)return;try{if(file.size>1000000)throw new Error('Choose a file smaller than 1 MB.');var r=await api('/api/collections/import',{config:cfg,layout:JSON.parse(await file.text())});if(r.error)throw new Error(r.error);layoutDraft=r.layout;cfg.customCatalogs=cfg.customCatalogs||[];(r.catalogs||[]).forEach(function(c){var i=cfg.customCatalogs.findIndex(function(old){return old.id===c.id;});if(i>=0)cfg.customCatalogs[i]=c;else cfg.customCatalogs.push(c);});saveLocalLayout();changed();renderLayout();layoutMessage((r.notes||[]).join(' ')||'Layout imported. Review its sources before exporting.');}catch(error){layoutMessage(error.message||'Could not import this file.');}finally{this.value='';}});
  renderLayout();
`;
