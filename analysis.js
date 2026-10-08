/* 분석은 측정 기록의 사본을 사용합니다. 파일과 작성 내용은 서버로 전송하지 않습니다. */
const resultFieldIds=['resultPrediction','resultTrends','resultRole','resultNeutralization','resultTheory','resultExtension','resultConclusion','resultLimitations','resultColor'];
const requiredQuestionIds=['resultPrediction','resultTrends','resultRole','resultNeutralization','resultTheory','resultExtension'];
const authorIds=['authorGrade','authorClassroom','authorNumber','authorName'];
const resultFieldLabels=["1. 예상과 실제 결과 비교하기","2. 그래프에서 중요한 결과 찾기","3. 내가 실험에서 한 일 돌아보기","4. 온도, pH, 색깔의 변화 비교하기","5. 같은 5% 농도에 대해 생각하기","6. 다음 실험 계획하기","나의 결론","실험의 한계와 개선 방법 (추가 메모)","색깔 관찰 (추가 메모)"];
let analysisData={profile:null,set:null,points:[],live:[],sources:[]},analysisDirty=false,analysisReturnPage='welcome';
const analysisEl=id=>document.querySelector('#'+id);
function parseLabCSV(text){
 if(text.length>10*1024*1024)throw Error('파일이 너무 큽니다. 10 MB 이하의 원본 CSV를 선택하세요.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false,closed=false;
 const cell=()=>{row.push(value);value='';closed=false;};
 const line=()=>{cell();if(row.some(v=>v!==''))rows.push(row);row=[];if(rows.length>5001)throw Error('한 파일에 5,000개 이하의 측정 기록을 사용하세요.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c==='"'){if(value!==''||closed)throw Error('CSV의 따옴표 형식이 올바르지 않습니다. 원본 파일을 사용하세요.');quoted=true;}
  else if(c===',')cell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
  else{if(closed)throw Error('CSV의 구분 형식이 올바르지 않습니다.');value+=c;}
 }
 if(quoted)throw Error('CSV의 닫는 따옴표가 없습니다.');if(value!==''||row.length||closed)line();
 if(rows.length<2)throw Error('CSV에 측정 데이터가 없습니다.');
 const headers=rows.shift().map(x=>x.trim());const duplicates=headers.filter((h,i)=>headers.indexOf(h)!==i);if(duplicates.some(h=>h!=='번호')||headers.filter(h=>h==='번호').length!==2||headers[2]!=='번호')throw Error('원본 CSV의 학생 번호·측정 번호 열 형식을 확인하세요.');
 return {headers,rows};
}
function finiteValue(value,label,nullable=false){if(nullable&&(value===''||value===null||value===undefined))return null;if(value===null||value===undefined||String(value).trim()==='')throw Error(label+' 값이 비어 있습니다.');const n=Number(value);if(!Number.isFinite(n))throw Error(label+' 값이 숫자가 아닙니다.');return n;}
function profileKey(profile,set){return JSON.stringify([profile?.grade||'',profile?.classroom||'',profile?.studentNumber||'',profile?.studentName||'',profile?.groupName||'',set]);}
function cleanProfile(profile){if(!profile||typeof profile!=='object')throw Error('학생 정보가 없습니다.');const out={};for(const key of ['grade','classroom','studentNumber','studentName','groupName']){if(typeof profile[key]!=='string'||profile[key].length>100)throw Error('학생 정보 형식을 확인하세요.');out[key]=profile[key];}return out;}
function cleanAnalysisRow(r,kind){
 if(!r||typeof r!=='object')throw Error('측정 기록 형식이 올바르지 않습니다.');
 const ph=finiteValue(r.ph,'pH'),temperature=finiteValue(r.temperature,'온도',kind==='live'),elapsed=finiteValue(r.elapsed,'경과 시간');
 if(elapsed<0||temperature!==null&&(temperature < -55||temperature>125))throw Error('온도 또는 경과 시간의 범위를 확인하세요.');
 if(typeof r.state!=='string'||r.state.length>100||typeof r.time!=='string'||r.time.length>100)throw Error('측정 시각 또는 상태 형식을 확인하세요.');
 const set=finiteValue(r.setNumber,'세트 번호');if(!Number.isInteger(set)||set<1||set>8)throw Error('세트 번호는 1~8이어야 합니다.');
 const out={ph,temperature,elapsed,time:r.time,state:r.state,setNumber:set};
 if(kind==='points'){
  out.id=finiteValue(r.id,'번호');out.volume=finiteValue(r.volume,'투입 부피');out.waitSeconds=finiteValue(r.waitSeconds,'투입 후 경과',true);
  if(!Number.isInteger(out.id)||out.id<1||out.volume<0||out.waitSeconds!==null&&out.waitSeconds<0)throw Error('번호·부피·투입 후 경과의 범위를 확인하세요.');
  if(typeof r.color!=='string'||!['무색','붉은색','미기록',''].includes(r.color))throw Error('관찰 색깔은 무색 또는 붉은색이어야 합니다.');out.color=r.color||'미기록';
 }
 if(r.raw!==undefined&&r.raw!==''){out.raw=finiteValue(r.raw,'pH 원시값');if(out.raw<0||out.raw>1023)throw Error('pH 원시값의 범위를 확인하세요.');}
 // 원본 CSV는 중단 구간 번호를 보관하지 않습니다. 그래프에서 6초 이상의 간격을 따로 끊습니다.
 if(Number.isInteger(r.segment))out.segment=r.segment;
 return out;
}
function csvToAnalysis(text,name){
 const {headers,rows}=parseLabCSV(text),kind=headers.includes('누적 투입 부피(mL)')?'points':'live';
 const required=[...profileHeaders,'세트 번호','번호','시작 후 경과(초)','온도(℃)','pH','pH 원시값','측정 상태',...(kind==='points'?['누적 투입 부피(mL)','관찰 색깔','투입 후 경과(초)','저장 시각(노트북 현지 시간)']:['측정 시각(노트북 현지 시간)'])];
 if(required.some(h=>!headers.includes(h)))throw Error('이 프로그램에서 저장한 측정점 CSV 또는 전체 데이터 CSV를 선택하세요.');
 const get=(r,h)=>r[h==='번호'?headers.lastIndexOf(h):headers.indexOf(h)];let profile=null,set=null;const clean=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i];try{
   if(row.length!==headers.length)throw Error('열 개수가 일치하지 않습니다.');
   const p={grade:get(row,'학년'),classroom:get(row,'반'),studentNumber:get(row,'번호'),studentName:get(row,'이름'),groupName:get(row,'조 이름')};
   // 학생 번호와 측정점 번호는 열 이름이 서로 다릅니다. 원본의 학생 번호는 앞의 세 번째 열입니다.
   p.studentNumber=row[2];const sn=finiteValue(get(row,'세트 번호'),'세트 번호');
   if(profile&&profileKey(profile,set)!==profileKey(p,sn))throw Error('한 파일에 서로 다른 학생 정보 또는 세트가 섞여 있습니다.');profile=p;set=sn;
   clean.push(cleanAnalysisRow({id:get(row,'번호'),volume:get(row,'누적 투입 부피(mL)'),temperature:get(row,'온도(℃)'),ph:get(row,'pH'),raw:get(row,'pH 원시값'),elapsed:get(row,'시작 후 경과(초)'),time:get(row,kind==='points'?'저장 시각(노트북 현지 시간)':'측정 시각(노트북 현지 시간)'),state:get(row,'측정 상태'),setNumber:sn,color:get(row,'관찰 색깔'),waitSeconds:get(row,'투입 후 경과(초)')},kind));
  }catch(e){throw Error((i+2)+'행: '+e.message);}
 }
 return {kind,profile:cleanProfile(profile),set,rows:clean,name};
}
function validateAnalysisDataset(data){
 const profile=cleanProfile(data.profile),set=finiteValue(data.set,'세트 번호');if(!Number.isInteger(set)||set<1||set>8)throw Error('세트 번호를 확인하세요.');
 const out={profile,set,points:[],live:[],sources:[]};
 for(const kind of ['points','live']){if(!Array.isArray(data[kind])||data[kind].length>5000)throw Error('측정 기록은 종류별로 5,000개 이하이어야 합니다.');out[kind]=data[kind].map(r=>cleanAnalysisRow(r,kind));if(out[kind].some(r=>r.setNumber!==set))throw Error('한 실험의 세트 번호가 일치하지 않습니다.');out[kind].sort((a,b)=>a.elapsed-b.elapsed);}
 if(!out.points.length&&!out.live.length)throw Error('분석할 측정 기록이 없습니다.');
 const ids=new Set();let previous=-Infinity;for(const p of out.points){if(ids.has(p.id))throw Error('측정점 번호가 중복됩니다. 한 실험의 CSV를 사용하세요.');ids.add(p.id);if(p.volume<previous)throw Error('시간 순서대로 투입 부피가 감소합니다. 한 실험의 원본 CSV를 확인하세요.');previous=p.volume;}
 if(Array.isArray(data.sources))out.sources=data.sources.slice(0,4).map(s=>String(s).slice(0,200));return out;
}
function summarizeAnalysis(data){
 const p=data.points,validT=p.filter(r=>r.temperature!==null);const peak=validT.reduce((a,r)=>!a||r.temperature>a.temperature?r:a,null),baseline=p.find(r=>r.volume===0&&r.temperature!==null)||null;
 const firstRed=p.find(r=>r.color==='붉은색')||null;let steep=null;const seven=[];
 for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],dv=b.volume-a.volume;if(dv<=0)continue;const rate=Math.abs(b.ph-a.ph)/dv;if(!steep||rate>steep.rate)steep={a,b,rate};if((a.ph<7&&b.ph>7)||(a.ph>7&&b.ph<7))seven.push([a.volume,b.volume]);}
 const exactSeven=p.filter(r=>r.ph===7).map(r=>r.volume);
 return {peak,baseline,firstRed,steep,seven,exactSeven,outside:p.filter(r=>r.ph<4||r.ph>10||r.state.includes('보정 범위 밖')).length};
}
function formatAnalysisProfile(p,set){return p?`${p.grade}학년 ${p.classroom}반 ${p.studentNumber}번 · ${p.studentName} · ${p.groupName} · ${set}번 세트`:'CSV에 포함된 학생 정보가 여기에 표시됩니다.';}
function appendStat(label,value,note){const card=document.createElement('div');card.className='stat-card';for(const [tag,text] of [['span',label],['strong',value],['small',note]]){const el=document.createElement(tag);el.textContent=text;card.appendChild(el);}analysisEl('analysisStats').appendChild(card);}
function renderAnalysis(){
 const d=analysisData,s=summarizeAnalysis(d);analysisEl('analysisProfile').textContent=formatAnalysisProfile(d.profile,d.set);analysisEl('analysisSource').textContent=`측정점 ${d.points.length}개 · 연속 기록 ${d.live.length}개`+(d.sources.length?' · '+d.sources.join(' / '):'');analysisEl('analysisStats').replaceChildren();
 appendStat('저장한 측정점 중 최고 온도',s.peak?`${s.peak.temperature.toFixed(2)} ℃ · ${s.peak.volume.toFixed(2)} mL`:'측정점 데이터 필요','중화 지점으로 자동 판정하지 않습니다.');
 appendStat('처음 붉은색이 기록된 측정점',s.firstRed?`${s.firstRed.volume.toFixed(2)} mL · pH ${s.firstRed.ph.toFixed(2)}`:'붉은색 기록 없음','첫 기록 이전의 정확한 색 변화 시점은 알 수 없습니다.');
 appendStat('측정점 사이 pH 변화가 가장 큰 구간',s.steep&&s.steep.rate>0?`${s.steep.a.volume.toFixed(2)}~${s.steep.b.volume.toFixed(2)} mL`:'비교할 변화 없음','단위 부피당 pH 변화량 기준 · 급변 구간 후보입니다.');
 const intervals=s.seven.map(v=>v.map(x=>x.toFixed(2)).join('~')+' mL');
 appendStat('pH 7을 사이에 둔 측정점 구간',intervals.length?intervals.join(' / '):s.exactSeven.length?s.exactSeven.map(x=>x.toFixed(2)+' mL').join(' / '):'해당 구간 기록 없음',s.exactSeven.length?'pH 7.00 측정점: '+s.exactSeven.map(x=>x.toFixed(2)+' mL').join(', '):'중간 부피에서 pH 7을 직접 측정한 것은 아닙니다.');
 const warnings=[];if(d.points.some(p=>p.volume>0&&(p.waitSeconds===null||Math.abs(p.waitSeconds-120)>10)))warnings.push('투입 후 경과가 2분과 다르거나 기록되지 않은 측정점이 있습니다. 시간 조건을 확인하세요.');if(d.points.some((p,i)=>i&&p.volume===d.points[i-1].volume))warnings.push('같은 부피의 측정점이 있습니다. pH 변화 구간 요약에서는 부피가 증가하는 쌍만 비교합니다.');if(d.live.some(r=>r.temperature===null))warnings.push('온도 오류 값은 온도 그래프에서 제외합니다.');analysisEl('analysisWarnings').textContent=warnings.join(' ');
 drawChart('analysisVolumeTemperature',d.points,'volume','temperature','누적 투입 부피(mL)','온도(℃)','#386d80');drawChart('analysisVolumePH',d.points,'volume','ph','누적 투입 부피(mL)','pH','#8a6599');drawChart('analysisTimeTemperature',d.live,'elapsed','temperature','기록 시작 후 경과 시간(초)','온도(℃)','#386d80');drawChart('analysisTimePH',d.live,'elapsed','ph','기록 시작 후 경과 시간(초)','pH','#8a6599');
 analysisEl('analysisRows').replaceChildren();for(const p of d.points){const tr=document.createElement('tr');for(const v of [p.id,p.volume.toFixed(2),p.temperature.toFixed(2),p.ph.toFixed(2),p.color,p.waitSeconds===null?'—':p.waitSeconds.toFixed(1),p.state]){const td=document.createElement('td');td.textContent=String(v);tr.appendChild(td);}analysisEl('analysisRows').appendChild(tr);}refreshAnalysisCompletion();
}
function reportValues(){return Object.fromEntries(resultFieldIds.map(id=>[id,analysisEl(id).value]));}
function refreshAnalysisCompletion(){const completed=requiredQuestionIds.filter(id=>analysisEl(id).value.trim()).length;analysisEl('analysisCompletion').textContent=`측정점 ${analysisData.points.length}개 · 연속 기록 ${analysisData.live.length}개 · 질문 ${completed}/6개 · 결론 ${analysisEl('resultConclusion').value.trim()?'작성':'미작성'}`+(analysisDirty?' · 저장하지 않은 변경 내용이 있습니다.':'');}
function analysisStatus(text){analysisEl('analysisImportStatus').textContent=text;}
function openAnalysisPage(from){analysisReturnPage=from;showNotebookPage('analysis');renderAnalysis();}
analysisEl('openAnalysis').onclick=()=>openAnalysisPage('experiment');analysisEl('openSavedAnalysis').onclick=()=>openAnalysisPage('welcome');analysisEl('analysisBack').onclick=()=>showNotebookPage(analysisReturnPage);
analysisEl('useMeasuredData').onclick=()=>{
 if(recording){analysisStatus('먼저 측정 화면에서 기록 종료를 누르세요.');return;}
 try{const candidate=validateAnalysisDataset({profile:studentProfile,set:Number(setNumber.value),points,live:records,sources:['현재 측정 데이터의 사본']});analysisData=candidate;analysisDirty=true;const prediction=['온도: '+analysisEl('predictTemperature').value,'pH: '+analysisEl('predictPH').value,'색깔: '+analysisEl('predictColor').value];if(!analysisEl('resultPrediction').value&&['predictTemperature','predictPH','predictColor'].some(id=>analysisEl(id).value.trim()))analysisEl('resultPrediction').value=prediction.join('\n');renderAnalysis();analysisStatus('현재 측정 데이터의 사본을 가져왔습니다. 작성한 글은 유지됩니다.');}catch(e){analysisStatus(e.message);}
};
analysisEl('analysisCSV').onchange=async event=>{
 const files=Array.from(event.target.files);if(!files.length)return;analysisEl('analysisCSV').disabled=true;
 try{
  if(files.length>2)throw Error('측정점 CSV와 전체 데이터 CSV를 하나씩, 최대 두 개 선택하세요.');
  const imported=[];for(const file of files){if(file.size>10*1024*1024)throw Error('10 MB 이하의 CSV를 선택하세요.');imported.push(csvToAnalysis(await file.text(),file.name));}
  if(new Set(imported.map(x=>x.kind)).size!==imported.length)throw Error('같은 종류의 파일 두 개를 함께 선택할 수 없습니다.');
  const first=imported[0];if(imported.some(x=>profileKey(x.profile,x.set)!==profileKey(first.profile,first.set)))throw Error('두 CSV의 학생 정보 또는 세트 번호가 다릅니다. 같은 실험의 두 파일을 선택하세요.');
  const keep=analysisData.profile&&profileKey(analysisData.profile,analysisData.set)===profileKey(first.profile,first.set);let candidate={profile:first.profile,set:first.set,points:keep?analysisData.points:[],live:keep?analysisData.live:[],sources:[]};
  if(!keep&&analysisData.profile&&imported.length===1)throw Error('다른 학생 또는 세트의 데이터입니다. 같은 실험 파일을 선택하거나 새로고침 후 불러오세요. 작성 내용은 먼저 저장하세요.');
  if(!keep&&analysisData.profile)throw Error('기존 분석과 학생 정보 또는 세트가 다릅니다. 작성 내용을 저장한 뒤 새로고침하여 새 실험을 분석하세요.');
  for(const part of imported)candidate[part.kind]=part.rows;
  candidate.sources=[...new Set([...(keep?analysisData.sources:[]),...imported.map(x=>x.name)])].slice(-4);
  analysisData=validateAnalysisDataset(candidate);analysisDirty=true;renderAnalysis();analysisStatus('CSV를 불러왔습니다. 같은 종류의 기존 분석 데이터는 새 파일로 교체됐으며, 작성한 글은 유지됩니다.');
 }catch(e){analysisStatus('불러오지 못했습니다: '+e.message);}finally{event.target.value='';analysisEl('analysisCSV').disabled=false;}
};
for(const id of [...resultFieldIds,...authorIds])analysisEl(id).oninput=()=>{analysisDirty=true;refreshAnalysisCompletion();};
function reportAuthor(){return Object.fromEntries(authorIds.map(id=>[id,analysisEl(id).value.trim()]));}
function validateReportAuthor(value){if(!value||typeof value!=='object')throw Error('작성 학생 정보 형식을 확인하세요.');const out={};for(const id of authorIds){if(typeof value[id]!=='string'||value[id].length>100)throw Error('작성 학생 정보 형식을 확인하세요.');out[id]=value[id];}return out;}
function authorDescription(){const a=reportAuthor();return a.authorGrade+'학년 '+a.authorClassroom+'반 '+a.authorNumber+'번 · '+a.authorName;}
function saveAnalysisFile(filename,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function analysisFilename(extension){return 'neutralization_report_'+localTimestamp(new Date()).replace(/[: .]/g,'-')+'.'+extension;}
analysisEl('saveAnalysisDraft').onclick=()=>{
 if(!analysisData.profile){analysisStatus('먼저 현재 측정 데이터 또는 CSV를 가져오세요.');return;}
 const draft={format:'neutralization-lab-report',version:2,savedAt:localTimestamp(new Date()),data:analysisData,author:reportAuthor(),answers:reportValues()};saveAnalysisFile(analysisFilename('json'),JSON.stringify(draft,null,2),'application/json;charset=utf-8');analysisDirty=false;refreshAnalysisCompletion();analysisStatus('작성 내용 파일을 저장했습니다. 다음에 이 파일을 열어 이어서 작성할 수 있습니다.');
};
analysisEl('analysisDraft').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;
 try{if(file.size>10*1024*1024)throw Error('10 MB 이하의 작성 내용 파일을 선택하세요.');const draft=JSON.parse(await file.text());if(draft.format!=='neutralization-lab-report'||![1,2].includes(draft.version))throw Error('이 프로그램의 작성 내용 파일이 아닙니다.');const data=validateAnalysisDataset(draft.data);const answers={};for(const id of resultFieldIds){const value=draft.version===1&&id==='resultRole'?'':draft.answers?.[id];if(typeof value!=='string'||value.length>5000)throw Error('작성 내용 형식을 확인하세요.');answers[id]=value;}
  const author=draft.version===1?Object.fromEntries(authorIds.map(id=>[id,''])):validateReportAuthor(draft.author);
  if(analysisDirty){analysisStatus('현재 분석에 저장하지 않은 변경 내용이 있습니다. 작성 내용 저장 후 다시 파일을 선택하세요.');return;}
  analysisData=data;for(const id of authorIds)analysisEl(id).value=author[id];for(const id of resultFieldIds)analysisEl(id).value=answers[id];analysisDirty=false;renderAnalysis();analysisStatus(draft.version===1?'이전 작성 내용을 복원했습니다. 새 질문에 맞게 답변을 검토하고 작성 학생 정보와 나의 역할을 추가하세요.':'저장한 데이터와 개인 작성 내용을 복원했습니다.');
 }catch(e){analysisStatus('작성 내용을 열지 못했습니다: '+e.message);}finally{event.target.value='';}
};
function escapeReport(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function canSaveReport(){if(!analysisData.profile||!analysisData.points.length&&!analysisData.live.length){analysisStatus('먼저 분석할 데이터를 가져오세요.');return false;}const a=reportAuthor();const valid=[['authorGrade',3],['authorClassroom',99],['authorNumber',99]];for(const [id,max] of valid){const n=Number(a[id]);if(!Number.isInteger(n)||n<1||n>max){analysisStatus('보고서를 작성하는 학생의 학년·반·번호를 확인하세요.');analysisEl(id).focus();return false;}}if(!a.authorName){analysisStatus('보고서 작성 학생의 이름을 입력하세요.');analysisEl('authorName').focus();return false;}const missing=requiredQuestionIds.find(id=>!analysisEl(id).value.trim());if(missing){analysisStatus('1~6번 질문에 모두 답해주세요.');analysisEl(missing).focus();return false;}if(!analysisEl('resultConclusion').value.trim()){analysisStatus('나의 결론을 작성한 뒤 보고서를 저장하세요.');analysisEl('resultConclusion').focus();return false;}return true;}
function buildAnalysisReport(){
 const profile=escapeReport(formatAnalysisProfile(analysisData.profile,analysisData.set));const charts=[['analysisVolumeTemperature','투입 부피–온도'],['analysisVolumePH','투입 부피–pH'],['analysisTimeTemperature','시간–온도'],['analysisTimePH','시간–pH']].map(([id,title])=>'<section class="chart"><h3>'+title+'</h3>'+analysisEl(id).outerHTML+'<p>'+escapeReport(analysisEl(id+'Note').textContent)+'</p></section>').join('');
 const answers=resultFieldIds.map((id,i)=>'<section><h2>'+resultFieldLabels[i]+'</h2><p class="answer">'+escapeReport(analysisEl(id).value.trim()||'미작성')+'</p></section>').join('');
 const rows=analysisData.points.map(p=>'<tr>'+[p.id,p.volume.toFixed(2),p.temperature.toFixed(2),p.ph.toFixed(2),p.color,p.waitSeconds===null?'—':p.waitSeconds.toFixed(1),p.state].map(v=>'<td>'+escapeReport(v)+'</td>').join('')+'</tr>').join('');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>중화 반응 실험 보고서</title><style>body{max-width:1100px;margin:32px auto;padding:0 24px;color:#29433e;font:15px/1.8 "Nanum Gothic","Malgun Gothic",sans-serif}h1{font-size:28px}h2{font-size:19px;margin-top:26px}h3{font-size:16px}.graphs{display:grid;grid-template-columns:1fr 1fr;gap:18px}.chart{border:1px solid #ddd;padding:12px;border-radius:8px}.chart svg{width:100%;height:auto}.answer{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:8px;border:1px solid #ddd;text-align:center;overflow-wrap:anywhere}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.stat-card{border:1px solid #ddd;padding:12px}.stat-card strong,.stat-card small{display:block}small{font-size:12px;color:#66786e}@media(max-width:650px){.graphs,.stats{grid-template-columns:1fr}.table-wrap{overflow:auto}}@media print{body{margin:0;padding:0;font-size:11pt}.chart,.stat-card{break-inside:avoid}h2{break-after:avoid}}</style></head><body><h1>산과 염기를 혼합할 때 용액의 변화 알아보기</h1><p><strong>보고서 작성 학생: </strong>'+escapeReport(authorDescription())+'</p><p><strong>조별 원본 측정 정보: </strong>'+profile+'</p><small>보고서 생성: '+escapeReport(localTimestamp(new Date()))+' · 측정점 '+analysisData.points.length+'개 · 연속 기록 '+analysisData.live.length+'개</small><p>분석 파일: '+escapeReport(analysisData.sources.join(' / '))+'</p><div class="stats">'+analysisEl('analysisStats').innerHTML+'</div><p>'+escapeReport(analysisEl('analysisWarnings').textContent)+'</p><div class="graphs">'+charts+'</div><small>갈색 pH 점은 보정 범위(4~10) 밖의 추정값입니다. 연결선은 중간 부피의 실측값을 뜻하지 않습니다. 자동 요약은 중화 지점을 판정하지 않습니다. 시간 그래프에서 중단 구간은 선을 끊습니다.</small>'+answers+'<h2>저장한 측정점 전체 표</h2><div class="table-wrap"><table><thead><tr><th>번호</th><th>부피(mL)</th><th>온도(℃)</th><th>pH</th><th>색깔</th><th>투입 후 경과(초)</th><th>상태</th></tr></thead><tbody>'+rows+'</tbody></table></div><p>원본 측정점 CSV와 전체 데이터 CSV를 보고서와 함께 보관하세요.</p></body></html>';
}
analysisEl('saveAnalysisReport').onclick=()=>{if(!canSaveReport())return;renderAnalysis();saveAnalysisFile(analysisFilename('html'),buildAnalysisReport(),'text/html;charset=utf-8');analysisStatus('보고서를 저장했습니다. 이어서 수정하려면 작성 내용 파일도 저장하세요.');};
analysisEl('printAnalysis').onclick=()=>{if(!canSaveReport())return;const detail=analysisEl('analysisTableDetails'),wasOpen=detail.open;detail.open=true;const saved=resultFieldIds.map(id=>{const el=analysisEl(id),old=el.style.height;el.style.height='auto';el.style.height=el.scrollHeight+'px';return [el,old];});try{window.print();}finally{detail.open=wasOpen;for(const [el,height] of saved)el.style.height=height;}};
window.addEventListener('beforeunload',event=>{if(analysisDirty){event.preventDefault();event.returnValue='';}});
renderAnalysis();
