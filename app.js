(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
  const cache = new Map();
  const state = {stage:'cover', regions:[], districtData:null, city:null, district:null, village:null, ballots:[], active:-1, holding:false, inked:false, busy:false, generation:0, overrides:{},reports:null};
  const sealSVG = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="16.2" stroke="currentColor" stroke-width="2.3"/><path d="M20 20L20 4M20 20L6 28M20 20L34 28" stroke="currentColor" stroke-width="2.3"/></svg>';
  const palettes = {C1:'#e7dea8',T:'#e9c6d5',D1:'#dce9e9',R:'#e9ddc9',D2:'#dde9e8',R3:'#e9ddc9',V1:'#e0d8eb',P22:'#efeeea'};
  const syncCoverAspect=()=>$('.cover-art').setAttribute('preserveAspectRatio',matchMedia('(max-width:800px)').matches?'xMidYMid slice':'none');
  syncCoverAspect();window.addEventListener('resize',syncCoverAspect);

  async function data(name) {
    if (!cache.has(name)) cache.set(name, fetch(`data/${name}.json`).then(r => { if (!r.ok) throw new Error(name); return r.json(); }).catch(error => {cache.delete(name); throw error;}));
    return cache.get(name);
  }
  function announce(text) { $('#announcer').textContent = text; }
  function escapeText(value) { return String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])); }
  function candidateName(value) {
    return escapeText(value).replace(/@(.*?)@/g, (_, code) => `<img class="rare-name" alt="罕用字" src="https://www.cns11643.gov.tw/char/kai/24/${encodeURIComponent(code)}.png">`);
  }
  function show(stage) {
    releaseStamp();
    state.stage = stage;
    document.body.dataset.stage = stage;
    $$('.screen').forEach(screen => {const active=screen.id===stage; screen.classList.toggle('active',active); screen.inert=!active;});
    const heading = $(`#${stage} h1`);
    if (heading) {heading.tabIndex=-1; heading.focus({preventScroll:true});}
  }
  async function home() {
    state.generation++;
    state.busy = false;
    releaseStamp();
    $('#transition-shade').classList.add('shade');
    await wait(400);
    state.ballots=[];state.active=-1;
    $('#ballot-paper').replaceChildren();
    $('#ballot-rack').replaceChildren();
    $('#folded-stack').replaceChildren();
    $('#cover').classList.remove('is-entering');
    $('#cover-ticket').classList.remove('falling');
    $('#entry-world').style.transition='none';
    document.body.classList.remove('camera-inside');
    void $('#entry-world').offsetWidth;$('#entry-world').style.transition='';
    $('#desk').classList.remove('dealing','settling');
    $('#deposit').classList.remove('dropping');
    $('#enter').disabled=false;
    show('cover');
    $('#enter').focus({preventScroll:true});
    $('#transition-shade').classList.remove('shade');
  }
  $$('[data-home]').forEach(button => button.addEventListener('click', home));
  $('#return-home').addEventListener('click', home);
  $$('[data-open-info]').forEach(button => button.addEventListener('click', () => {releaseStamp();$('#info-dialog').showModal();}));
  $('#info-dialog').addEventListener('click', e => { if(e.target===$('#info-dialog')) {const r=e.target.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();} });
  $('#enter').addEventListener('click', async () => {
    if(state.busy)return;
    state.busy=true;$('#enter').disabled=true;
    $('#cover').classList.add('is-entering');
    $('#cover-ticket').classList.add('falling');
    const generation=state.generation;
    await wait(360);
    if(generation!==state.generation)return;
    document.body.classList.add('camera-inside');
    await wait(1700);
    if(generation!==state.generation)return;
    show('selection');state.busy=false;
    $('#city').focus({preventScroll:true});
  });

  function fillSelect(select, items, placeholder, valueKey, labelKey) {
    select.replaceChildren(new Option(placeholder,''), ...items.map(item=>new Option(item[labelKey],item[valueKey])));
  }
  function resetFollowing(level) {
    state.overrides={};$('#extra-areas').replaceChildren();
    $('#selection-status').textContent='';
    $('#get-ballots').disabled=true;
    if(level==='city') {
      state.district=null;state.village=null;
      fillSelect($('#district'),[],'選擇鄉鎮市區','deptCode','deptName');
      $('#district').disabled=true;$('#district-line').classList.add('dormant');
    }
    fillSelect($('#village'),[],'選擇村里','liCode','liName');
    $('#village').disabled=true;$('#village-line').classList.add('dormant');
    $('#voter-line').classList.add('dormant');
  }
  $('#city').addEventListener('change',async () => {
    const code=$('#city').value;
    resetFollowing('city');
    state.city=state.regions.find(region=>region.prvCityCode===code)||null;
    if(!state.city)return;
    try {
      const result=await data(`districts-${code}`);
      if($('#city').value!==code)return;
      state.districtData=result;
      fillSelect($('#district'),result.depts,'選擇鄉鎮市區','deptCode','deptName');
      $('#district').disabled=false;$('#district-line').classList.remove('dormant');
    } catch {$('#selection-status').textContent='資料暫時無法載入，請再選一次。';}
  });
  $('#district').addEventListener('change',() => {
    resetFollowing('district');
    state.district=state.districtData?.depts.find(d=>d.deptCode===$('#district').value)||null;
    if(!state.district)return;
    fillSelect($('#village'),state.district.lis,'選擇村里','liCode','liName');
    $('#village').disabled=false;$('#village-line').classList.remove('dormant');
  });
  $('#village').addEventListener('change',() => {
    state.overrides={};$('#extra-areas').replaceChildren();$('#selection-status').textContent='';
    state.village=state.district?.lis.find(v=>v.liCode===$('#village').value)||null;
    $('#get-ballots').disabled=!state.village;
    $('#voter-line').classList.toggle('dormant',!state.village);
  });
  $('#voter').addEventListener('change',()=>{state.overrides={};$('#extra-areas').replaceChildren();$('#selection-status').textContent='';});

  function areaMatches(area, dept, li, voter) {
    const voterMatches=!area.voterType||area.voterType===voter;
    const districtMatches=!area.depts||area.depts.includes(dept);
    const liMatches=!area.lis?.length||area.lis.includes(dept+li)||area.lis.includes(li);
    return voterMatches&&districtMatches&&liMatches;
  }
  function makeBallots(payloads, context) {
    const {city,district,village,voter}=context;
    const overrides=context.overrides||{};
    const code=city.prvCityCode,dept=district.deptCode,li=village.liCode;
    const ballots=[];
    const add=(type,title,area,candidates)=>{
      if(candidates?.length)ballots.push({type,title,area,candidates:[...candidates].sort((a,b)=>a.candNo-b.candNo),marks:[],done:false,color:palettes[type]});
    };
    const unavailable=(type,title,area)=>ballots.push({type,title,area,candidates:[],marks:[],done:true,unavailable:true,color:palettes[type]});
    const county=city.prvName.endsWith('縣');
    add('C1',county?'縣長':'市長',city.prvName,payloads.C1);
    let council=(payloads.T||[]).filter(area=>(!area.voterType||area.voterType===voter)&&(!area.depts||area.depts.includes(dept)));
    if(council.length>1)council=council.filter(area=>areaMatches(area,dept,li,voter));
    if(overrides.T)council=council.filter(area=>area.areaCode===overrides.T);
    if(council.length>1){const error=new Error('請選擇議員選區');error.selectionType='T';error.choices=council;throw error;}
    const c=council[0];
    const identity=voter==='02'?'山地原住民':voter==='03'?'平地原住民':'';
    if(c)add('T',`${identity}${county?'縣議員':'市議員'}`,c.areaName,c.cands);
    else unavailable('T',`${identity}${county?'縣議員':'市議員'}`,city.prvName);
    for(const type of ['D1','D2']) {
      const candidates=(payloads[type]||[]).filter(c=>c.deptCode===dept);
      const title=type==='D2'?'區長':district.deptName.endsWith('鄉')?'鄉長':district.deptName.endsWith('鎮')?'鎮長':'市長';
      add(type,title,city.prvName+district.deptName,candidates);
      if(type==='D1'&&county&&!candidates.length)unavailable(type,title,city.prvName+district.deptName);
    }
    for(const type of ['R','R3']) {
      const group=(payloads[type]||[]).find(x=>x.deptCode===dept);
      if(!group)continue;
      let areas=(group.areas||[]).filter(area=>areaMatches(area,dept,li,voter));
      // Some official representative files encode identity only in the area name.
      const explicit=areas.filter(area=>voter==='01'?!/原住民/.test(area.areaName):voter==='02'?/山地原住民/.test(area.areaName):/平地原住民/.test(area.areaName));
      if(explicit.length)areas=explicit;
      if(overrides[type])areas=areas.filter(area=>area.areaCode===overrides[type]);
      if(!areas.length){unavailable(type,type==='R3'?'區民代表':'鄉鎮市民代表',city.prvName+district.deptName);continue;}
      if(areas.length>1){const error=new Error('請選擇代表選區');error.selectionType=type;error.choices=areas;throw error;}
      add(type,type==='R3'?'區民代表':district.deptName.endsWith('鄉')?'鄉民代表':district.deptName.endsWith('鎮')?'鎮民代表':'市民代表',city.prvName+district.deptName+' '+areas[0].areaName,areas[0].cands);
    }
    const villageCandidates=(payloads.V1||[]).filter(c=>c.liCode===li);
    if(!villageCandidates.length)unavailable('V1',village.liName.endsWith('村')?'村長':'里長',city.prvName+district.deptName+village.liName);
    else add('V1',village.liName.endsWith('村')?'村長':'里長',city.prvName+district.deptName+village.liName,villageCandidates);
    ballots.push({type:'P22',title:'公投',area:'全國性第22案',referendum:true,question:'你是否支持政府使用「核電」振興經濟，以廢除「非核家園」的能源政策？',candidates:[],marks:[],done:false,color:palettes.P22});
    return ballots;
  }
  // Pure selection logic is also used by the data audit script.
  window.VoteData={makeBallots,areaMatches};
  $('#district-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(state.busy||!state.village)return;
    state.busy=true;$('#get-ballots').disabled=true;$('#selection-status').textContent='正在領票';
    const generation=state.generation;
    const city=state.city,district=state.district,village=state.village,voter=$('#voter').value;
    try {
      const code=city.prvCityCode;
      const allTypes=Object.values((await data(`types-${code}`)).types).flat();
      const types=[...new Set(allTypes)];
      const entries=await Promise.all(types.map(async type=>{
        const name=type==='V1'?`V1-${code}-${district.deptCode}`:`${type}-${code}`;
        let payload;
        if(type==='V1'){try{payload=await data(name);}catch{payload={V1:[]};}}
        else payload=await data(name);
        return [type,payload[type]];
      }));
      if(generation!==state.generation)return;
      state.ballots=makeBallots(Object.fromEntries(entries),{city,district,village,voter,overrides:state.overrides});
      state.active=-1;
      const place=city.prvName+' · '+district.deptName+' · '+village.liName;
      $('#place-name').textContent=place;$('#deposit-place').textContent=place;$('#results-place').textContent=city.prvName;
      $('#desk').classList.remove('has-paper','all-complete');
      $('#paper-stage').hidden=true;$('#tools').hidden=true;$('#deposit-ready').hidden=true;
      $('#desk-title').textContent='抽出你的選票';
      const missing=state.ballots.filter(b=>b.unavailable);
      $('#desk-note').textContent=missing.length?`${missing.map(b=>b.title).join('、')}資料待補 · 練習已確認票種`:'點一張，開始練習';
      $('#desk').classList.add('dealing');
      renderRack();show('desk');
      await wait(500+state.ballots.length*170);
      if(generation!==state.generation)return;
      $('#desk').classList.remove('dealing');$('#desk').classList.add('settling');
      await wait(1050);
      if(generation!==state.generation)return;
      $('#desk').classList.remove('settling');
      announce(`已領取${state.ballots.filter(b=>!b.unavailable).length}張選票，請抽出一張。`);
      $('#ballot-rack button:not(:disabled)')?.focus({preventScroll:true});
    } catch(error) {
      if(generation!==state.generation)return;
      if(error.choices?.length){
        const type=error.selectionType;const line=document.createElement('div');line.className='select-line';
        line.innerHTML=`<label for="extra-${type}">${type==='T'?'議員選區':'代表選區'}</label><div class="select-wrap"><select required id="extra-${type}"><option value="">選擇選區</option>${error.choices.map(area=>`<option value="${escapeText(area.areaCode)}">${escapeText(area.areaName)}</option>`).join('')}</select></div>`;
        $(`#extra-${type}`)?.closest('.select-line').remove();$('#extra-areas').append(line);
        $(`#extra-${type}`).addEventListener('change',e=>state.overrides[type]=e.target.value);
        $('#selection-status').textContent='依戶籍的代表選區選取。';
      }else $('#selection-status').textContent=error.message.includes('選區')?'這組選區資料待核對，請選擇其他選區。':'這組名單目前不完整，請選擇其他選區。';
    } finally {
      if(generation===state.generation){state.busy=false;$('#get-ballots').disabled=false;if(state.stage==='desk')$('#selection-status').textContent='';}
    }
  });
  $('#change-district')?.addEventListener('click',()=>{state.generation++;state.busy=false;state.ballots=[];state.active=-1;$('#get-ballots').disabled=!state.village;show('selection');});

  function renderRack() {
    $('#ballot-rack').replaceChildren();
    state.ballots.forEach((ballot,index)=>{
      const button=document.createElement('button');button.className='rack-ballot';
      button.style.setProperty('--i',index);button.style.setProperty('--paper',ballot.color);
      button.classList.toggle('done',ballot.done);button.classList.toggle('selected',index===state.active);
      button.disabled=!!ballot.unavailable;button.classList.toggle('unavailable',!!ballot.unavailable);
      button.setAttribute('aria-label',`${ballot.title}${ballot.unavailable?'，資料待補':ballot.done?'，已完成':''}`);
      button.innerHTML=`<span>${escapeText(ballot.title)}${ballot.unavailable?' · 待補':''}</span>`;
      button.addEventListener('click',()=>openBallot(index));
      $('#ballot-rack').append(button);
    });
    $('#progress-count').textContent=`${state.ballots.filter(b=>b.done&&!b.unavailable).length} / ${state.ballots.filter(b=>!b.unavailable).length}`;
  }
  function photoMarkup(candidate) {
    return candidate.img ? `<img src="assets/portraits/${escapeText(candidate.img.split('/').pop())}" alt="${escapeText(candidate.name)}" loading="lazy" draggable="false">` : '<span class="photo-unavailable" aria-label="公開資料未提供照片"></span>';
  }
  function openBallot(index) {
    if(state.busy||state.ballots[index]?.unavailable)return;
    releaseStamp();state.active=index;
    const ballot=state.ballots[index];
    $('#desk').classList.add('has-paper');$('#desk').classList.remove('all-complete');
    $('#deposit-ready').hidden=true;$('#paper-stage').hidden=false;$('#tools').hidden=false;
    $('#paper-stage').style.animation='none';void $('#paper-stage').offsetWidth;$('#paper-stage').style.animation='';
    const paper=$('#ballot-paper');paper.style.setProperty('--paper',ballot.color);paper.style.setProperty('--candidates',ballot.referendum?2:ballot.candidates.length);paper.classList.toggle('referendum-paper',!!ballot.referendum);
    const caption='<div class="ballot-caption"><span>僅供模擬</span><span>中央選舉委員會公開資料</span></div>';
    if(ballot.referendum){
      paper.innerHTML=`<div class="ballot-title referendum-title">全國性公民投票案第22案<small>公 民 投 票 票</small></div><div class="referendum-question">${escapeText(ballot.question)}</div><div class="referendum-table"><div><div class="referendum-mark" aria-label="同意圈選欄"></div><div class="referendum-choice">同意</div></div><div><div class="referendum-mark" aria-label="不同意圈選欄"></div><div class="referendum-choice">不同意</div></div></div>${caption}`;
    }else{
      paper.innerHTML=`<div class="ballot-title">115年${escapeText(ballot.area)}${escapeText(ballot.title)}選舉<small>選 舉 票</small></div><div class="ballot-table"><div class="ballot-column label-column" aria-hidden="true"><div class="mark-cell">圈選欄</div><div class="candidate-number">號次</div><div class="candidate-photo">相片</div><div class="candidate-name">姓名</div><div class="candidate-party">推薦政黨</div></div>${ballot.candidates.map(candidate=>`<div class="ballot-column" aria-label="${candidate.candNo}號 ${escapeText(candidate.name)} ${escapeText(candidate.party)}"><div class="mark-cell" data-no="${candidate.candNo}"></div><div class="candidate-number">${candidate.candNo}</div><div class="candidate-photo">${photoMarkup(candidate)}</div><div class="candidate-name">${candidateName(candidate.name)}</div><div class="candidate-party">${escapeText(candidate.party||'未提供')}</div></div>`).join('')}</div>${caption}`;
    }
    paper.querySelectorAll('.candidate-photo img').forEach(img=>img.addEventListener('error',()=>{img.parentElement.innerHTML='<span class="photo-unavailable" aria-label="照片無法載入"></span>';},{once:true}));
    ballot.marks.forEach(renderMark);
    $('#paper-scroll').scrollLeft=0;
    $('#paper-hint').textContent='';$('#desk-note').textContent=ballot.title+' · 可自由落印';
    $('#undo').disabled=!ballot.marks.length;
    renderRack();
    announce(ballot.referendum?'第22案公投票，同意與不同意皆可圈選。':`${ballot.title}，${ballot.candidates.length}位候選人。`);
  }
  function renderMark(mark) {
    const node=document.createElement('span');node.className='seal';node.style.left=mark.x+'%';node.style.top=mark.y+'%';node.style.setProperty('--rotation',mark.rotation+'deg');node.innerHTML=sealSVG;$('#ballot-paper').append(node);
  }
  function stampAt(clientX,clientY) {
    if(!state.holding||state.active<0)return;
    if(!state.inked){$('#paper-hint').textContent='先沾一下印泥';announce('先沾印泥');return;}
    const paper=$('#ballot-paper');
    // DOMMatrix converts the point back into the rotated paper's coordinate space.
    const rect=paper.getBoundingClientRect();
    const transform=new DOMMatrix(getComputedStyle(paper).transform);
    const origin=getComputedStyle(paper).transformOrigin.split(' ').map(parseFloat);
    const corners=[[0,0],[paper.offsetWidth,0],[0,paper.offsetHeight],[paper.offsetWidth,paper.offsetHeight]].map(([x,y])=>new DOMPoint(x-origin[0],y-origin[1]).matrixTransform(transform));
    const minX=Math.min(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y));
    const local=new DOMPoint(clientX-rect.left+minX,clientY-rect.top+minY).matrixTransform(transform.inverse());
    const x=(local.x+origin[0])/paper.offsetWidth*100,y=(local.y+origin[1])/paper.offsetHeight*100;
    if(x<0||y<0||x>100||y>100)return;
    const mark={x,y,rotation:Math.random()*18-9};
    state.ballots[state.active].marks.push(mark);renderMark(mark);
    $('#undo').disabled=false;$('#paper-hint').textContent='留下了，也可以再蓋';
    $('#cursor-stamp').classList.add('pressing');setTimeout(()=>$('#cursor-stamp').classList.remove('pressing'),150);
    announce('已蓋印');
  }
  function moveStamp(x,y) {$('#cursor-stamp').style.left=x+'px';$('#cursor-stamp').style.top=y+'px';}
  function pickStamp(x,y) {
    state.holding=true;state.inked=false;
    $('#cursor-stamp').hidden=false;$('#stamp').classList.add('picked');$('#stamp').setAttribute('aria-pressed','true');
    $('#ballot-paper').classList.add('armed');document.body.classList.add('holding-stamp');
    moveStamp(x,y);$('#paper-hint').textContent='沾一下印泥';
  }
  function releaseStamp() {
    state.holding=false;$('#cursor-stamp').hidden=true;$('#stamp').classList.remove('picked');$('#stamp').setAttribute('aria-pressed','false');$('#ballot-paper').classList.remove('armed');document.body.classList.remove('holding-stamp');
  }
  function ink() {
    if(!state.holding){$('#paper-hint').textContent='先拿起圈選章';return;}
    state.inked=true;$('#paper-hint').textContent='在選票上，留下你的選擇';
    $('#inkpad').classList.remove('inked');void $('#inkpad').offsetWidth;$('#inkpad').classList.add('inked');announce('已沾印泥');
  }
  let toolDrag=null,suppressStampClick=false;
  $('#stamp').addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    toolDrag={x:event.clientX,y:event.clientY,moved:false,id:event.pointerId};
    event.preventDefault();
  });
  $('#stamp').addEventListener('click',event=>{
    if(suppressStampClick){suppressStampClick=false;return;}
    const r=$('#stamp').getBoundingClientRect();state.holding?releaseStamp():pickStamp(event.clientX||r.x+r.width/2,event.clientY||r.y);
  });
  document.addEventListener('pointermove',event=>{
    if(state.holding)moveStamp(event.clientX,event.clientY);
    if(toolDrag&&Math.hypot(event.clientX-toolDrag.x,event.clientY-toolDrag.y)>8){toolDrag.moved=true;if(!state.holding)pickStamp(event.clientX,event.clientY);const target=document.elementFromPoint(event.clientX,event.clientY);if(target?.closest('#inkpad')&&!state.inked)ink();}
  });
  document.addEventListener('pointerup',event=>{
    if(!toolDrag)return;
    if(toolDrag.moved){const target=document.elementFromPoint(event.clientX,event.clientY);if(target?.closest('#inkpad'))ink();else if(target?.closest('#ballot-paper'))stampAt(event.clientX,event.clientY);suppressStampClick=true;setTimeout(()=>suppressStampClick=false,100);}
    toolDrag=null;
  });
  document.addEventListener('pointercancel',()=>{toolDrag=null;});
  $('#inkpad').addEventListener('click',ink);
  $('#ballot-paper').addEventListener('click',event=>{if(!toolDrag)stampAt(event.clientX,event.clientY);});
  $('#ballot-paper').addEventListener('pointerdown',event=>{if(state.holding&&event.pointerType==='mouse')event.preventDefault();});
  $('#ballot-paper').addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&state.holding){event.preventDefault();const rect=$('#ballot-paper').getBoundingClientRect();stampAt(rect.left+rect.width/2,rect.top+50);}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')releaseStamp();});
  window.addEventListener('blur',()=>{if(state.holding)$('#cursor-stamp').hidden=true;});
  window.addEventListener('focus',()=>{if(state.holding)$('#cursor-stamp').hidden=false;});
  $('#undo').addEventListener('click',()=>{if(state.active<0)return;state.ballots[state.active].marks.pop();$('#ballot-paper .seal:last-child')?.remove();$('#undo').disabled=!state.ballots[state.active].marks.length;});
  $('#finish-ballot').addEventListener('click',async()=>{
    if(state.active<0||state.busy)return;
    releaseStamp();state.ballots[state.active].done=true;state.active=-1;
    $('#paper-stage').hidden=true;$('#tools').hidden=true;$('#desk').classList.remove('has-paper');renderRack();
    const all=state.ballots.every(b=>b.done);
    $('#desk-title').textContent=all?'都準備好了':'還有你的下一票';
    $('#desk-note').textContent=all?'把練習，投進票箱':'點另一張，繼續練習';
    $('#desk').classList.toggle('all-complete',all);$('#deposit-ready').hidden=!all;
    if(all)$('#deposit-ready').focus({preventScroll:true});else $('#ballot-rack button:not(.done)')?.focus({preventScroll:true});
  });
  $('#deposit-ready').addEventListener('click',()=>{
    const ready=state.ballots.filter(b=>!b.unavailable);
    $('#folded-stack').innerHTML=ready.map((ballot,i)=>`<span class="folded-ticket" style="--i:${i};--paper:${ballot.color}">${i===ready.length-1?'<span>11/28</span>':''}</span>`).join('');
    $('#deposit').classList.remove('dropping');$('#drop').disabled=false;show('deposit');
  });
  async function dropBallots() {
    if(state.busy||state.stage!=='deposit')return;
    state.busy=true;$('#drop').disabled=true;
    $('#folded-stack').style.transform='';$('#deposit').classList.add('dropping');
    const generation=state.generation;
    await wait(1500);if(generation!==state.generation)return;
    $('#transition-shade').classList.add('shade');await wait(450);if(generation!==state.generation)return;
    if(!state.reports)state.reports=await data('reports').catch(()=>null);
    if(generation!==state.generation)return;
    renderResults();
    show('results');$('#transition-shade').classList.remove('shade');state.busy=false;
    announce('練習完成。11月28日，記得帶身分證、印章、投票通知單。');
  }
  $('#drop').addEventListener('click',dropBallots);$('#ballot-box').addEventListener('click',dropBallots);
  let paperDrag=null;
  $('#folded-stack').addEventListener('pointerdown',event=>{if(state.busy)return;paperDrag={x:event.clientX,y:event.clientY,id:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.style.cursor='grabbing';});
  $('#folded-stack').addEventListener('pointermove',event=>{if(!paperDrag)return;event.currentTarget.style.transform=`translate(${event.clientX-paperDrag.x}px,${event.clientY-paperDrag.y}px)`;});
  $('#folded-stack').addEventListener('pointerup',event=>{
    if(!paperDrag)return;paperDrag=null;event.currentTarget.style.cursor='grab';
    const box=$('#ballot-box').getBoundingClientRect();
    if(event.clientX>box.left&&event.clientX<box.right&&event.clientY>box.top-65&&event.clientY<box.bottom)dropBallots();
    else event.currentTarget.style.transform='';
  });
  $('#folded-stack').addEventListener('pointercancel',()=>{paperDrag=null;$('#folded-stack').style.transform='';});
  $('#see-reminder').addEventListener('click',()=>show('reminder'));
  function renderResults(){
    const code=state.city.prvCityCode;
    const turnout=state.reports?.turnout2022?.[code];
    $('#turnout-value').textContent=turnout?turnout.rate.toFixed(2):'—';
    $('#turnout-state').textContent=state.city.prvName+'・縣市長選舉';
    $('#turnout-source').href=state.reports?.turnoutSource||'https://db.cec.gov.tw/';
    const poll=state.reports?.polls?.[code];
    if(poll){
      const candidates=state.ballots.find(b=>b.type==='C1')?.candidates||[];
      const ordered=candidates.filter(c=>Object.hasOwn(poll.values,c.name));
      $('#poll-values').innerHTML=ordered.map(c=>`<div class="poll-row"><span>${escapeText(c.name)}</span><span>${poll.values[c.name].toFixed(1)}<small>%</small></span><i style="--support:${poll.values[c.name]}%"></i></div>`).join('');
      $('#poll-meta').textContent=`${poll.agency} · ${poll.published}\n調查 ${poll.fieldwork}`;
      $('#poll-source').textContent='調查資料';$('#poll-source').href=poll.source;$('#poll-source').hidden=false;
    }else{
      $('#poll-values').innerHTML='<p class="poll-empty">未有可核對資料</p>';$('#poll-meta').textContent='';$('#poll-source').hidden=true;
    }
  }
  data('reports').then(value=>state.reports=value).catch(()=>{});
  data('regions').then(regions=>{state.regions=regions;fillSelect($('#city'),regions,'選擇縣市','prvCityCode','prvName');}).catch(()=>{$('#selection-status').textContent='選區資料載入失敗，請重新整理。';});
})();
