/* 브라우저 내부 저장. USB 권한과 활성 측정 상태는 복원하지 않습니다. */
const sessionEl=id=>document.getElementById(id);
const predictionIds=['predictTemperature','predictPH','predictColor'];
const sessionChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('neutralization-session-owner'):null;
if(sessionChannel)sessionChannel.onmessage=()=>{sessionReady=false;sessionEl('autosaveStatus').textContent='다른 탭에서 이 실험을 열었습니다. 이 탭의 자동 저장을 멈췄습니다. 최신 기록은 한 탭에서만 이어가세요. 필요한 경우 전체 이어하기 파일을 저장하세요.';};
function claimSession(){if(sessionChannel)sessionChannel.postMessage('active');}
let sessionDB=null,pendingSession=null,sessionReady=false,sessionDirty=false,sessionSaving=false,sessionRevision=0;
function markSessionChanged(){sessionDirty=true;sessionRevision++;}
function sessionFields(ids){return Object.fromEntries(ids.map(id=>[id,sessionEl(id).value]));}
function captureSession(){return {format:'neutralization-session',version:1,savedAt:Date.now(),profile:studentProfile,form:sessionFields(['grade','classroom','studentNumber','studentName','groupName']),predictions:sessionFields(predictionIds),measurement:{set:Number(setNumber.value),startedAt,records,points,nextPointId,recordSegment,pointRevision,exportedPointRevision,exportedCount,initial:initialReading.value,current:currentReading.value,color:sessionEl('solutionColor').value,timerAt:timerStartedAt===null?null:Date.now()-timerElapsed()*1000},analysis:analysisData,virtual:virtualData,virtualForm:sessionFields(['virtualInitialVolume','virtualConditions']),author:reportAuthor(),answers:reportValues(),page:['guide','experiment','analysis'].find(id=>!sessionEl(id).hidden)||'welcome'};}
function validateSession(s){
 if(!s||s.format!=='neutralization-session'||s.version!==1||!Number.isFinite(s.savedAt))throw Error('이 프로그램의 전체 이어하기 파일이 아닙니다.');
 const strings=(obj,ids,max)=>{if(!obj||ids.some(id=>typeof obj[id]!=='string'||obj[id].length>max))throw Error('작성 내용 형식을 확인하세요.');};
 strings(s.form,['grade','classroom','studentNumber','studentName','groupName'],100);strings(s.predictions,predictionIds,1000);strings(s.answers,resultFieldIds,5000);validateReportAuthor(s.author);if(s.profile)cleanProfile(s.profile);
 const m=s.measurement;if(!m||!Number.isInteger(m.set)||m.set<1||m.set>8||!Array.isArray(m.records)||!Array.isArray(m.points)||m.records.length>50000||m.points.length>50000)throw Error('측정 기록 형식을 확인하세요.');
 if((m.records.length||m.points.length)&&(!s.profile||!Number.isFinite(m.startedAt)||m.startedAt<=0))throw Error('측정 시작 정보가 없습니다.');
 if(m.records.length||m.points.length)validateAnalysisDataset({profile:s.profile,set:m.set,live:m.records,points:m.points});
 for(const p of m.points){for(const key of ['initial','current','raw'])if(!Number.isFinite(p[key])||p[key]<0)throw Error('측정점 눈금 정보를 확인하세요.');if(p.current<p.initial||Math.abs(p.current-p.initial-p.volume)>0.011||typeof p.sampleTime!=='string')throw Error('측정점 부피 정보를 확인하세요.');}
 for(const r of m.records)if(!Number.isFinite(r.raw)||r.raw<0||r.raw>1023)throw Error('센서 원시값을 확인하세요.');
 for(const key of ['nextPointId','recordSegment','pointRevision','exportedPointRevision','exportedCount'])if(!Number.isInteger(m[key])||m[key]<0)throw Error('기록 상태를 확인하세요.');
 strings(m,['initial','current','color'],100);if(!['무색','붉은색'].includes(m.color)||m.timerAt!==null&&(!Number.isFinite(m.timerAt)||m.timerAt>Date.now()))throw Error('관찰 상태를 확인하세요.');
 if(!s.analysis||!Array.isArray(s.analysis.points)||!Array.isArray(s.analysis.live))throw Error('분석 데이터 형식을 확인하세요.');if(s.analysis.profile)validateAnalysisDataset(s.analysis);else if(s.analysis.points.length||s.analysis.live.length)throw Error('분석 학생 정보가 없습니다.');validateVirtualData(s.virtual);if(s.virtualForm)strings(s.virtualForm,['virtualInitialVolume','virtualConditions'],1000);
 if(!['welcome','guide','experiment','analysis'].includes(s.page))throw Error('화면 정보를 확인하세요.');return s;
}
function applySession(s){
 validateSession(s);const m=s.measurement;studentProfile=s.profile;for(const [id,value] of Object.entries(s.form))if(['grade','classroom','studentNumber','studentName','groupName'].includes(id))sessionEl(id).value=value;
 for(const id of predictionIds)sessionEl(id).value=s.predictions[id];for(const id of authorIds)sessionEl(id).value=s.author[id];for(const id of resultFieldIds)sessionEl(id).value=s.answers[id];
 records=m.records;points=m.points;startedAt=m.startedAt;nextPointId=points.reduce((n,p)=>Math.max(n,p.id+1),Math.max(1,m.nextPointId));recordSegment=m.recordSegment+1;pointRevision=m.pointRevision;exportedPointRevision=m.exportedPointRevision;exportedCount=m.exportedCount;
 recording=false;latestSample=null;lastReceived=0;deletedPoint=null;sessionEl('undoDelete').hidden=true;setNumber.value=String(m.set);initialReading.value=m.initial;currentReading.value=m.current;initialReading.disabled=points.length>0;sessionEl('solutionColor').value=m.color;timerStartedAt=m.timerAt===null?null:performance.now()-(Date.now()-m.timerAt);
 analysisData=s.analysis;analysisDirty=false;restoreVirtualData(s.virtual);sessionEl('studentSummary').textContent=studentProfile?formatAnalysisProfile(studentProfile,m.set):'';
 recordTable.replaceChildren();for(const r of records.slice(-5).reverse()){const tr=document.createElement('tr');for(const v of [records.indexOf(r)+1,shortTime(r.time),r.elapsed.toFixed(1),r.temperature===null?'—':r.temperature.toFixed(2),r.ph.toFixed(2),r.state]){const td=document.createElement('td');td.textContent=String(v);tr.appendChild(td);}recordTable.appendChild(tr);}
 clearValue();renderPointsTable();renderVolumeCharts();renderTimeCharts();renderAnalysis();renderTimer();refreshRecording('이전 기록 복원');recordStatus.textContent='이전 기록 복원 · '+records.length+'개 · USB를 다시 연결한 뒤 기록 재개';
 if(s.virtualForm)for(const id of ['virtualInitialVolume','virtualConditions'])sessionEl(id).value=s.virtualForm[id];
 showNotebookPage(s.page==='analysis'?'analysis':s.profile?s.page:'welcome');sessionEl('resumePanel').hidden=true;pendingSession=null;sessionReady=true;claimSession();markSessionChanged();updateStudentGuidance();
}
function sessionRequest(mode,action){return new Promise((resolve,reject)=>{const tx=sessionDB.transaction('sessions',mode);let result;try{const req=action(tx.objectStore('sessions'));req.onsuccess=()=>{result=req.result;};}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('저장이 중단됐습니다.'));});}
async function persistSession(){if(!sessionReady||!sessionDirty||sessionSaving||!sessionDB)return;sessionSaving=true;const revision=sessionRevision;try{const snapshot=captureSession();await sessionRequest('readwrite',store=>store.put(snapshot,'current'));sessionDirty=sessionRevision!==revision;sessionEl('autosaveStatus').textContent='마지막 자동 저장: '+new Date(snapshot.savedAt).toLocaleTimeString('ko-KR')+' · 이 브라우저에 저장됨';}catch(e){sessionEl('autosaveStatus').textContent='자동 저장 실패 · 전체 이어하기 파일을 저장하세요. ('+e.message+')';}finally{sessionSaving=false;}}
async function initializeSession(){try{sessionDB=await new Promise((resolve,reject)=>{const req=indexedDB.open('neutralization-notebook',1);req.onupgradeneeded=()=>req.result.createObjectStore('sessions');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});pendingSession=await sessionRequest('readonly',store=>store.get('current'));if(pendingSession){validateSession(pendingSession);sessionEl('resumeDescription').textContent=new Date(pendingSession.savedAt).toLocaleString('ko-KR')+' 저장 · '+(pendingSession.profile?.studentName||pendingSession.form.studentName||'작성 중')+' · '+pendingSession.measurement.records.length+'개 기록';sessionEl('resumePanel').hidden=false;sessionEl('autosaveStatus').textContent='이전 기록이 있습니다. 이어하기 또는 이전 기록 지우기를 선택하세요.';sessionEl('welcome').inert=true;sessionEl('resumeSession').focus();}else{sessionReady=true;claimSession();sessionEl('autosaveStatus').textContent='자동 저장 준비 완료 · 작성 내용과 측정값을 약 5초마다 저장합니다.';}}catch(e){sessionReady=!pendingSession;sessionEl('autosaveStatus').textContent='자동 저장을 사용할 수 없습니다. 전체 이어하기 파일을 저장하세요. ('+e.message+')';if(pendingSession)sessionEl('resumePanel').hidden=false;}}
async function startNewSession(){if(port||recording){sessionEl('autosaveStatus').textContent='먼저 기록을 종료하고 아두이노 연결을 해제하세요.';return;}if(!confirm('이 브라우저에 남은 학생 정보·측정값·답변을 지우고 새로 시작할까요? 필요한 파일을 먼저 저장하세요.'))return;try{if(sessionDB)await sessionRequest('readwrite',store=>store.delete('current'));sessionReady=false;sessionDirty=false;location.reload();}catch(e){sessionEl('autosaveStatus').textContent='이전 기록을 지우지 못했습니다: '+e.message;}}
sessionEl('resumeSession').onclick=()=>{try{sessionEl('welcome').inert=false;applySession(pendingSession);persistSession();}catch(e){sessionEl('autosaveStatus').textContent='복원하지 못했습니다: '+e.message;}};
sessionEl('newSession').onclick=sessionEl('discardSession').onclick=startNewSession;
sessionEl('saveSessionFile').onclick=()=>{try{const s=pendingSession||captureSession();saveAnalysisFile('neutralization_session_'+Date.now()+'.json',JSON.stringify(s),'application/json;charset=utf-8');sessionEl('autosaveStatus').textContent='전체 이어하기 파일 다운로드를 요청했습니다. 다운로드 목록을 확인하세요.';}catch(e){sessionEl('autosaveStatus').textContent='이어하기 파일 저장 실패: '+e.message;}};
sessionEl('loadSessionFile').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(port||recording)throw Error('먼저 기록 종료와 연결 해제를 해주세요.');if(file.size>50*1024*1024)throw Error('50 MB 이하의 파일을 선택하세요.');const s=validateSession(JSON.parse(await file.text()));if(!confirm('현재 화면의 기록과 답변을 파일 내용으로 바꿀까요? 필요한 내용은 먼저 저장하세요.'))return;sessionEl('welcome').inert=false;applySession(s);await persistSession();}catch(e){sessionEl('autosaveStatus').textContent='이어하기 파일을 열지 못했습니다: '+e.message;}finally{event.target.value='';}};
function updateStudentGuidance(){
 const zero=points.some(p=>p.volume===0),v=readVolume();let message;
 if(!recording&&records.length)message='⑦ 기록이 종료됐습니다. 두 CSV를 저장하고 결과 분석으로 이동하세요. 다시 측정하려면 USB 연결 후 기록 재개를 누르세요.';
 else if(!lastReceived)message='① 아두이노를 연결하고 온도와 pH 수신을 확인하세요.';
 else if(!recording)message='② 기록 시작을 누르고 초기·현재 눈금을 같게 입력하세요.';
 else if(!zero)message='② 용액 투입 전, 누적 0 mL 측정점을 저장하세요.';
 else if(timerStartedAt===null)message='③ 용액을 넣고 타이머 리셋을 누르세요.';
 else if(timerElapsed()<120)message='④ 이번 투입 후 2분이 될 때까지 관찰하세요.';
 else if(points.length&&points[points.length-1].waitSeconds!==null&&points[points.length-1].receivedAt&&points[points.length-1].receivedAt>=Date.now()-timerElapsed()*1000)message='⑥ 이번 측정점을 저장했습니다. 다음 용액 투입 후 타이머를 리셋하거나 기록을 종료하세요.';
 else message='⑤ 현재 눈금과 색깔을 확인한 뒤 측정점을 저장하세요.';
 sessionEl('nextExperimentStep').textContent=message;sessionEl('pointConfirmation').textContent=v.error?'저장 전 초기·현재 눈금을 확인하세요.':'저장할 값: 누적 '+v.volume.toFixed(2)+' mL · '+sessionEl('solutionColor').value+' · 부피와 색깔을 확인한 뒤 저장하세요.';
 sessionEl('measurementSaveChecklist').textContent='측정점 CSV: '+(!points.length?'기록 없음':pointRevision===exportedPointRevision?'다운로드 요청 완료':'저장 필요')+' / 전체 CSV: '+(!records.length?'기록 없음':records.length===exportedCount?'다운로드 요청 완료':'저장 필요');
}
document.addEventListener('input',markSessionChanged);document.addEventListener('change',markSessionChanged);document.addEventListener('click',()=>{markSessionChanged();setTimeout(updateStudentGuidance,0);});
const originalRecordSample=recordSample;recordSample=function(...args){originalRecordSample(...args);if(recording)markSessionChanged();};
setInterval(()=>{updateStudentGuidance();persistSession();},5000);document.addEventListener('visibilitychange',()=>{if(document.hidden)persistSession();});window.addEventListener('pagehide',persistSession);window.addEventListener('beforeunload',e=>{if(sessionDirty){e.preventDefault();e.returnValue='';}});
updateStudentGuidance();initializeSession();
