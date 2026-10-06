const profileHeaders=['학년','반','번호','이름','조 이름'];
let studentProfile=null,timerStartedAt=null;
function profileValues(){return studentProfile?[studentProfile.grade,studentProfile.classroom,studentProfile.studentNumber,studentProfile.studentName,studentProfile.groupName]:['','','','',''];}
function safeCSV(value){const str=String(value);return /^[=+@-]/.test(str)&&!/^[-+]\d+(\.\d+)?$/.test(str)?"'"+str:str;}
function shortTime(time){return time.slice(11,19);}
function timerElapsed(){return timerStartedAt===null?null:(performance.now()-timerStartedAt)/1000;}
function renderTimer(){const seconds=timerElapsed();document.querySelector('#timerDisplay').textContent=seconds===null?'00:00':String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(Math.floor(seconds%60)).padStart(2,'0');document.querySelector('#timerNote').textContent=seconds===null?'용액 투입 후 리셋을 누르면 시작합니다.':seconds>=120?'2분 경과 · 측정점을 저장하고 변화도 관찰하세요.':'관찰 중 · 2분을 기준으로 변화를 확인하세요.';}
document.querySelector('#resetTimer').onclick=()=>{timerStartedAt=performance.now();renderTimer();};
setInterval(renderTimer,250);
document.querySelector('#studentForm').onsubmit=event=>{
 event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
 const candidate=Object.fromEntries(new FormData(form));for(const key of ['studentName','groupName']){candidate[key]=candidate[key].trim();const field=form.elements[key];field.setCustomValidity(candidate[key]?'':'공백 없이 정보를 입력하세요.');if(!candidate[key]){field.reportValidity();return;}}
 guideFromExperiment=false;document.querySelector('#guideBack').textContent='학생 정보로 돌아가기';studentProfile=candidate;document.querySelector('#studentSummary').textContent=candidate.grade+'학년 '+candidate.classroom+'반 '+candidate.studentNumber+'번 · '+candidate.studentName+' · '+candidate.groupName;
 showNotebookPage('guide');
 if(typeof pointRevision!=='undefined'&&points.length)pointRevision++;
 if(typeof exportedCount!=='undefined'&&records.length)exportedCount=-1;
 window.scrollTo(0,0);
};
for(const id of ['studentName','groupName'])document.querySelector('#'+id).oninput=event=>event.target.setCustomValidity('');
function showNotebookPage(page){
 for(const id of ['welcome','guide','experiment'])document.querySelector('#'+id).hidden=id!==page;
 window.scrollTo(0,0);
 if(page==='guide')document.querySelector('#guideTitle').focus();
}
let guideFromExperiment=false;
document.querySelector('#editProfile').onclick=()=>showNotebookPage('welcome');
document.querySelector('#openGuide').onclick=()=>{guideFromExperiment=true;document.querySelector('#guideBack').textContent='측정 화면으로 돌아가기';showNotebookPage('guide');};
document.querySelector('#guideBack').onclick=()=>showNotebookPage(guideFromExperiment?'experiment':'welcome');
document.querySelector('#beginExperiment').onclick=()=>{guideFromExperiment=true;showNotebookPage('experiment');};

function renderPointsTable(){
 pointRows.replaceChildren();document.querySelector('#pointCount').textContent=points.length+'개';document.querySelector('#pointsEmpty').hidden=points.length>0;
 for(const p of points.slice(-10).reverse()){
  const row=document.createElement('tr'),cell=document.createElement('td'),button=document.createElement('button');button.className='delete-button';button.setAttribute('aria-label',p.id+'번 측정점 삭제');button.title=p.id+'번 측정점 삭제';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';button.onclick=()=>deletePoint(p.id);cell.appendChild(button);row.appendChild(cell);
  for(const value of [p.id,shortTime(p.time),p.volume.toFixed(2),p.temperature.toFixed(2),p.ph.toFixed(2),p.color,p.waitSeconds===null?'—':p.waitSeconds.toFixed(1),p.state]){const td=document.createElement('td');td.textContent=String(value);row.appendChild(td);}pointRows.appendChild(row);
 }
}
function deletePoint(id){const index=points.findIndex(p=>p.id===id);if(index<0)return;deletedPoint=points.splice(index,1)[0];pointRevision++;document.querySelector('#undoDelete').hidden=false;initialReading.disabled=points.length>0;renderPointsTable();renderVolumeCharts();refreshPoints();pointStatus.textContent=id+'번 측정점을 삭제했습니다. 되돌리기로 복구할 수 있습니다.';}
document.querySelector('#undoDelete').onclick=()=>{if(!deletedPoint)return;const restored=deletedPoint;points.push(restored);points.sort((a,b)=>a.id-b.id);deletedPoint=null;pointRevision++;initialReading.value=restored.initial.toFixed(2);initialReading.disabled=true;document.querySelector('#undoDelete').hidden=true;renderPointsTable();renderVolumeCharts();refreshPoints();pointStatus.textContent=restored.id+'번 측정점을 복구했습니다.';};
